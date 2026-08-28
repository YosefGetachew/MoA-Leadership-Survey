const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cookieParser = require("cookie-parser");
const { ensureSchema, query } = require("./config/db");
const { createStaffSession, getStaffSession, requireStaff, requireAdministrator } = require("./auth");
const { hashPassword, verifyPassword } = require("./password");
const surveySections = require("../frontend/src/levelSurveyQuestions.json");

const app = express();
const PORT = Number(process.env.PORT || 5001);
const ADMIN_COOKIE = "moa_reform_admin";
const RESPONDENT_COOKIE = "moa_leadership_survey_respondent";
const SURVEY_VERSION = "leadership-reform-v2-2026-08-28";
const SCALE_LABELS = { 1: "Strongly disagree", 2: "Disagree", 3: "Neither agree nor disagree", 4: "Agree", 5: "Strongly agree", 6: "N/A" };
const OVERALL_QUESTIONS = [
  ["OR01", "Awareness", "I understand the objectives and intended results of the institutional reform."],
  ["OR02", "Relevance", "The reform priorities are relevant to the institution's responsibilities and current needs."],
  ["OR03", "Implementation", "The planned reform activities are being implemented as intended."],
  ["OR04", "Leadership", "Leaders provide clear direction, ownership and support for implementation of the reform."],
  ["OR05", "Communication", "Information about reform decisions, progress and expectations is communicated clearly and on time."],
  ["OR06", "Impact", "The reform has produced positive and measurable improvements in institutional performance."],
  ["OR07", "Overall assessment", "Overall, I am satisfied with the progress and results of the institutional reform."],
];
const OVERALL_QUESTION_CODES = OVERALL_QUESTIONS.map(([code]) => code);
const LEADERSHIP_POSITIONS = {
  high_level: new Set(["minister", "state_minister", "director_general", "commissioner", "bureau_head", "equivalent_senior_executive"]),
  middle_level: new Set(["lead_executive", "executive", "advisor", "project_coordinator"]),
  lower_level: new Set(["team_leader", "desk_head"]),
};
const sectionsByLevel = new Map(surveySections.map((section) => [section.level, section]));
const allQuestionCodes = surveySections.flatMap((section) => section.questions.map((question) => question.code));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (allowedOrigins.includes(req.headers.origin)) {
    res.header("Access-Control-Allow-Origin", req.headers.origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Headers", "content-type");
    res.header("Access-Control-Allow-Methods", "GET,POST");
    return res.sendStatus(204);
  }
  next();
});

function clean(value, max = 2000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cookieOptions(maxAge) { return { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge, path: "/" }; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function csvValue(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function formatScaleResponse(value) { return Number(value) === 6 ? "N/A" : value ? `${value} - ${SCALE_LABELS[value]}` : ""; }
function sectorCode(value) { return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80); }

app.get("/", (_req, res) => res.json({ service: "MoA Leadership Assessment Survey API", status: "ok" }));
app.get("/api/health", async (_req, res, next) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", database: "connected", surveyVersion: SURVEY_VERSION });
  } catch (error) { next(error); }
});

app.get("/api/survey/sectors", async (req, res, next) => {
  try {
    const leadershipLevel = clean(req.query.leadershipLevel, 30);
    const leadershipPosition = clean(req.query.leadershipPosition, 80);
    if (!sectionsByLevel.has(leadershipLevel)) return res.status(400).json({ error: "Select a valid leadership level before loading sectors." });
    if (!LEADERSHIP_POSITIONS[leadershipLevel]?.has(leadershipPosition)) return res.status(400).json({ error: "Select a valid leadership position before loading sectors." });
    const sectors = await query(
      `SELECT code AS value,name_en AS label,name_am AS "labelAm" FROM survey_sectors WHERE active=true AND leadership_level=$1 AND leadership_position=$2 ORDER BY sort_order,name_en`,
      [leadershipLevel, leadershipPosition],
    );
    res.json({ sectors });
  } catch (error) { next(error); }
});

