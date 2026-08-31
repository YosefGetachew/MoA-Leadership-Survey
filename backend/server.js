const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cookieParser = require("cookie-parser");
const { ensureSchema, query, withTransaction } = require("./config/db");
const { createStaffSession, getStaffSession, requireStaff, requireAdministrator } = require("./auth");
const { hashPassword, verifyPassword } = require("./password");
const surveySections = require("../frontend/src/levelSurveyQuestions.json");

const app = express();
const PORT = Number(process.env.PORT || 5001);
const ADMIN_COOKIE = "moa_reform_admin";
const RESPONDENT_COOKIE = "moa_leadership_survey_respondent";
const ADMIN_ATTEMPT_COOKIE = "moa_leadership_admin_attempt";
const { SURVEY_VERSION, PREVIOUS_SURVEY_VERSION, LEGACY_SURVEY_VERSION, LEADERSHIP_POSITIONS, validateSubmission } = require("./survey-validation");
const { buildSurveyCsv } = require("./survey-csv");
const { buildSurveyAnalytics, parseFilters } = require("./survey-analytics");
const { getAvailability, lockControl, assertOpen, changeWindow } = require("./survey-window");
const sectionsByLevel = new Map(surveySections.map((section) => [section.level, section]));
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
function responseToken(req, publicToken) {
  const staff = getStaffSession(req);
  const attempt = clean(req.cookies?.[ADMIN_ATTEMPT_COOKIE], 100);
  if (staff?.role === 'admin' && /^[0-9a-f-]{36}$/.test(attempt)) {
    const identity = crypto.createHash('sha256').update(staff.username).digest('hex');
    return `admin:${identity}:${attempt}`;
  }
  return publicToken;
}
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
    if (!LEADERSHIP_POSITIONS[leadershipLevel]?.has(leadershipPosition)) return res.status(400).json({ error: "Select a leadership position before loading sectors or institutions." });
    const sectors = await query(`SELECT code AS value,name_en AS label,name_am AS "labelAm" FROM survey_sectors WHERE active=true AND leadership_level=$1 AND leadership_position=$2 ORDER BY sort_order,name_en`, [leadershipLevel, leadershipPosition]);
    res.json({ sectors });
  } catch (error) { next(error); }
});

app.get("/api/survey/status", async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const availability = await getAvailability(query);
    const token = clean(req.cookies?.[RESPONDENT_COOKIE], 100) || crypto.randomUUID();
    const canSubmitAnother = getStaffSession(req)?.role === 'admin';
    if (!req.cookies?.[RESPONDENT_COOKIE]) res.cookie(RESPONDENT_COOKIE, token, cookieOptions(365 * 24 * 60 * 60 * 1000));
    if (!availability.period) return res.json({ submitted: false, availability, canSubmitAnother });
    const existing = await query(
      `SELECT leadership_level AS "leadershipLevel",completed_at AS "completedAt"
       FROM leadership_assessment_responses WHERE respondent_token=$1 AND survey_version=$2 LIMIT 1`,
      [`period:${availability.period.id}:${responseToken(req, token)}`, SURVEY_VERSION],
    );
    res.json({ submitted: Boolean(existing[0]), availability, canSubmitAnother });
  } catch (error) { next(error); }
});

// Only authenticated administrators can request a new attempt. The ordinary
// respondent cookie is retained, so signing out cannot reset its submission limit.
app.post("/api/survey/restart", requireAdministrator, async (req, res, next) => {
  try {
    await withTransaction(async transactionQuery => {
      await lockControl(transactionQuery);
      const availability = await getAvailability(transactionQuery);
      assertOpen(availability, req.body.periodId);
      const token = responseToken(req, clean(req.cookies?.[RESPONDENT_COOKIE], 100));
      const existing = await transactionQuery('SELECT id FROM leadership_assessment_responses WHERE respondent_token=$1 AND survey_version=$2 LIMIT 1', [`period:${availability.period.id}:${token}`, SURVEY_VERSION]);
      if (!existing.length) throw Object.assign(new Error('Complete your current evaluation before starting another.'), { statusCode: 409, code: 'ASSESSMENT_NOT_COMPLETED' });
    });
    res.cookie(ADMIN_ATTEMPT_COOKIE, crypto.randomUUID(), cookieOptions(8 * 60 * 60 * 1000));
    res.set('Cache-Control', 'no-store').json({ restarted: true });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    next(error);
  }
});

