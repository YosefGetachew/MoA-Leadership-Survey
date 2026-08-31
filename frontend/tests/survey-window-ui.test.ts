import test from 'node:test';
import assert from 'node:assert/strict';
import { ethiopiaInput, planWindow } from '../src/surveyWindowUi.ts';
const now = new Date('2026-08-31T12:00:00Z');

test('admin date inputs convert Ethiopia time to UTC without browser timezone assumptions', () => {
  assert.equal(ethiopiaInput(now), '2026-08-31T15:00');
  assert.deepEqual(planWindow('now', '', '2026-09-01T15:00', now), { startsAt: now.toISOString(), endsAt: '2026-09-01T12:00:00.000Z' });
  assert.deepEqual(planWindow('later', '2026-09-01T09:00', '2026-09-02T17:00', now), { startsAt: '2026-09-01T06:00:00.000Z', endsAt: '2026-09-02T14:00:00.000Z' });
});
test('admin form identifies missing, reversed, past and impossible dates before confirmation', () => {
  assert.equal(planWindow('now', '', '', now).field, 'end');
  assert.equal(planWindow('now', '', '2026-08-31T14:59', now).field, 'end');
  assert.equal(planWindow('later', '2026-08-31T14:59', '2026-09-01T16:00', now).field, 'start');
  assert.equal(planWindow('later', '2026-02-30T09:00', '2026-09-01T16:00', now).field, 'start');
  assert.equal(planWindow('later', '2026-09-01T09:00', '2026-09-01T09:00', now).field, 'end');
});