app.get("/api/survey/status", async (req, res, next) => {
  try {
    const token = clean(req.cookies?.[RESPONDENT_COOKIE], 100);
    if (!token) return res.json({ submitted: false });
    const existing = await query(
      `SELECT leadership_level AS "leadershipLevel",completed_at AS "completedAt"
       FROM leadership_assessment_responses WHERE respondent_token=$1 AND survey_version=$2 LIMIT 1`,
      [token, SURVEY_VERSION],
    );
    res.json(existing[0] ? { submitted: true, ...existing[0] } : { submitted: false });
  } catch (error) { next(error); }
});

app.post("/api/survey/restart", (_req, res) => {
  res.clearCookie(RESPONDENT_COOKIE, cookieOptions(0));
  res.json({ ready: true });
});

app.post("/api/survey/responses", async (req, res, next) => {
  try {
    const leadershipLevel = clean(req.body.leadershipLevel, 30);
    const section = sectionsByLevel.get(leadershipLevel);
    if (!section) return res.status(400).json({ error: "Select a valid leadership level." });
    const evaluatedLeadershipPosition = clean(req.body.evaluatedLeadershipPosition, 80);
    if (!LEADERSHIP_POSITIONS[leadershipLevel]?.has(evaluatedLeadershipPosition)) return res.status(400).json({ error: "Select a leadership position that matches the leadership level." });
    const selectedSector = clean(req.body.evaluatedSector, 80);
    const registeredSector = (await query(
      `SELECT code FROM survey_sectors WHERE code=$1 AND leadership_level=$2 AND leadership_position=$3 AND active=true LIMIT 1`,
      [selectedSector, leadershipLevel, evaluatedLeadershipPosition],
    ))[0];
    if (!registeredSector) return res.status(400).json({ error: "Select an active sector or institution registered by an administrator." });
    const evaluatorName = clean(req.body.evaluatorName, 160) || null;
    const evaluatorOrganization = clean(req.body.evaluatorOrganization, 180) || null;
    const evaluatorPosition = clean(req.body.evaluatorPosition, 160) || null;
    const evaluatorContact = clean(req.body.evaluatorContact, 180) || null;
    const supplied = req.body.responses && typeof req.body.responses === "object" && !Array.isArray(req.body.responses) ? req.body.responses : {};
    const suppliedOverall = req.body.overallResponses && typeof req.body.overallResponses === "object" && !Array.isArray(req.body.overallResponses) ? req.body.overallResponses : {};
    const expectedCodes = section.questions.map((question) => question.code);
    const normalized = {};
    const normalizedOverall = {};
    for (const code of OVERALL_QUESTION_CODES) {
      const score = Number(suppliedOverall[code]);
      if (!Number.isInteger(score) || score < 1 || score > 6) return res.status(400).json({ error: "Please answer every overall reform statement before submitting." });
      normalizedOverall[code] = score;
    }
    if (Object.keys(suppliedOverall).some((code) => !OVERALL_QUESTION_CODES.includes(code))) return res.status(400).json({ error: "The response contains an unknown overall reform question." });
    for (const code of expectedCodes) {
      const score = Number(supplied[code]);
      if (!Number.isInteger(score) || score < 1 || score > 6) return res.status(400).json({ error: "Please answer every statement before submitting." });
      normalized[code] = score;
    }
    if (Object.keys(supplied).some((code) => !expectedCodes.includes(code))) return res.status(400).json({ error: "The response contains questions outside the selected leadership level." });
    const respondentToken = clean(req.cookies?.[RESPONDENT_COOKIE], 100) || crypto.randomUUID();
    const naCount = [...Object.values(normalizedOverall), ...Object.values(normalized)].filter((score) => score === 6).length;
    const rows = await query(
      `INSERT INTO leadership_assessment_responses
       (survey_version,leadership_level,evaluated_leadership_position,evaluated_sector,evaluator_name,evaluator_organization,evaluator_position,evaluator_contact,overall_responses,responses,answered_count,na_count,respondent_token)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13) RETURNING id,completed_at AS "completedAt"`,
      [SURVEY_VERSION, leadershipLevel, evaluatedLeadershipPosition, selectedSector, evaluatorName, evaluatorOrganization, evaluatorPosition, evaluatorContact, JSON.stringify(normalizedOverall), JSON.stringify(normalized), expectedCodes.length + OVERALL_QUESTION_CODES.length, naCount, respondentToken],
    );
    res.cookie(RESPONDENT_COOKIE, respondentToken, cookieOptions(365 * 24 * 60 * 60 * 1000));
    res.status(201).json({ saved: true, responseId: rows[0].id, completedAt: rows[0].completedAt });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "A response from this browser has already been submitted." });
    next(error);
  }
});

