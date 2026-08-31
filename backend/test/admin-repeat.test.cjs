const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockDb } = require('./mock-db.cjs');
const { changeWindow } = require('../survey-window');
const { SURVEY_VERSION } = require('../survey-validation');
const sections = require('../../frontend/src/levelSurveyQuestions.json');

test('only authenticated admins can restart; public cookie, duplicates and closure stay protected', async t => {
  process.env.NODE_ENV = 'test'; process.env.MINISTRY_ADMIN_SESSION = 'isolated-admin-repeat-test';
  const db = createMockDb();
  const opened = await changeWindow(db.query, { action: 'on', revision: 0, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() }, 'admin');
  require.cache[require.resolve('../config/db')] = { exports: db };
  const app = require('../server');
  const { createStaffSession } = require('../auth');
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const staff = (role, username = role) => 'moa_reform_admin=' + createStaffSession({ username, role, displayName: role });
  const admin = staff('admin'), viewer = staff('viewer');
  const publicCookie = (await fetch(url + '/api/survey/status')).headers.get('set-cookie').split(';')[0];
  const post = (path, body, cookie) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
  const status = async cookie => (await fetch(url + '/api/survey/status', { headers: { Cookie: cookie } })).json();
  const restart = cookie => post('/api/survey/restart', { periodId: opened.period.id }, cookie);
  const input = { periodId: opened.period.id, surveyVersion: SURVEY_VERSION, evaluatorLevel: 'expert', sex: 'male', age: 40, workExperience: 10, responses: Object.fromEntries(sections.flatMap(section => section.questions.map(question => [question.code, 4]))) };
  assert.equal((await status(publicCookie)).canSubmitAnother, false);
  assert.equal((await status(`${publicCookie}; ${admin}`)).canSubmitAnother, true);
  assert.equal((await restart(`${publicCookie}; ${admin}`)).status, 409); // cannot abandon incomplete attempt
  assert.equal((await post('/api/survey/responses', input, publicCookie)).status, 201);
  for (const cookie of [publicCookie, `${publicCookie}; ${viewer}`, `${publicCookie}; moa_reform_admin=forged`]) {
    const denied = await restart(cookie);
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('set-cookie'), null);
  }
  const restarted = await restart(`${publicCookie}; ${admin}`);
  assert.equal(restarted.status, 200);
  const attemptCookie = restarted.headers.get('set-cookie').split(';')[0];
  assert.match(attemptCookie, /^moa_leadership_admin_attempt=/);
  assert.match(restarted.headers.get('set-cookie'), /HttpOnly/);
  const adminAttempt = `${publicCookie}; ${admin}; ${attemptCookie}`;
  assert.equal((await status(adminAttempt)).submitted, false);
  const writes = await Promise.all([post('/api/survey/responses', input, adminAttempt), post('/api/survey/responses', input, adminAttempt)]);
  assert.deepEqual(writes.map(result => result.status).sort(), [201, 409]);
  assert.equal((await status(adminAttempt)).submitted, true);
  assert.equal(db.rows.length, 2);
  // Attempt cookie does not grant viewer/anonymous repeat privileges after logout.
  for (const cookie of [`${publicCookie}; ${attemptCookie}`, `${publicCookie}; ${attemptCookie}; ${viewer}`]) {
    assert.equal((await status(cookie)).submitted, true);
    assert.equal((await post('/api/survey/responses', input, cookie)).status, 409);
  }
  const next = await restart(adminAttempt);
  assert.equal(next.status, 200);
  const nextCookie = `${publicCookie}; ${admin}; ${next.headers.get('set-cookie').split(';')[0]}`;
  assert.equal((await status(nextCookie)).submitted, false);
  assert.equal((await post('/api/survey/restart', { periodId: 'old' }, adminAttempt)).status, 409);
  await changeWindow(db.query, { action: 'off', revision: 1 }, 'admin');
  assert.equal((await restart(adminAttempt)).status, 403);
  assert.equal((await post('/api/survey/responses', input, nextCookie)).status, 403);
  assert.equal(db.rows.length, 2);
});
