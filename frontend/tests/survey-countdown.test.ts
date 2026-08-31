import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingSurveyLabel, surveyTimeRemaining } from '../src/surveyCountdown.ts';

test('countdown reports days, hours and minutes until the shared closing time', () => {
  const now = Date.parse('2026-08-31T09:00:00Z');
  assert.deepEqual(surveyTimeRemaining('2026-09-02T12:12:00Z', now), { expired: false, lessThanMinute: false, days: 2, hours: 3, minutes: 12 });
  assert.equal(remainingSurveyLabel('2026-09-02T12:12:00Z', now, 'en'), 'You have 2 days, 3 hours, 12 minutes left.');
  assert.equal(remainingSurveyLabel('2026-09-02T12:12:00Z', now, 'am'), '2 ቀን, 3 ሰዓት, 12 ደቂቃ ቀርቷል።');
  assert.equal(remainingSurveyLabel('2026-08-31T13:01:00+03:00', now, 'en'), 'You have 1 hour, 1 minute left.');
});

test('countdown never rounds up a day or becomes negative at closure', () => {
  const end = '2026-09-01T00:00:00Z';
  const deadline = Date.parse(end);
  assert.equal(remainingSurveyLabel(end, deadline - 86400000, 'en'), 'You have 1 day left.');
  assert.equal(remainingSurveyLabel(end, deadline - 86399999, 'en'), 'You have 23 hours, 59 minutes left.');
  assert.equal(remainingSurveyLabel(end, deadline - 60000, 'en'), 'You have 1 minute left.');
  assert.equal(remainingSurveyLabel(end, deadline - 1, 'en'), 'Less than 1 minute left.');
  for (const now of [deadline, deadline + 86400000]) {
    assert.equal(remainingSurveyLabel(end, now, 'en'), 'The survey period has ended.');
    assert.equal(remainingSurveyLabel(end, now, 'am'), 'የዳሰሳ ጥናቱ ጊዜ አብቅቷል።');
    assert.equal(surveyTimeRemaining(end, now).days, 0);
  }
});