app.post("/api/admin/login", async (req, res, next) => {
  try {
    if (!process.env.MINISTRY_ADMIN_SESSION) return res.status(503).json({ error: "Staff access is not configured." });
    const username = clean(req.body.username, 80);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const user = (await query(
      `SELECT username,password_hash AS "passwordHash",display_name AS "displayName",role,active FROM admin_users WHERE lower(username)=lower($1) LIMIT 1`,
      [username],
    ))[0];
    if (!user?.active || !(await verifyPassword(password, user.passwordHash))) return res.status(401).json({ error: "Incorrect username or password." });
    res.cookie(ADMIN_COOKIE, createStaffSession(user), cookieOptions(8 * 60 * 60 * 1000));
    res.json({ authorized: true, displayName: user.displayName, role: user.role });
  } catch (error) { next(error); }
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE, cookieOptions(0));
  res.json({ authorized: false });
});
app.get("/api/admin/session", (req, res) => {
  const session = getStaffSession(req);
  res.json(session ? { authorized: true, ...session } : { authorized: false });
});

app.get("/api/admin/survey-results", requireStaff, async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT r.id,r.leadership_level AS "leadershipLevel",r.evaluated_leadership_position AS "evaluatedLeadershipPosition",r.evaluated_sector AS "evaluatedSector",s.name_en AS "evaluatedSectorName",r.evaluator_name AS "evaluatorName",
              r.evaluator_organization AS "evaluatorOrganization",r.evaluator_position AS "evaluatorPosition",r.evaluator_contact AS "evaluatorContact",
              r.overall_responses AS "overallResponses",r.responses,r.answered_count AS "answeredCount",r.na_count AS "naCount",r.completed_at AS "completedAt"
       FROM leadership_assessment_responses r LEFT JOIN survey_sectors s ON s.code=r.evaluated_sector
       WHERE r.survey_version=$1 ORDER BY r.completed_at DESC`,
      [SURVEY_VERSION],
    );
    const levelCounts = Object.fromEntries(surveySections.map((section) => [section.level, 0]));
    const itemScores = new Map([...OVERALL_QUESTION_CODES, ...allQuestionCodes].map((code) => [code, []]));
    let scoreCount = 0;
    let naCount = 0;
    rows.forEach((row) => {
      levelCounts[row.leadershipLevel] += 1;
      Object.entries(row.overallResponses || {}).forEach(([code, rawScore]) => {
        const score = Number(rawScore);
        if (score === 6) naCount += 1;
        else if (score >= 1 && score <= 5) { scoreCount += 1; itemScores.get(code)?.push(score); }
      });
      Object.entries(row.responses || {}).forEach(([code, rawScore]) => {
        const score = Number(rawScore);
        if (score === 6) naCount += 1;
        else if (score >= 1 && score <= 5) {
          scoreCount += 1;
          itemScores.get(code)?.push(score);
        }
      });
    });
    const overallItems = OVERALL_QUESTIONS.map(([code, dimension, text]) => {
      const values = itemScores.get(code) || [];
      const itemAverage = average(values);
      return { code, text, dimension, leadershipLevel: "overall", responses: values.length, average: itemAverage === null ? null : Number(itemAverage.toFixed(2)) };
    });
    const leadershipItems = surveySections.flatMap((section) => section.questions.map((question) => {
      const values = itemScores.get(question.code) || [];
      const itemAverage = average(values);
      return { code: question.code, text: question.text, leadershipLevel: section.level, responses: values.length, average: itemAverage === null ? null : Number(itemAverage.toFixed(2)) };
    }));
    const items = [...overallItems, ...leadershipItems];
    const weightedTotal = items.reduce((sum, item) => sum + (item.average || 0) * item.responses, 0);
    res.json({
      version: SURVEY_VERSION,
      summary: {
        totalResponses: rows.length,
        levelCounts,
        averageScore: scoreCount ? Number((weightedTotal / scoreCount).toFixed(2)) : null,
        naRate: scoreCount + naCount ? Number((naCount / (scoreCount + naCount) * 100).toFixed(1)) : 0,
        completeRate: rows.length ? 100 : 0,
      },
      items,
      recentResponses: rows.slice(0, 100),
    });
  } catch (error) { next(error); }
});

app.get("/api/admin/survey-results.csv", requireStaff, async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT id,leadership_level,evaluated_leadership_position,evaluated_sector,evaluator_name,evaluator_organization,evaluator_position,evaluator_contact,completed_at,overall_responses,responses
       FROM leadership_assessment_responses WHERE survey_version=$1 ORDER BY completed_at`,
      [SURVEY_VERSION],
    );
    const header = ["response_id", "leadership_level", "evaluated_leadership_position", "evaluated_sector", "evaluator_name", "evaluator_organization", "evaluator_position", "evaluator_contact", "completed_at", ...OVERALL_QUESTION_CODES, ...allQuestionCodes];
    const lines = [header.map(csvValue).join(",")];
    rows.forEach((row) => {
      lines.push([row.id, row.leadership_level, row.evaluated_leadership_position, row.evaluated_sector, row.evaluator_name, row.evaluator_organization, row.evaluator_position, row.evaluator_contact, row.completed_at.toISOString(), ...OVERALL_QUESTION_CODES.map((code) => formatScaleResponse(row.overall_responses?.[code])), ...allQuestionCodes.map((code) => formatScaleResponse(row.responses?.[code]))].map(csvValue).join(","));
    });
    res.type("text/csv").attachment(`leadership-assessment-${new Date().toISOString().slice(0, 10)}.csv`).send(lines.join("\n"));
  } catch (error) { next(error); }
});

