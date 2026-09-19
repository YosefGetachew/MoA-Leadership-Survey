const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cookieParser = require("cookie-parser");
const { ensureSchema, query, withTransaction } = require("./config/db");
const { createStaffSession, getStaffSession, requireStaff, requireAdministrator, requireSurveyManager, requireResultsReader } = require("./auth");
const { hashPassword, verifyPassword } = require("./password");
const { invitationSettings, sendInvitation, sendPasswordReset } = require("./invitation-mail");

const app = express();
const PORT = Number(process.env.PORT || 5001);
const ADMIN_COOKIE = "moa_reform_admin";
const RESPONDENT_COOKIE = "moa_leadership_survey_respondent";
const ADMIN_ATTEMPT_COOKIE = "moa_leadership_admin_attempt";
const { SURVEY_VERSION, PREVIOUS_SURVEY_VERSION, LEGACY_SURVEY_VERSION, LEADERSHIP_POSITIONS, validateSubmission } = require("./survey-validation");
const { buildSurveyCsv } = require("./survey-csv");
const { buildSurveyAnalytics, parseFilters } = require("./survey-analytics");
const { getAvailability, lockControl, assertOpen, changeWindow } = require("./survey-window");
const { QUESTION_CATEGORIES, QUESTION_CODE_PATTERN, getQuestionSections, getOpenEndedQuestions, questionCodes } = require("./question-bank");
const { normalizeId, listSurveys, getSurvey, createSurvey, updateSurvey } = require("./survey-catalog");
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function invitationToken() { return crypto.randomBytes(32).toString("base64url"); }
function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
app.locals.sendInvitation = sendInvitation;
app.locals.sendPasswordReset = sendPasswordReset;

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
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH");
    return res.sendStatus(204);
  }
  next();
});
app.use(async (req, _res, next) => {
  try {
    const signed = getStaffSession(req);
    if (signed) {
      const rows = await query(`SELECT username,display_name AS "displayName",role,active,must_change_password AS "mustChangePassword",
        session_version AS "sessionVersion" FROM admin_users WHERE lower(username)=lower($1) LIMIT 1`, [signed.username]);
      const user = rows[0];
      if (user?.active && !user.mustChangePassword && user.sessionVersion === signed.sessionVersion) req.staff = user;
    }
    next();
  } catch (error) { next(error); }
});

