import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDates, clock24, ethiopianMonths, ethiopianParts, ethiopianToGregorian } from '../src/surveyCalendar.ts';

test('Ethiopian dates match Gregorian dates including new year and Pagume leap day', () => {
  assert.equal(ethiopianToGregorian(2018, 12, 25), '2026-08-31');
  assert.equal(ethiopianToGregorian(2018, 13, 5), '2026-09-10');
  assert.equal(ethiopianToGregorian(2018, 13, 6), null);
  assert.equal(ethiopianToGregorian(2019, 1, 1), '2026-09-11');
  assert.equal(ethiopianToGregorian(2015, 13, 6), '2023-09-11');
  assert.equal(ethiopianToGregorian(2016, 1, 1), '2023-09-12');
  for (const args of [[2018, 1, 31], [2018, 0, 1], [2018, 14, 1], [2018, 1, 0], [2018.5, 1, 1], [1899, 1, 1]]) {
    assert.equal(ethiopianToGregorian(args[0], args[1], args[2]), null);
  }
  for (let offset = 0; offset < 1462; offset++) {
    const date = new Date(Date.UTC(2023, 0, 1 + offset, 12));
    const ec = ethiopianParts(date);
    assert.equal(ethiopianToGregorian(ec.year, ec.month, ec.day), date.toISOString().slice(0, 10));
  }
});

test('dual dates and AM/PM use UTC+3, including midnight date rollover', () => {
  const dates = calendarDates('2026-08-31T20:26:00Z');
  assert.match(dates.ethiopian, /25.*2018/);
  assert.equal(dates.gregorian, '31 August 2026');
  assert.equal(dates.time, '11:26 PM');
  const midnight = calendarDates('2026-09-10T21:00:00Z');
  assert.match(midnight.ethiopian, /1.*2019/);
  assert.equal(midnight.gregorian, '11 September 2026');
  assert.equal(midnight.time, '12:00 AM');
  assert.equal(calendarDates('2026-08-31T09:00:00Z').time, '12:00 PM');
  assert.equal(calendarDates('2026-08-31T20:26:00Z', 'am').ethiopian, '25 ነሃሴ 2018');
});

test('all Ethiopian month names are Amharic in both interface languages', () => {
  for (let month = 1; month <= 13; month++) {
    const date = ethiopianToGregorian(2018, month, 2);
    for (const language of ['en', 'am'] as const) {
      const display = calendarDates(`${date}T12:00:00Z`, language).ethiopian;
      assert.equal(display, `2 ${ethiopianMonths[month - 1]} 2018`);
      assert.doesNotMatch(display, /[A-Za-z]/);
    }
  }
  assert.equal(calendarDates('2026-09-07T20:46:00Z').ethiopian, '2 ጳጉሜ 2018');
});

test('12-hour input converts noon and midnight without shifting the timezone', () => {
  assert.equal(clock24('12', '00', 'AM'), '00:00');
  assert.equal(clock24('12', '30', 'PM'), '12:30');
  assert.equal(clock24('11', '26', 'PM'), '23:26');
  assert.equal(clock24('1', '05', 'AM'), '01:05');
  assert.equal(clock24('0', '00', 'AM'), null);
  assert.equal(clock24('13', '00', 'PM'), null);
  assert.equal(clock24('1', '60', 'AM'), null);
});
