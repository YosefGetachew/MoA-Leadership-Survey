const fail = (statusCode, message, code) => { throw Object.assign(new Error(message), { statusCode, code }); };
const iso = value => value == null ? null : new Date(value).toISOString();

function windowState(record) {
  if (!record) throw new Error('Survey control is not initialized. Restart the backend to apply the schema upgrade.');
  const now = new Date(record.serverTime).getTime();
  const period = record.periodId ? { id: String(record.periodId), startsAt: iso(record.startsAt), endsAt: iso(record.endsAt), closedAt: iso(record.closedAt) } : null;
  const state = !period || period.closedAt ? 'closed' : now < new Date(period.startsAt).getTime() ? 'scheduled' : now >= new Date(period.endsAt).getTime() ? 'closed' : 'open';
  const lastPeriod = record.lastPeriod ? {
    startsAt: iso(record.lastPeriod.startsAt), endsAt: iso(record.lastPeriod.endsAt),
    durationMinutes: Math.max(0, Math.round((new Date(record.lastPeriod.endsAt) - new Date(record.lastPeriod.startsAt)) / 60000)),
  } : null;
  return { state, isOpen: state === 'open', period, lastPeriod, revision: record.revision, serverTime: iso(record.serverTime) };
}

async function getAvailability(query) {
  const rows = await query(`SELECT c.revision,p.id AS "periodId",p.starts_at AS "startsAt",p.ends_at AS "endsAt",p.closed_at AS "closedAt",
    clock_timestamp() AS "serverTime",
    (SELECT json_build_object('startsAt',h.starts_at,'endsAt',LEAST(h.ends_at,COALESCE(h.closed_at,clock_timestamp())))
     FROM survey_periods h
     WHERE h.starts_at < LEAST(h.ends_at,COALESCE(h.closed_at,clock_timestamp()))
       AND LEAST(h.ends_at,COALESCE(h.closed_at,h.ends_at)) <= clock_timestamp()
     ORDER BY LEAST(h.ends_at,COALESCE(h.closed_at,h.ends_at)) DESC,h.id DESC LIMIT 1) AS "lastPeriod"
    FROM survey_control c LEFT JOIN survey_periods p ON p.id=c.period_id WHERE c.id=1`);
  return windowState(rows[0]);
}

async function lockControl(query) {
  const rows = await query('SELECT id FROM survey_control WHERE id=1 FOR UPDATE');
  if (!rows.length) throw new Error('Survey control is not initialized.');
}

function assertOpen(availability, periodId) {
  if (!availability.isOpen) fail(403, 'There is no survey at this time.', 'SURVEY_CLOSED');
  if (String(periodId || '') !== availability.period.id) fail(409, 'The survey period has changed. Please reload and start the current assessment.', 'SURVEY_PERIOD_CHANGED');
}

async function changeWindow(query, body, username) {
  if (!body || !['on', 'off'].includes(body.action) || !Number.isInteger(body.revision)) fail(400, 'Specify on or off and the current control revision.');
  await lockControl(query);
  const current = await getAvailability(query);
  if (current.revision !== body.revision) fail(409, 'Another administrator changed the survey. Refresh the controls and try again.');
  if (body.action === 'off') {
    if (current.period && !current.period.closedAt) await query('UPDATE survey_periods SET closed_at=clock_timestamp(),closed_by=$1 WHERE id=$2 AND closed_at IS NULL', [username, current.period.id]);
    await query('UPDATE survey_control SET revision=revision+1 WHERE id=1');
  } else {
    if (current.state !== 'closed') fail(409, 'Turn off the current survey window before creating a new one.');
    const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
    if (![body.startsAt, body.endsAt].every(value => typeof value === 'string' && datePattern.test(value) && Number.isFinite(Date.parse(value)) && new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === value.slice(0, 10))) fail(400, 'Provide valid start and end date-times with a time zone.');
    const start = Math.max(Date.parse(body.startsAt), Date.parse(current.serverTime));
    const end = Date.parse(body.endsAt);
    if (end <= start) fail(400, 'The end must be later than the start and the current time.');
    const rows = await query('INSERT INTO survey_periods(starts_at,ends_at,created_by) VALUES($1,$2,$3) RETURNING id', [new Date(start).toISOString(), new Date(end).toISOString(), username]);
    await query('UPDATE survey_control SET period_id=$1,revision=revision+1 WHERE id=1', [rows[0].id]);
  }
  return getAvailability(query);
}

module.exports = { getAvailability, windowState, lockControl, assertOpen, changeWindow };
