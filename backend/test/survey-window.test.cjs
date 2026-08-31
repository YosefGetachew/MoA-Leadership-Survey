const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockDb } = require('./mock-db.cjs');
const { getAvailability, changeWindow, assertOpen } = require('../survey-window');
const { SURVEY_VERSION } = require('../survey-validation');
const sections = require('../../frontend/src/levelSurveyQuestions.json');
const options = { action: 'on', revision: 0, startsAt: '2026-09-01T09:00:00+03:00', endsAt: '2026-09-01T10:00:00+03:00' };

test('defaults closed; scheduled window opens at start and closes exactly at end', async () => {
  const db = createMockDb(); db.setNow('2026-09-01T05:00:00Z');
  assert.equal((await getAvailability(db.query)).state, 'closed');
  assert.equal((await getAvailability(db.query)).lastPeriod, null);
  const scheduled = await changeWindow(db.query, options, 'admin');
  assert.equal(scheduled.state, 'scheduled'); assert.equal(scheduled.isOpen, false);
  db.setNow('2026-09-01T06:00:00Z');
  const opened = await getAvailability(db.query); assert.equal(opened.isOpen, true);
  assert.doesNotThrow(() => assertOpen(opened, opened.period.id));
  assert.throws(() => assertOpen(opened, 'old'), error => error.code === 'SURVEY_PERIOD_CHANGED');
  db.setNow('2026-09-01T07:00:00Z');
  const ended = await getAvailability(db.query);
  assert.equal(ended.state, 'closed'); assert.equal(ended.lastPeriod.durationMinutes, 60);
  assert.equal(ended.lastPeriod.endsAt, '2026-09-01T07:00:00.000Z');
  assert.throws(() => assertOpen(ended, ended.period.id), error => error.code === 'SURVEY_CLOSED');
});

test('early closure records actual duration; cancelling a future window does not fabricate a last survey', async () => {
  const db = createMockDb(); db.setNow('2026-09-01T06:00:00Z');
  await changeWindow(db.query, options, 'admin');
  db.setNow('2026-09-01T06:15:00Z');
  const closed = await changeWindow(db.query, { action: 'off', revision: 1 }, 'other-admin');
  assert.equal(closed.lastPeriod.durationMinutes, 15); assert.equal(closed.lastPeriod.endsAt, '2026-09-01T06:15:00.000Z');
  assert.equal(db.periods[0].closedBy, 'other-admin');
  await changeWindow(db.query, { ...options, revision: 2, startsAt: '2026-09-02T09:00:00+03:00', endsAt: '2026-09-02T10:00:00+03:00' }, 'admin');
  const cancelled = await changeWindow(db.query, { action: 'off', revision: 3 }, 'admin');
  assert.equal(cancelled.lastPeriod.durationMinutes, 15);
  assert.equal(cancelled.lastPeriod.startsAt, '2026-09-01T06:00:00.000Z');
  assert.equal(db.periods.length, 2);
});

test('validate intervals, enforce control revision and never backdate actual opening', async () => {
  const db = createMockDb(); db.setNow('2026-09-01T06:30:00Z');
  for (const invalid of [{ ...options, endsAt: options.startsAt }, { ...options, startsAt: '2026-02-30T00:00:00Z' }, { ...options, endsAt: '' }, { ...options, startsAt: '2026-09-01T09:00' }, { ...options, revision: '0' }]) {
    await assert.rejects(changeWindow(db.query, invalid, 'admin'), error => error.statusCode === 400);
  }
  const current = await changeWindow(db.query, options, 'admin');
  assert.equal(current.period.startsAt, '2026-09-01T06:30:00.000Z');
  await assert.rejects(changeWindow(db.query, { action: 'off', revision: 0 }, 'admin'), error => error.statusCode === 409);
  await assert.rejects(changeWindow(db.query, { ...options, revision: 1 }, 'admin'), error => error.statusCode === 409);
  assert.equal((await getAvailability(db.query)).isOpen, true);
});

test('HTTP admin-only controls, closed submission/restart gating, stale periods and new-period cookies', async t => {
  process.env.NODE_ENV = 'test'; process.env.MINISTRY_ADMIN_SESSION = 'isolated-window-test-secret';
  const db = createMockDb(); db.setNow('2026-09-01T06:00:00Z');
  require.cache[require.resolve('../config/db')] = { exports: db };
  const app = require('../server');
  const { createStaffSession } = require('../auth');
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const cookieFor = role => 'moa_reform_admin=' + createStaffSession({ username: role, role, displayName: role });
  const admin = cookieFor('admin'), viewer = cookieFor('viewer');
  const post = (path, body, cookie = '') => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
  const input = { surveyVersion: SURVEY_VERSION, evaluatorLevel: 'expert', sex: 'male', age: 40, workExperience: 10, responses: Object.fromEntries(sections.flatMap(section => section.questions.map(question => [question.code, 4]))) };
  for (const cookie of ['', viewer]) {
    assert.equal((await post('/api/admin/survey-window', options, cookie)).status, 403);
    assert.equal((await fetch(url + '/api/admin/survey-window', { headers: { Cookie: cookie } })).status, 403);
  }
  assert.equal((await post('/api/survey/responses', input)).status, 403);
  assert.equal((await post('/api/survey/restart', {})).status, 403);
  const result = await post('/api/admin/survey-window', options, admin);
  assert.equal(result.status, 200); const opened = await result.json();
  const statusResponse = await fetch(url + '/api/survey/status');
  const initialCookie = statusResponse.headers.get('set-cookie').split(';')[0];
  assert.equal(statusResponse.headers.get('cache-control'), 'no-store');
  assert.equal((await statusResponse.json()).availability.isOpen, true);
  assert.equal((await post('/api/survey/responses', input)).status, 409); // old frontend has no period ID
  assert.equal((await post('/api/survey/responses', { ...input, periodId: opened.period.id })).status, 428);
  const saved = await post('/api/survey/responses', { ...input, periodId: opened.period.id }, initialCookie);
  assert.equal(saved.status, 201); const cookie = saved.headers.get('set-cookie').split(';')[0];
  assert.equal(db.rows[0].surveyPeriodId, opened.period.id);
  assert.equal((await post('/api/survey/responses', { ...input, periodId: opened.period.id }, cookie)).status, 409);
  db.setNow('2026-09-01T06:15:00Z');
  const closed = await (await post('/api/admin/survey-window', { action: 'off', revision: 1 }, admin)).json();
  assert.equal(closed.lastPeriod.durationMinutes, 15);
  assert.equal((await post('/api/survey/responses', { ...input, periodId: opened.period.id }, cookie)).status, 403);
  const nextWindow = await (await post('/api/admin/survey-window', { ...options, revision: 2 }, admin)).json();
  const nextStatus = await (await fetch(url + '/api/survey/status', { headers: { Cookie: cookie } })).json();
  assert.equal(nextStatus.submitted, false);
  assert.equal((await post('/api/survey/responses', { ...input, periodId: opened.period.id }, cookie)).status, 409);
  assert.equal((await post('/api/survey/responses', { ...input, periodId: nextWindow.period.id }, cookie)).status, 201);
  db.setNow('2026-09-01T07:00:00Z');
  assert.equal((await post('/api/survey/responses', { ...input, periodId: nextWindow.period.id })).status, 403);
  assert.equal(db.rows.length, 2); assert.equal(db.writes, 2);
});
