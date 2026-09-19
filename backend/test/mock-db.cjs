// In-memory database double for tests only. Never connects to PostgreSQL.
const { SURVEY_VERSION } = require('../survey-validation');
const questionSections = require('../../frontend/src/levelSurveyQuestions.json');
function createMockDb() {
  const rows = [];
  let writes = 0;
  const periods = [];
  const surveys = [{ id: '1', nameEn: 'Leadership Assessment Survey', nameAm: 'የአመራር ምዘና ዳሰሳ', slug: 'leadership-assessment', settings: {}, published: true, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  const users = [
    { id: 1, username: 'admin', displayName: 'Administrator', role: 'admin', active: true, sessionVersion: 0 },
    { id: 2, username: 'viewer', displayName: 'Viewer', role: 'viewer', active: true, sessionVersion: 0 },
    { id: 3, username: 'test-admin', displayName: 'Test Administrator', role: 'admin', active: true, sessionVersion: 0 },
    { id: 4, username: 'survey_admin', displayName: 'Survey Administrator', role: 'survey_admin', active: true, sessionVersion: 0 },
  ];
  const resetRequests = new Map();
  const passwordResets = new Map();
  const invitations = new Map();
  const publicUser = ({ id, username, email, mustChangePassword, displayName, role, active, createdAt }) => ({ id, username, email, mustChangePassword, displayName, role, active, createdAt });
  const control = { surveyId: '1', periodId: null, revision: 0 };
  let clock = null;
  const now = () => clock ?? Date.now();
  const validTargets = { high_level: ['minister', 'test_high'], middle_level: ['executive', 'test_middle'], lower_level: ['team_leader', 'test_lower'] };
  const questions = [
    ...questionSections.flatMap(section => section.questions.map((question, index) => ({ surveyId: '1', code: question.code, leadershipLevel: section.level, textEn: question.text, textAm: question.textAm, dimension: question.dimension || null, sortOrder: (index + 1) * 10, active: true, updatedAt: new Date(now()).toISOString(), updatedBy: null }))),
    ...['GQ1', 'GQ2', 'GQ3'].map((code, index) => ({ surveyId: '1', code, leadershipLevel: 'open_ended', textEn: `Open question ${index + 1}`, textAm: `ክፍት ጥያቄ ${index + 1}`, dimension: 'Qualitative feedback', sortOrder: (index + 1) * 10, active: true, updatedAt: new Date(now()).toISOString(), updatedBy: null })),
  ];
  async function query(sql, values = []) {
    if (sql.includes('FROM admin_users u LEFT JOIN password_reset_requests')) return [...users].sort((a, b) => Number(Boolean(resetRequests.get(b.id)?.requestedAt && !resetRequests.get(b.id)?.resolvedAt)) - Number(Boolean(resetRequests.get(a.id)?.requestedAt && !resetRequests.get(a.id)?.resolvedAt)) || b.id - a.id).map(user => ({ ...publicUser(user), resetRequestedAt: resetRequests.get(user.id)?.resolvedAt ? null : resetRequests.get(user.id)?.requestedAt || null }));
    if (sql.startsWith('INSERT INTO password_reset_requests(')) {
      const user = users.find(item => item.id === Number(values[0]) && item.active);
      if (user) {
        const existing = resetRequests.get(user.id);
        if (!existing || existing.resolvedAt || Date.parse(existing.requestedAt) < now() - 15 * 60 * 1000) resetRequests.set(user.id, { requestedAt: new Date(now()).toISOString(), resolvedAt: null });
      }
      return [];
    }
    if (sql.startsWith('SELECT id,email,display_name AS "displayName" FROM admin_users')) return users.filter(user => user.username.toLowerCase() === String(values[0]).toLowerCase() && user.active);
    if (sql.startsWith('INSERT INTO admin_password_resets(')) {
      const userId = Number(values[0]);
      const existing = passwordResets.get(userId);
      if (existing && Date.parse(existing.createdAt) >= now() - 15 * 60 * 1000) return [];
      passwordResets.set(userId, { userId, tokenHash: values[1], createdAt: new Date(now()).toISOString(), expiresAt: new Date(now() + 60 * 60 * 1000).toISOString() });
      return [{ user_id: userId }];
    }
    if (sql.includes('FROM admin_password_resets r JOIN admin_users u')) {
      const reset = [...passwordResets.values()].find(item => item.tokenHash === values[0] && Date.parse(item.expiresAt) > now());
      const user = users.find(item => item.id === reset?.userId);
      return user?.active ? [{ userId: user.id, username: user.username }] : [];
    }
    if (sql.startsWith('DELETE FROM admin_password_resets')) {
      const record = passwordResets.get(Number(values[0]));
      if (record && (values.length === 1 || record.tokenHash === values[1])) passwordResets.delete(Number(values[0]));
      return [];
    }
    if (sql.startsWith('UPDATE password_reset_requests SET resolved_at')) {
      const request = resetRequests.get(Number(values[0]));
      if (request && !request.resolvedAt) request.resolvedAt = new Date(now()).toISOString();
      return [];
    }
    if (sql.includes('FROM admin_users WHERE lower(username)=lower($1)')) return users.filter(user => user.username.toLowerCase() === String(values[0]).toLowerCase());
    if (sql.includes('FROM admin_invitations i JOIN admin_users u')) {
      const invitation = [...invitations.values()].find(item => item.tokenHash === values[0] && Date.parse(item.expiresAt) > now());
      const user = users.find(item => item.id === invitation?.userId);
      return user?.active && user.mustChangePassword ? [{ userId: user.id, username: user.username }] : [];
    }
    if (sql.startsWith('INSERT INTO admin_invitations(')) {
      invitations.set(Number(values[0]), { userId: Number(values[0]), tokenHash: values[1], expiresAt: new Date(now() + 48 * 60 * 60 * 1000).toISOString() });
      return [];
    }
    if (sql.startsWith('DELETE FROM admin_invitations')) { invitations.delete(Number(values[0])); return []; }
    if (sql.startsWith('SELECT id,email,display_name AS "displayName"')) return users.filter(user => user.id === Number(values[0]));
    if (sql.includes('FROM admin_users WHERE id=$1 FOR UPDATE')) return users.filter(user => user.id === Number(values[0]));
    if (sql.includes("count(*)::integer AS count FROM admin_users")) return [{ count: users.filter(user => user.active && user.role === 'admin').length }];
    if (sql.startsWith('INSERT INTO admin_users(')) {
      const [username, passwordHash, displayName, role] = values;
      if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) throw Object.assign(new Error('duplicate'), { code: '23505' });
      const user = { id: users.length + 1, username, email: username, mustChangePassword: true, passwordHash, displayName, role, active: true, sessionVersion: 0, createdAt: new Date(now()).toISOString() };
      users.push(user); return [publicUser(user)];
    }
    if (sql.startsWith('UPDATE admin_users SET display_name=$2')) {
      const user = users.find(item => item.id === Number(values[0]));
      if (!user) return [];
      Object.assign(user, { displayName: values[1], role: values[2], active: values[3], sessionVersion: user.sessionVersion + 1 });
      return [publicUser(user)];
    }
    if (sql.startsWith('UPDATE admin_users SET password_hash=$2')) {
      const user = users.find(item => item.id === Number(values[0]));
      if (!user) return [];
      Object.assign(user, { passwordHash: values[1], sessionVersion: user.sessionVersion + 1 });
      if (sql.includes('must_change_password=false')) user.mustChangePassword = false;
      return [user];
    }
    if (sql === 'SELECT id FROM survey_control WHERE id=1 FOR UPDATE') return [{ id: 1 }];
    if (sql.includes('FROM survey_control c JOIN surveys')) {
      const period = periods.find(period => period.id === control.periodId);
      const last = periods.filter(period => {
        const end = Math.min(Date.parse(period.endsAt), period.closedAt ? Date.parse(period.closedAt) : Infinity);
        return Date.parse(period.startsAt) < end && end <= now();
      }).sort((a, b) => Math.min(Date.parse(b.endsAt), b.closedAt ? Date.parse(b.closedAt) : Infinity) - Math.min(Date.parse(a.endsAt), a.closedAt ? Date.parse(a.closedAt) : Infinity))[0];
      const survey = surveys.find(item => item.id === control.surveyId);
      return [{ revision: control.revision, surveyId: control.surveyId, surveyNameEn: survey.nameEn, surveyNameAm: survey.nameAm, surveySlug: survey.slug, surveySettings: survey.settings, periodId: period?.id, startsAt: period?.startsAt, endsAt: period?.endsAt, closedAt: period?.closedAt,
        serverTime: new Date(now()).toISOString(), lastPeriod: last ? { startsAt: last.startsAt, endsAt: new Date(Math.min(Date.parse(last.endsAt), last.closedAt ? Date.parse(last.closedAt) : Infinity)).toISOString() } : null }];
    }
    if (sql.startsWith('INSERT INTO survey_periods')) {
      const period = { id: String(periods.length + 1), surveyId: String(values[0]), startsAt: values[1], endsAt: values[2], createdBy: values[3], closedAt: null };
      periods.push(period); return [{ id: period.id }];
    }
    if (sql.startsWith('UPDATE survey_control SET period_id')) { control.periodId = String(values[0]); control.revision++; return []; }
    if (sql.startsWith('UPDATE survey_control SET survey_id')) { control.surveyId = String(values[0]); control.periodId = null; control.revision++; return []; }
    if (sql.startsWith('UPDATE survey_control SET revision')) { control.revision++; return []; }
    if (sql.startsWith('UPDATE survey_periods SET closed_at')) { const period = periods.find(period => period.id === String(values[1])); if (period && !period.closedAt) { period.closedAt = new Date(now()).toISOString(); period.closedBy = values[0]; } return []; }
    if (sql.includes('FROM survey_sectors')) {
      if (sql.startsWith('SELECT code AS value')) {
        const [level, position] = values;
        const target = validTargets[level];
        return target && position === target[0] ? [{ value: target[1], label: `Test institution (${level})`, labelAm: 'የሙከራ ተቋም' }] : [];
      }
      const [code, level, position] = values;
      return validTargets[level]?.[0] === position && validTargets[level]?.[1] === code ? [{ code }] : [];
    }
    if (sql.includes('FROM surveys s') && sql.includes('GROUP BY s.id')) return surveys.map(survey => ({ ...survey, questionCount: questions.filter(question => question.surveyId === survey.id && question.active).length, responseCount: rows.filter(row => row.surveyId === survey.id).length })).sort((a, b) => Number(b.published) - Number(a.published));
    if (sql.includes('FROM surveys WHERE published=true')) return surveys.filter(survey => survey.published && !survey.archived);
    if (sql.includes('FROM surveys WHERE id=$1')) return surveys.filter(survey => survey.id === String(values[0]) && !survey.archived);
    if (sql === 'SELECT id FROM surveys WHERE slug=$1 LIMIT 1') return surveys.filter(survey => survey.slug === values[0]).map(survey => ({ id: survey.id }));
    if (sql.startsWith('INSERT INTO surveys')) {
      const survey = { id: String(surveys.length + 1), nameEn: values[0], nameAm: values[1] || '', slug: values[2], settings: {}, published: false, archived: false, createdAt: new Date(now()).toISOString(), updatedAt: new Date(now()).toISOString() };
      surveys.push(survey); return [survey];
    }
    if (sql.startsWith('UPDATE surveys target SET settings=source.settings')) { const target = surveys.find(item => item.id === String(values[0])); const source = surveys.find(item => item.id === String(values[1])); if (target && source) target.settings = structuredClone(source.settings); return []; }
    if (sql.startsWith('UPDATE surveys SET name_en')) { const survey = surveys.find(item => item.id === String(values[0])); if (!survey) return []; Object.assign(survey,{nameEn:values[1],nameAm:values[2] || '',settings:JSON.parse(values[3]),updatedAt:new Date(now()).toISOString()}); return [survey]; }
    if (sql.startsWith('UPDATE surveys SET published=false')) { surveys.forEach(survey => { survey.published = false; }); return []; }
    if (sql.startsWith('UPDATE surveys SET published=true')) { const survey = surveys.find(item => item.id === String(values[0])); if (survey) survey.published = true; return []; }
    if (sql.includes('count(*)::integer AS count FROM survey_questions')) return ['high_level', 'middle_level', 'lower_level'].map(leadershipLevel => ({ leadershipLevel, count: questions.filter(question => question.surveyId === String(values[0] || 1) && question.active && question.leadershipLevel === leadershipLevel).length }));
    if (sql.includes('FROM survey_questions') && !sql.includes('INSERT INTO survey_questions')) return questions.filter(question => question.surveyId === String(values[0] || 1)).filter(question => sql.includes("leadership_level='open_ended'") ? question.leadershipLevel === 'open_ended' : true).filter(question => sql.includes('AND active=true') ? question.active : true).sort((a, b) => a.leadershipLevel.localeCompare(b.leadershipLevel) || a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    if (sql.includes('INSERT INTO survey_questions')) {
      if (sql.includes('SELECT $1,code')) {
        const [surveyId, updatedBy, sourceId] = values;
        questions.filter(question => question.surveyId === String(sourceId)).forEach(question => questions.push({ ...question, surveyId: String(surveyId), updatedBy }));
        return [];
      }
      const [surveyId, code, leadershipLevel, textEn, textAm, dimension, sortOrder, updatedBy] = values;
      if (questions.some(question => question.surveyId === String(surveyId) && question.code === code)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      const question = { surveyId: String(surveyId), code, leadershipLevel, textEn, textAm, dimension, sortOrder, active: true, updatedAt: new Date(now()).toISOString(), updatedBy };
      questions.push(question); return [question];
    }
    if (sql.includes('UPDATE survey_questions SET')) {
      if (sql.includes('SET text_en=$2,text_am=$3')) {
        const [code, textEn, textAm, updatedBy, surveyId] = values;
        const question = questions.find(item => item.surveyId === String(surveyId || 1) && item.code === code);
        if (!question) return [];
        Object.assign(question, { textEn, textAm, updatedAt: new Date(now()).toISOString(), updatedBy });
        return [question];
      }
      const [code, leadershipLevel, textEn, textAm, dimension, sortOrder, active, updatedBy, surveyId] = values;
      const question = questions.find(item => item.surveyId === String(surveyId || 1) && item.code === code);
      if (!question) return [];
      Object.assign(question, { leadershipLevel, textEn, textAm, dimension, sortOrder, active, updatedAt: new Date(now()).toISOString(), updatedBy });
      return [question];
    }
    if (sql.includes('INSERT INTO leadership_assessment_responses')) {
      const [surveyId, version, evaluatorLevel, sex, age, workExperience, responses, openEndedResponses, answeredCount, naCount, token, periodId] = values;
      const period = periods.find(period => period.id === String(periodId));
      if (!period || period.closedAt || Date.parse(period.startsAt) > now() || Date.parse(period.endsAt) <= now()) return [];
      if (rows.some(row => row.token === token && row.surveyId === String(surveyId))) throw Object.assign(new Error('duplicate'), { code: '23505' });
      writes++;
      const row = { id: rows.length + 1, surveyId: String(surveyId), surveyVersion: version, surveyPeriodId: periodId, leadershipLevel: 'all_levels', evaluatorLevel, sex, age, workExperience, assessmentTargets: {}, overallResponses: {}, responses: JSON.parse(responses), openEndedResponses: JSON.parse(openEndedResponses), answeredCount, naCount, token, completedAt: new Date(now()).toISOString() };
      rows.push(row);
      return [{ id: row.id, completedAt: row.completedAt }];
    }
    if (sql.includes('WHERE respondent_token=$1')) return rows.filter(row => row.token === values[0] && row.surveyId === String(values[1]));
    if (sql.includes('FROM leadership_assessment_responses r')) return rows.filter(row => row.surveyId === String(values[0] || 1));
    if (sql.includes('FROM leadership_assessment_responses WHERE survey_id')) return rows.filter(row => row.surveyId === String(values[0] || 1)).map(row => ({ id: row.id, survey_version: row.surveyVersion, leadership_level: row.leadershipLevel, evaluator_level: row.evaluatorLevel, assessment_targets: row.assessmentTargets, sex: row.sex, age: row.age, work_experience: row.workExperience, completed_at: new Date(row.completedAt), overall_responses: row.overallResponses, responses: row.responses, open_ended_responses: row.openEndedResponses }));
    if (sql === 'SELECT 1') return [{ '?column?': 1 }];
    throw new Error(`Unimplemented test query: ${sql}`);
  }
  return { query, rows, periods, control, surveys, questions, users, resetRequests, passwordResets, invitations, setNow: value => { clock = Date.parse(value); }, withTransaction: work => work(query), get writes() { return writes; }, ensureSchema: async () => { throw new Error('Tests must not migrate a database.'); }, version: SURVEY_VERSION };
}
module.exports = { createMockDb };