app.get("/api/admin/users", requireAdministrator, async (_req, res, next) => {
  try { res.json({ users: await query(`SELECT id,username,display_name AS "displayName",role,active,created_at AS "createdAt" FROM admin_users ORDER BY created_at DESC`) }); }
  catch (error) { next(error); }
});

app.get("/api/admin/sectors", requireAdministrator, async (_req, res, next) => {
  try {
    const sectors = await query(`SELECT id,code,name_en AS "nameEn",name_am AS "nameAm",leadership_level AS "leadershipLevel",leadership_position AS "leadershipPosition",active,sort_order AS "sortOrder",created_at AS "createdAt" FROM survey_sectors ORDER BY leadership_level,leadership_position,sort_order,name_en`);
    res.json({ sectors });
  } catch (error) { next(error); }
});

app.post("/api/admin/sectors", requireAdministrator, async (req, res, next) => {
  try {
    const nameEn = clean(req.body.nameEn, 160);
    const nameAm = clean(req.body.nameAm, 160) || null;
    const leadershipLevel = clean(req.body.leadershipLevel, 30);
    const leadershipPosition = clean(req.body.leadershipPosition, 80);
    const code = sectorCode(`${leadershipLevel}_${leadershipPosition}_${nameEn}`);
    const sortOrder = Number.isInteger(Number(req.body.sortOrder)) ? Math.max(0, Math.min(9999, Number(req.body.sortOrder))) : 100;
    if (!sectionsByLevel.has(leadershipLevel)) return res.status(400).json({ error: "Select a valid leadership level." });
    if (!LEADERSHIP_POSITIONS[leadershipLevel]?.has(leadershipPosition)) return res.status(400).json({ error: "Select a leadership position that matches the leadership level." });
    if (nameEn.length < 2 || code.length < 2) return res.status(400).json({ error: "Enter a valid English sector or institution name." });
    const rows = await query(
      `INSERT INTO survey_sectors(code,name_en,name_am,leadership_level,leadership_position,sort_order,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,code,name_en AS "nameEn",name_am AS "nameAm",leadership_level AS "leadershipLevel",leadership_position AS "leadershipPosition",active,sort_order AS "sortOrder",created_at AS "createdAt"`,
      [code, nameEn, nameAm, leadershipLevel, leadershipPosition, sortOrder, req.staff.username],
    );
    res.status(201).json({ sector: rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That sector or institution is already registered." });
    next(error);
  }
});

app.post("/api/admin/sectors/:id", requireAdministrator, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const nameEn = clean(req.body.nameEn, 160);
    const nameAm = clean(req.body.nameAm, 160) || null;
    const leadershipLevel = clean(req.body.leadershipLevel, 30);
    const leadershipPosition = clean(req.body.leadershipPosition, 80);
    const sortOrder = Number.isInteger(Number(req.body.sortOrder)) ? Math.max(0, Math.min(9999, Number(req.body.sortOrder))) : 100;
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Select a valid sector or institution." });
    if (!sectionsByLevel.has(leadershipLevel)) return res.status(400).json({ error: "Select a valid leadership level." });
    if (!LEADERSHIP_POSITIONS[leadershipLevel]?.has(leadershipPosition)) return res.status(400).json({ error: "Select a leadership position that matches the leadership level." });
    if (nameEn.length < 2) return res.status(400).json({ error: "Enter a valid English sector or institution name." });
    const rows = await query(
      `UPDATE survey_sectors SET name_en=$1,name_am=$2,leadership_level=$3,leadership_position=$4,sort_order=$5,updated_at=now() WHERE id=$6
       RETURNING id,code,name_en AS "nameEn",name_am AS "nameAm",leadership_level AS "leadershipLevel",leadership_position AS "leadershipPosition",active,sort_order AS "sortOrder",created_at AS "createdAt"`,
      [nameEn, nameAm, leadershipLevel, leadershipPosition, sortOrder, id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Sector or institution not found." });
    res.json({ sector: rows[0] });
  } catch (error) { next(error); }
});

app.post("/api/admin/sectors/:id/toggle", requireAdministrator, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Select a valid sector or institution." });
    const rows = await query(
      `UPDATE survey_sectors SET active=NOT active,updated_at=now() WHERE id=$1
       RETURNING id,code,name_en AS "nameEn",name_am AS "nameAm",leadership_level AS "leadershipLevel",active,sort_order AS "sortOrder"`,
      [id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Sector or institution not found." });
    res.json({ sector: rows[0] });
  } catch (error) { next(error); }
});
app.post("/api/admin/users", requireAdministrator, async (req, res, next) => {
  try {
    const username = clean(req.body.username, 80);
    const displayName = clean(req.body.displayName, 120);
    const password = String(req.body.password || "");
    const role = clean(req.body.role, 20);
    if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username) || !displayName || password.length < 10 || !["admin", "viewer"].includes(role)) return res.status(400).json({ error: "Use a valid username, name, role and a password of at least 10 characters." });
    const rows = await query(
      `INSERT INTO admin_users(username,password_hash,display_name,role) VALUES($1,$2,$3,$4) RETURNING id,username,display_name AS "displayName",role,active`,
      [username, await hashPassword(password), displayName, role],
    );
    res.status(201).json({ user: rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That username already exists." });
    next(error);
  }
});

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ error: "The server could not complete this request." });
});

ensureSchema()
  .then(() => app.listen(PORT, process.env.HOST || "127.0.0.1", () => console.log(`MoA Leadership Survey API listening on port ${PORT}`)))
  .catch((error) => { console.error("Startup failed:", error); process.exit(1); });
