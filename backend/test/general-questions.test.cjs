const test = require('node:test');
const assert = require('node:assert/strict');
const { GENERAL_QUESTIONS } = require('../general-questions');

test('General annual-plan library contains the 12 bilingual items in order', () => {
  assert.deepEqual(GENERAL_QUESTIONS.map(question => question.code), ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3']);
  assert.ok(GENERAL_QUESTIONS.every(question => question.leadershipLevel === 'general' && question.textEn && question.textAm));
  assert.equal(GENERAL_QUESTIONS[0].dimension, 'MOA Annual Plan Processes');
});
