// In-memory database double for tests only. Never connects to PostgreSQL.
const { SURVEY_VERSION } = require('../survey-validation');
function createMockDb() {
  const rows = [];
  let writes = 0;
  const periods = [];
  const control = { periodId: null, revision: 0 };
  let clock = null;
  const now = () => clock ?? Date.now();
  const validTargets = { high_level: ['minister', 'test_high'], middle_level: ['executive', 'test_middle'], lower_level: ['team_leader', 'test_lower'] };
  async function query(sql, values = []) {
    if (sql === 'SELECT id FROM survey_control WHERE id=1 FOR UPDATE') return [{ id: 1 }];
    if (sql.includes('FROM survey_control c LEFT JOIN survey_periods')) {
      const period = periods.find(period => period.id === control.periodId);
      const last = periods.filter(period => {
        const end = Math.min(Date.parse(period.endsAt), period.closedAt ? Date.parse(period.closedAt) : Infinity);
        return Date.parse(period.startsAt) < end && end <= now();
      }).sort((a, b) => Math.min(Date.parse(b.endsAt), b.closedAt ? Date.parse(b.closedAt) : Infinity) - Math.min(Date.parse(a.endsAt), a.closedAt ? Date.parse(a.closedAt) : Infinity))[0];
      return [{ revision: control.revision, periodId: period?.id, startsAt: period?.startsAt, endsAt: period?.endsAt, closedAt: period?.closedAt,
        serverTime: new Date(now()).toISOString(), lastPeriod: last ? { startsAt: last.startsAt, endsAt: new Date(Math.min(Date.parse(last.endsAt), last.closedAt ? Date.parse(last.closedAt) : Infinity)).toISOString() } : null }];
    }
    if (sql.startsWith('INSERT INTO survey_periods')) {
      const period = { id: String(periods.length + 1), startsAt: values[0], endsAt: values[1], createdBy: values[2], closedAt: null };
      periods.push(period); return [{ id: period.id }];
    }
    if (sql.startsWith('UPDATE survey_control SET period_id')) { control.periodId = String(values[0]); control.revision++; return []; }
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
    if (sql.includes('INSERT INTO leadership_assessment_responses')) {
      const [version, evaluatorLevel, sex, age, workExperience, responses, answeredCount, naCount, token, periodId] = values;
      const period = periods.find(period => period.id === String(periodId));
      if (!period || period.closedAt || Date.parse(period.startsAt) > now() || Date.parse(period.endsAt) <= now()) return [];
      if (rows.some(row => row.token === token && row.surveyVersion === version)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      writes++;
      const row = { id: rows.length + 1, surveyVersion: version, surveyPeriodId: periodId, leadershipLevel: 'all_levels', evaluatorLevel, sex, age, workExperience, assessmentTargets: {}, overallResponses: {}, responses: JSON.parse(responses), answeredCount, naCount, token, completedAt: new Date(now()).toISOString() };
      rows.push(row);
      return [{ id: row.id, completedAt: row.completedAt }];
    }
    if (sql.includes('WHERE respondent_token=$1')) return rows.filter(row => row.token === values[0] && row.surveyVersion === values[1]);
    if (sql.includes('FROM leadership_assessment_responses r')) return rows;
    if (sql.includes('FROM leadership_assessment_responses WHERE survey_version')) return rows.map(row => ({ id: row.id, survey_version: row.surveyVersion, leadership_level: row.leadershipLevel, evaluator_level: row.evaluatorLevel, assessment_targets: row.assessmentTargets, sex: row.sex, age: row.age, work_experience: row.workExperience, completed_at: new Date(row.completedAt), overall_responses: row.overallResponses, responses: row.responses }));
    if (sql === 'SELECT 1') return [{ '?column?': 1 }];
    throw new Error(`Unimplemented test query: ${sql}`);
  }
  return { query, rows, periods, control, setNow: value => { clock = Date.parse(value); }, withTransaction: work => work(query), get writes() { return writes; }, ensureSchema: async () => { throw new Error('Tests must not migrate a database.'); }, version: SURVEY_VERSION };
}
module.exports = { createMockDb };