function clean(value, max = 2000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cookieOptions(maxAge) { return { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge, path: "/" }; }
function responseToken(req, publicToken) {
  const staff = req.staff;
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

app.get("/api/survey/questions", async (_req, res, next) => {
  try {
    const availability = await getAvailability(query);
    const surveyId = Number(availability.survey.id);
    const [sections, openQuestions] = await Promise.all([
      getQuestionSections(query, { surveyId }),
      getOpenEndedQuestions(query, { surveyId }),
    ]);
    res.set("Cache-Control", "no-store").json({ survey: availability.survey, sections, openQuestions });
  } catch (error) { next(error); }
});

app.get("/api/survey/sectors", async (req, res, next) => {
  try {
    const leadershipLevel = clean(req.query.leadershipLevel, 30);
    const leadershipPosition = clean(req.query.leadershipPosition, 80);
    if (!QUESTION_CATEGORIES.has(leadershipLevel)) return res.status(400).json({ error: "Select a valid leadership level before loading sectors." });
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
    const canSubmitAnother = req.staff?.role === 'admin';
    if (!req.cookies?.[RESPONDENT_COOKIE]) res.cookie(RESPONDENT_COOKIE, token, cookieOptions(365 * 24 * 60 * 60 * 1000));
    if (!availability.period) return res.json({ submitted: false, availability, canSubmitAnother });
    const existing = await query(
      `SELECT leadership_level AS "leadershipLevel",completed_at AS "completedAt"
       FROM leadership_assessment_responses WHERE respondent_token=$1 AND survey_id=$2 LIMIT 1`,
      [`period:${availability.period.id}:${responseToken(req, token)}`, Number(availability.survey.id)],
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
      const existing = await transactionQuery('SELECT id FROM leadership_assessment_responses WHERE respondent_token=$1 AND survey_id=$2 LIMIT 1', [`period:${availability.period.id}:${token}`, Number(availability.survey.id)]);
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
    const respondentToken = clean(req.cookies?.[RESPONDENT_COOKIE], 100);
    const rows = await withTransaction(async transactionQuery => {
      // Serializes submission acceptance with admin on/off changes.
      await lockControl(transactionQuery);
      const availability = await getAvailability(transactionQuery);
      assertOpen(availability, req.body.periodId);
      if (req.body.surveyId != null && String(req.body.surveyId) !== availability.survey.id) throw Object.assign(new Error('The published survey has changed. Please reload and begin again.'), { statusCode: 409, code: 'SURVEY_CHANGED' });
      const sections = await getQuestionSections(transactionQuery, { surveyId: Number(availability.survey.id) });
      const openQuestions = await getOpenEndedQuestions(transactionQuery, { surveyId: Number(availability.survey.id) });
      if (openQuestions.length !== 3 || !['GQ1', 'GQ2', 'GQ3'].every(code => openQuestions.some(question => question.code === code))) {
        throw Object.assign(new Error('The required open-ended questions are not configured. Ask the survey administrator to run the database migration.'), { statusCode: 503, code: 'OPEN_QUESTIONS_NOT_CONFIGURED' });
      }
      const data = validateSubmission(req.body, questionCodes(sections), openQuestions.map(question => question.code));
      if (!respondentToken) throw Object.assign(new Error("Reload the survey and allow cookies before submitting."), { statusCode: 428, code: "SURVEY_SESSION_REQUIRED" });
      const saved = await transactionQuery(
      `INSERT INTO leadership_assessment_responses
       (survey_id,survey_version,leadership_level,evaluator_level,sex,age,work_experience,responses,open_ended_responses,answered_count,na_count,respondent_token,survey_period_id)
       SELECT $1,$2,'all_levels',$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,p.id FROM survey_periods p
       WHERE p.id=$12 AND p.survey_id=$1 AND p.closed_at IS NULL AND p.starts_at<=clock_timestamp() AND p.ends_at>clock_timestamp()
       RETURNING id,completed_at AS "completedAt"`,
      [Number(availability.survey.id), SURVEY_VERSION, data.evaluatorLevel, data.sex, data.age, data.workExperience,
        JSON.stringify(data.responses), JSON.stringify(data.openEndedResponses), data.answeredCount, data.naCount, `period:${availability.period.id}:${responseToken(req, respondentToken)}`, availability.period.id],
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
    const username = clean(req.body.username, 254);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const user = (await query(
      `SELECT username,password_hash AS "passwordHash",display_name AS "displayName",role,active,must_change_password AS "mustChangePassword",
        session_version AS "sessionVersion" FROM admin_users WHERE lower(username)=lower($1) LIMIT 1`,
      [username],
    ))[0];
    if (!user?.active || !(await verifyPassword(password, user.passwordHash))) return res.status(401).json({ error: "Incorrect username or password." });
    if (user.mustChangePassword) return res.status(403).json({ error: "Finish setting your password using the invitation email before signing in." });
    res.cookie(ADMIN_COOKIE, createStaffSession(user), cookieOptions(8 * 60 * 60 * 1000));
    res.json({ authorized: true, username: user.username, displayName: user.displayName, role: user.role });
  } catch (error) { next(error); }
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE, cookieOptions(0));
  res.json({ authorized: false });
});
app.post("/api/admin/forgot-password", async (req, res, next) => {
  try {
    const username = clean(req.body.username, 254);
    if (username.length >= 3 && username.length <= 254 && !/\s/.test(username)) {
      const user = (await query(`SELECT id,email,display_name AS "displayName" FROM admin_users
        WHERE lower(username)=lower($1) AND active=true LIMIT 1`, [username]))[0];
      if (user?.email) {
        const token = invitationToken();
        const issued = await query(`INSERT INTO admin_password_resets(user_id,token_hash,expires_at)
          VALUES($1,$2,now()+interval '1 hour')
          ON CONFLICT (user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=now()
          WHERE admin_password_resets.created_at < now()-interval '15 minutes'
          RETURNING user_id`, [user.id, tokenHash(token)]);
        if (issued.length) {
          try { await app.locals.sendPasswordReset({ email: user.email, displayName: user.displayName, token }); }
          catch (error) {
            console.error("Password reset email delivery failed:", error.code || error.message);
            await query(`DELETE FROM admin_password_resets WHERE user_id=$1 AND token_hash=$2`, [user.id, tokenHash(token)]);
          }
        }
      } else if (user) {
        await query(`INSERT INTO password_reset_requests(user_id) VALUES($1)
          ON CONFLICT (user_id) DO UPDATE SET requested_at=now(),resolved_at=NULL
          WHERE password_reset_requests.resolved_at IS NOT NULL
            OR password_reset_requests.requested_at < now() - interval '15 minutes'`, [user.id]);
      }
    }
    res.set("Cache-Control", "no-store").status(202).json({ message: "If this is an active email account, a password reset link will be sent. Accounts without email require administrator assistance." });
  } catch (error) { next(error); }
});
app.post("/api/admin/reset-password", async (req, res, next) => {
  try {
    const token = clean(req.body.token, 100);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || password.length < 8 || password.length > 256) {
      return res.status(400).json({ error: "Use a valid password reset link and a password of 8 to 256 characters." });
    }
    const changed = await withTransaction(async transactionQuery => {
      const reset = (await transactionQuery(`SELECT r.user_id AS "userId",u.username
        FROM admin_password_resets r JOIN admin_users u ON u.id=r.user_id
        WHERE r.token_hash=$1 AND r.expires_at>now() AND u.active=true FOR UPDATE OF r,u`, [tokenHash(token)]))[0];
      if (!reset) return null;
      await transactionQuery(`UPDATE admin_users SET password_hash=$2,must_change_password=false,session_version=session_version+1 WHERE id=$1`, [reset.userId, await hashPassword(password)]);
      await transactionQuery(`DELETE FROM admin_password_resets WHERE user_id=$1`, [reset.userId]);
      await transactionQuery(`DELETE FROM admin_invitations WHERE user_id=$1`, [reset.userId]);
      await transactionQuery(`UPDATE password_reset_requests SET resolved_at=now() WHERE user_id=$1 AND resolved_at IS NULL`, [reset.userId]);
      return reset;
    });
    if (!changed) return res.status(400).json({ error: "This password reset link is invalid or expired. Request a new one." });
    res.set("Cache-Control", "no-store").json({ reset: true, username: changed.username });
  } catch (error) { next(error); }
});
app.post("/api/admin/accept-invitation", async (req, res, next) => {
  try {
    const token = clean(req.body.token, 100);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || password.length < 8 || password.length > 256) {
      return res.status(400).json({ error: "Use a valid invitation link and a password of 8 to 256 characters." });
    }
    const activated = await withTransaction(async transactionQuery => {
      const invitation = (await transactionQuery(`SELECT i.user_id AS "userId",u.username
        FROM admin_invitations i JOIN admin_users u ON u.id=i.user_id
        WHERE i.token_hash=$1 AND i.expires_at>now() AND u.active=true AND u.must_change_password=true FOR UPDATE OF i,u`, [tokenHash(token)]))[0];
      if (!invitation) return null;
      await transactionQuery(`UPDATE admin_users SET password_hash=$2,must_change_password=false,session_version=session_version+1 WHERE id=$1`, [invitation.userId, await hashPassword(password)]);
      await transactionQuery(`DELETE FROM admin_invitations WHERE user_id=$1`, [invitation.userId]);
      return invitation;
    });
    if (!activated) return res.status(400).json({ error: "This invitation is invalid or expired. Ask an administrator to resend it." });
    res.set("Cache-Control", "no-store").json({ activated: true, username: activated.username });
  } catch (error) { next(error); }
});
app.get("/api/admin/session", (req, res) => {
  const session = req.staff;
  res.set("Cache-Control", "no-store").json(session ? { authorized: true, ...session } : { authorized: false });
});

app.get("/api/admin/surveys", requireStaff, async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json({ surveys: await listSurveys(query) }); }
  catch (error) { next(error); }
});

app.post("/api/admin/surveys", requireSurveyManager, async (req, res, next) => {
  try {
    const survey = await withTransaction(transactionQuery => createSurvey(transactionQuery, req.body, req.staff.username));
    const surveys = await listSurveys(query);
    res.status(201).json({ survey: surveys.find(item => item.id === survey.id) || survey, surveys });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    next(error);
  }
});

app.patch("/api/admin/surveys/:id", requireSurveyManager, async (req, res, next) => {
  try {
    const surveyId = normalizeId(req.params.id);
    const availability = await getAvailability(query);
    if (availability.survey?.id === String(surveyId) && availability.state !== 'closed') return res.status(409).json({ error: 'Close this survey collection before changing its questionnaire settings.', code: 'SURVEY_WINDOW_ACTIVE' });
    const survey = await updateSurvey(query, surveyId, req.body);
    const surveys = await listSurveys(query);
    res.json({ survey: surveys.find(item => item.id === survey.id) || survey, surveys });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    next(error);
  }
});

app.post("/api/admin/surveys/:id/publish", requireSurveyManager, async (req, res, next) => {
  try {
    const surveyId = normalizeId(req.params.id);
    const survey = await withTransaction(async transactionQuery => {
      await lockControl(transactionQuery);
      const availability = await getAvailability(transactionQuery);
      if (availability.state !== 'closed') throw Object.assign(new Error('Close the current collection period before publishing another survey.'), { statusCode: 409, code: 'SURVEY_WINDOW_ACTIVE' });
      const selected = await getSurvey(transactionQuery, surveyId);
      const counts = await transactionQuery(`SELECT leadership_level AS "leadershipLevel",count(*)::integer AS count FROM survey_questions WHERE survey_id=$1 AND active=true GROUP BY leadership_level`, [surveyId]);
      if ([...QUESTION_CATEGORIES.keys()].some(level => !counts.some(item => item.leadershipLevel === level && item.count > 0))) throw Object.assign(new Error('Add at least one active question to every leadership category before publishing this survey.'), { statusCode: 400, code: 'INCOMPLETE_QUESTIONNAIRE' });
      await transactionQuery('UPDATE surveys SET published=false,updated_at=now() WHERE published=true');
      await transactionQuery('UPDATE surveys SET published=true,updated_at=now() WHERE id=$1', [surveyId]);
      await transactionQuery('UPDATE survey_control SET survey_id=$1,period_id=NULL,revision=revision+1 WHERE id=1', [surveyId]);
      return { ...selected, published: true };
    });
    res.json({ survey, surveys: await listSurveys(query) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    next(error);
  }
});

app.get("/api/admin/survey-window", requireSurveyManager, async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json(await getAvailability(query)); }
  catch (error) { next(error); }
});

app.post("/api/admin/survey-window", requireSurveyManager, async (req, res, next) => {
  try {
    const status = await withTransaction(transactionQuery => changeWindow(transactionQuery, req.body, req.staff.username));
    res.set("Cache-Control", "no-store").json(status);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

app.get("/api/admin/survey-results", requireResultsReader, async (req, res, next) => {
  try {
    const surveyId = normalizeId(req.query.surveyId);
    const filters = parseFilters(req.query);
    const [sections, openQuestions] = await Promise.all([getQuestionSections(query, { surveyId }), getOpenEndedQuestions(query, { surveyId })]);
    const rows = await query(
      `SELECT r.id,r.leadership_level AS "leadershipLevel",r.evaluator_level AS "evaluatorLevel",
              r.survey_version AS "surveyVersion",r.sex,r.age,r.work_experience AS "workExperience",
              r.responses,r.open_ended_responses AS "openEndedResponses",r.completed_at AS "completedAt"
       FROM leadership_assessment_responses r
       WHERE r.survey_id=$1 ORDER BY r.completed_at DESC`,
      [surveyId],
    );
    res.set("Cache-Control", "no-store").json(buildSurveyAnalytics(rows, filters, sections, openQuestions));
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ error: error.message });
    next(error);
  }
});

app.get("/api/admin/survey-results.csv", requireResultsReader, async (req, res, next) => {
  try {
    const surveyId = normalizeId(req.query.surveyId);
    const survey = await getSurvey(query, surveyId);
    const [sections, openQuestions] = await Promise.all([getQuestionSections(query, { surveyId }), getOpenEndedQuestions(query, { surveyId })]);
    const rows = await query(
      `SELECT id,survey_version,leadership_level,evaluator_level,
              sex,age,work_experience,completed_at,responses,open_ended_responses
       FROM leadership_assessment_responses WHERE survey_id=$1 ORDER BY completed_at DESC`,
      [surveyId],
    );
    res.type("text/csv; charset=utf-8").attachment(`${survey.slug}-${new Date().toISOString().slice(0, 10)}.csv`).send(buildSurveyCsv(rows, sections, openQuestions));
  } catch (error) { next(error); }
});

app.get("/api/admin/questions", requireSurveyManager, async (req, res, next) => {
  try {
    const surveyId = normalizeId(req.query.surveyId);
    const [sections, openQuestions] = await Promise.all([
      getQuestionSections(query, { includeInactive: true, surveyId }),
      getOpenEndedQuestions(query, { includeInactive: true, surveyId }),
    ]);
    res.set("Cache-Control", "no-store").json({ sections, openQuestions });
  } catch (error) { next(error); }
});

app.post("/api/admin/questions", requireSurveyManager, async (req, res, next) => {
  try {
    const surveyId = normalizeId(req.body.surveyId);
    await getSurvey(query, surveyId);
    const code = clean(req.body.code, 20).toUpperCase();
    const leadershipLevel = clean(req.body.leadershipLevel, 30);
    const textEn = clean(req.body.textEn, 4000);
    const textAm = clean(req.body.textAm, 4000);
    const dimension = clean(req.body.dimension, 120) || null;
    const sortOrder = Number(req.body.sortOrder);
    if (!QUESTION_CODE_PATTERN.test(code)) return res.status(400).json({ error: "Use a unique questionnaire code such as HL24. It must begin with a letter and contain only capital letters, numbers or underscores." });
    if (!QUESTION_CATEGORIES.has(leadershipLevel) && leadershipLevel !== 'open_ended') return res.status(400).json({ error: "Select a valid questionnaire category." });
    if (!textEn || !textAm) return res.status(400).json({ error: "Enter both the English and Amharic question text." });
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) return res.status(400).json({ error: "Sort order must be a whole number from 0 to 9999." });
    const rows = await query(
      `INSERT INTO survey_questions(survey_id,code,leadership_level,text_en,text_am,dimension,sort_order,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING code,text_en AS "textEn",text_am AS "textAm",dimension,leadership_level AS "leadershipLevel",sort_order AS "sortOrder",active,updated_at AS "updatedAt",updated_by AS "updatedBy"`,
      [surveyId, code, leadershipLevel, textEn, textAm, dimension, sortOrder, req.staff.username],
    );
    res.status(201).json({ question: rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That questionnaire code already exists. Codes are permanent primary keys." });
    next(error);
  }
});

app.patch("/api/admin/questions/:code", requireSurveyManager, async (req, res, next) => {
  try {
    const surveyId = normalizeId(req.body.surveyId);
    const code = clean(req.params.code, 20).toUpperCase();
    const textEn = clean(req.body.textEn, 4000);
    const textAm = clean(req.body.textAm, 4000);
    if (!QUESTION_CODE_PATTERN.test(code)) return res.status(400).json({ error: "Invalid questionnaire code." });
    if (!textEn || !textAm) return res.status(400).json({ error: "Enter both the English and Amharic question text." });
    const rows = await query(
      `UPDATE survey_questions SET text_en=$2,text_am=$3,updated_at=now(),updated_by=$4
       WHERE code=$1 AND survey_id=$5
       RETURNING code,text_en AS "textEn",text_am AS "textAm",dimension,leadership_level AS "leadershipLevel",sort_order AS "sortOrder",active,updated_at AS "updatedAt",updated_by AS "updatedBy"`,
      [code, textEn, textAm, req.staff.username, surveyId],
    );
    if (!rows.length) return res.status(404).json({ error: "Question not found." });
    res.json({ question: rows[0] });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

app.get("/api/admin/users", requireAdministrator, async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json({ users: await query(`SELECT u.id,u.username,u.email,u.must_change_password AS "mustChangePassword",u.display_name AS "displayName",u.role,u.active,
    u.created_at AS "createdAt",pr.requested_at AS "resetRequestedAt"
    FROM admin_users u LEFT JOIN password_reset_requests pr ON pr.user_id=u.id AND pr.resolved_at IS NULL
    ORDER BY (pr.requested_at IS NOT NULL) DESC,pr.requested_at DESC NULLS LAST,u.created_at DESC,u.id DESC`) }); }
  catch (error) { next(error); }
});

app.get("/api/admin/invitation-status", requireAdministrator, (_req, res) => {
  try {
    const settings = invitationSettings();
    res.set("Cache-Control", "no-store").json({ configured: true, source: settings.source || "smtp" });
  } catch (error) {
    res.set("Cache-Control", "no-store").json({ configured: false, message: error.message });
  }
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
    if (!QUESTION_CATEGORIES.has(leadershipLevel)) return res.status(400).json({ error: "Select a valid leadership level." });
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
    invitationSettings();
    const email = clean(req.body.email, 254).toLowerCase();
    const displayName = clean(req.body.displayName, 120);
    const role = clean(req.body.role, 20);
    if (!EMAIL_PATTERN.test(email) || email.length > 254 || !displayName || !["admin", "survey_admin", "viewer"].includes(role)) return res.status(400).json({ error: "Use a valid email address, display name and role." });
    const token = invitationToken();
    const user = await withTransaction(async transactionQuery => {
      const rows = await transactionQuery(
        `INSERT INTO admin_users(username,email,password_hash,display_name,role,must_change_password)
         VALUES($1,$1,$2,$3,$4,true) RETURNING id,username,email,display_name AS "displayName",role,active,must_change_password AS "mustChangePassword"`,
        [email, await hashPassword(invitationToken()), displayName, role],
      );
      await transactionQuery(`INSERT INTO admin_invitations(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '48 hours')`, [rows[0].id, tokenHash(token)]);
      return rows[0];
    });
    try { await app.locals.sendInvitation({ email, displayName, token }); }
    catch (error) {
      console.error("Invitation email delivery failed:", error.code || error.message);
      return res.status(502).json({ error: "The account was created, but the invitation email could not be sent. Check mail settings, then use Resend invitation in Users.", userCreated: true });
    }
    res.set("Cache-Control", "no-store").status(201).json({ user, invitationSent: true });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That email is already registered." });
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

app.post("/api/admin/users/:id/resend-invitation", requireAdministrator, async (req, res, next) => {
  try {
    invitationSettings();
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Select a valid user." });
    const token = invitationToken();
    const user = await withTransaction(async transactionQuery => {
      const rows = await transactionQuery(`SELECT id,email,display_name AS "displayName",active,must_change_password AS "mustChangePassword" FROM admin_users WHERE id=$1 FOR UPDATE`, [id]);
      const target = rows[0];
      if (!target?.email || !target.active || !target.mustChangePassword) return null;
      await transactionQuery(`INSERT INTO admin_invitations(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '48 hours')
        ON CONFLICT (user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=now()`, [id, tokenHash(token)]);
      return target;
    });
    if (!user) return res.status(409).json({ error: "This account does not need an invitation." });
    try { await app.locals.sendInvitation({ email: user.email, displayName: user.displayName, token }); }
    catch (error) {
      console.error("Invitation email delivery failed:", error.code || error.message);
      return res.status(502).json({ error: "The invitation email could not be sent. Check mail settings and retry." });
    }
    res.set("Cache-Control", "no-store").json({ invitationSent: true });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

app.patch("/api/admin/users/:id", requireAdministrator, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const displayName = clean(req.body.displayName, 120);
    const role = clean(req.body.role, 20);
    const active = req.body.active;
    if (!Number.isSafeInteger(id) || id < 1 || !displayName || !["admin", "survey_admin", "viewer"].includes(role) || typeof active !== "boolean") {
      return res.status(400).json({ error: "Enter a display name, role, and active status." });
    }
    const user = await withTransaction(async transactionQuery => {
      const rows = await transactionQuery(`SELECT id,username,role,active FROM admin_users WHERE id=$1 FOR UPDATE`, [id]);
      const target = rows[0];
      if (!target) return null;
      if (target.username.toLowerCase() === req.staff.username.toLowerCase() && (!active || role !== "admin")) {
        throw Object.assign(new Error("You cannot remove your own administrator access."), { statusCode: 409 });
      }
      if (target.role === "admin" && target.active && (!active || role !== "admin")) {
        const count = await transactionQuery(`SELECT count(*)::integer AS count FROM admin_users WHERE role='admin' AND active=true`);
        if (count[0].count <= 1) throw Object.assign(new Error("At least one active administrator must remain."), { statusCode: 409 });
      }
      const updated = await transactionQuery(`UPDATE admin_users SET display_name=$2,role=$3,active=$4,
        session_version=session_version+1 WHERE id=$1
        RETURNING id,username,display_name AS "displayName",role,active,created_at AS "createdAt"`,
      [id, displayName, role, active]);
      return updated[0];
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.set("Cache-Control", "no-store").json({ user });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

app.post("/api/admin/users/:id/reset-password", requireAdministrator, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!Number.isSafeInteger(id) || id < 1 || password.length < 8 || password.length > 256) {
      return res.status(400).json({ error: "Enter a new password of 8 to 256 characters." });
    }
    const user = await withTransaction(async transactionQuery => {
      const target = (await transactionQuery(`SELECT id,must_change_password AS "mustChangePassword" FROM admin_users WHERE id=$1 FOR UPDATE`, [id]))[0];
      if (!target) return null;
      if (target.mustChangePassword) throw Object.assign(new Error("Resend the invitation so this user can set their own first password."), { statusCode: 409 });
      const rows = await transactionQuery(`UPDATE admin_users SET password_hash=$2,session_version=session_version+1 WHERE id=$1
        RETURNING id,username`, [id, await hashPassword(password)]);
      if (!rows.length) return null;
      await transactionQuery(`UPDATE password_reset_requests SET resolved_at=now() WHERE user_id=$1 AND resolved_at IS NULL`, [id]);
      return rows[0];
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.set("Cache-Control", "no-store").json({ reset: true, username: user.username });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
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