app.post("/api/survey/responses", async (req, res, next) => {
  try {
    const data = validateSubmission(req.body);
    const respondentToken = clean(req.cookies?.[RESPONDENT_COOKIE], 100);
    const rows = await withTransaction(async transactionQuery => {
      // Serializes submission acceptance with admin on/off changes.
      await lockControl(transactionQuery);
      const availability = await getAvailability(transactionQuery);
      assertOpen(availability, req.body.periodId);
      if (!respondentToken) throw Object.assign(new Error("Reload the survey and allow cookies before submitting."), { statusCode: 428, code: "SURVEY_SESSION_REQUIRED" });
      const saved = await transactionQuery(
      `INSERT INTO leadership_assessment_responses
       (survey_version,leadership_level,evaluator_level,sex,age,work_experience,responses,answered_count,na_count,respondent_token,survey_period_id)
       SELECT $1,'all_levels',$2,$3,$4,$5,$6::jsonb,$7,$8,$9,p.id FROM survey_periods p
       WHERE p.id=$10 AND p.closed_at IS NULL AND p.starts_at<=clock_timestamp() AND p.ends_at>clock_timestamp()
       RETURNING id,completed_at AS "completedAt"`,
      [SURVEY_VERSION, data.evaluatorLevel, data.sex, data.age, data.workExperience,
        JSON.stringify(data.responses), data.answeredCount, data.naCount, `period:${availability.period.id}:${responseToken(req, respondentToken)}`, availability.period.id],
      );
      if (!saved.length) throw Object.assign(new Error("There is no survey at this time."), { statusCode: 403, code: "SURVEY_CLOSED" });
      return saved;
    });
    res.cookie(RESPONDENT_COOKIE, respondentToken, cookieOptions(365 * 24 * 60 * 60 * 1000));
    res.status(201).json({ saved: true, responseId: rows[0].id, completedAt: rows[0].completedAt });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    if (error.code === "23505") return res.status(409).json({ error: "A response from this browser has already been submitted for this survey period.", code: "ALREADY_SUBMITTED" });
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

app.get("/api/admin/survey-window", requireAdministrator, async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json(await getAvailability(query)); }
  catch (error) { next(error); }
});

app.post("/api/admin/survey-window", requireAdministrator, async (req, res, next) => {
  try {
    const status = await withTransaction(transactionQuery => changeWindow(transactionQuery, req.body, req.staff.username));
    res.set("Cache-Control", "no-store").json(status);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

app.get("/api/admin/survey-results", requireStaff, async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    const rows = await query(
      `SELECT r.id,r.leadership_level AS "leadershipLevel",r.evaluator_level AS "evaluatorLevel",
              r.survey_version AS "surveyVersion",r.sex,r.age,r.work_experience AS "workExperience",
              r.responses,r.completed_at AS "completedAt"
       FROM leadership_assessment_responses r
       WHERE r.survey_version IN ($1,$2,$3) ORDER BY r.completed_at DESC`,
      [SURVEY_VERSION, PREVIOUS_SURVEY_VERSION, LEGACY_SURVEY_VERSION],
    );
    res.set("Cache-Control", "no-store").json(buildSurveyAnalytics(rows, filters));
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ error: error.message });
    next(error);
  }
});

app.get("/api/admin/survey-results.csv", requireStaff, async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT id,survey_version,leadership_level,evaluator_level,
              sex,age,work_experience,completed_at,responses
       FROM leadership_assessment_responses WHERE survey_version IN ($1,$2,$3) ORDER BY completed_at DESC`,
      [SURVEY_VERSION, PREVIOUS_SURVEY_VERSION, LEGACY_SURVEY_VERSION],
    );
    res.type("text/csv; charset=utf-8").attachment(`leadership-assessment-${new Date().toISOString().slice(0, 10)}.csv`).send(buildSurveyCsv(rows));
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
    const code = sectorCode(`${leadershipPosition}_${nameEn}`);
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
       RETURNING id,code,name_en AS "nameEn",name_am AS "nameAm",leadership_level AS "leadershipLevel",leadership_position AS "leadershipPosition",active,sort_order AS "sortOrder"`,
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

if (require.main === module) {
  ensureSchema()
    .then(() => app.listen(PORT, process.env.HOST || "127.0.0.1", () => console.log(`MoA Leadership Survey API listening on port ${PORT}`)))
    .catch(error => { console.error("Startup failed:", error); process.exit(1); });
}
module.exports = app;
