// Optional integration check: every table and row is isolated in a new schema and rolled back.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../config/db');
const { getAvailability, changeWindow, lockControl } = require('../survey-window');

(async () => {
  const client = await pool.connect();
  const query = async (sql, values = []) => (await client.query(sql, values)).rows;
  try {
    await query('BEGIN');
    await query("SET LOCAL lock_timeout = '3s'");
    await query("SET LOCAL statement_timeout = '10s'");
    const schema = `survey_window_check_${process.pid}_${Date.now()}`;
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`SET LOCAL search_path TO "${schema}"`);
    await query(`CREATE TABLE leadership_assessment_responses (
      id bigserial PRIMARY KEY, survey_version text, leadership_level text, evaluator_level text,
      sex text, age integer, work_experience integer, responses jsonb, answered_count integer,
      na_count integer, respondent_token text, completed_at timestamptz DEFAULT now()
    )`);
    const migration = fs.readFileSync(path.join(__dirname, '..', 'survey-window-schema.sql'), 'utf8');
    await query(migration); await query(migration);
    assert.equal((await getAvailability(query)).state, 'closed');
    const serverTime = Date.parse((await getAvailability(query)).serverTime);
    const opened = await changeWindow(query, { action: 'on', revision: 0, startsAt: new Date(serverTime - 1000).toISOString(), endsAt: new Date(serverTime + 3600000).toISOString() }, 'integration-test');
    assert.equal(opened.state, 'open');
    await query(migration); // A restart/migration must not switch off an active period.
    assert.equal((await getAvailability(query)).period.id, opened.period.id);
    await lockControl(query);
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const insert = source.match(/`(INSERT INTO leadership_assessment_responses[\s\S]*?)`/)[1];
    const values = ['test', 'expert', 'female', 40, 10, '{}', 69, 0, 'period:test', opened.period.id];
    assert.equal((await query(insert, values)).length, 1);
    const closed = await changeWindow(query, { action: 'off', revision: 1 }, 'integration-test');
    assert.equal(closed.state, 'closed'); assert.ok(closed.lastPeriod);
    assert.equal((await query(insert, values)).length, 0);
    const count = await query('SELECT count(*)::int AS count FROM leadership_assessment_responses');
    assert.equal(count[0].count, 1);
    const scheduled = await changeWindow(query, { action: 'on', revision: 2, startsAt: new Date(serverTime + 3600000).toISOString(), endsAt: new Date(serverTime + 7200000).toISOString() }, 'integration-test');
    assert.equal(scheduled.state, 'scheduled');
    assert.equal((await query(insert, [...values.slice(0, 9), scheduled.period.id])).length, 0);
    const cancelled = await changeWindow(query, { action: 'off', revision: 3 }, 'integration-test');
    assert.equal(cancelled.lastPeriod.startsAt, closed.lastPeriod.startsAt);
    console.log('PostgreSQL: migration twice, state persistence, window gates, response link and historical duration verified.');
  } finally {
    await query('ROLLBACK'); client.release(); await pool.end();
    console.log('Isolated schema and test records rolled back; existing survey data unchanged.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
