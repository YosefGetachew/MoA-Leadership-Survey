const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQuestionWordDocument, parseQuestionWordDocument } = require('../question-word');

test('Word questionnaire export can be imported without losing bilingual content', async () => {
  const source = [{
    code: 'HL01', leadershipLevel: 'high_level', sortOrder: 10, dimension: 'Vision', active: true,
    textEn: 'Communicates a clear vision.', textAm: 'ግልጽ ራዕይ ያስተላልፋል።',
  }, {
    code: 'GQ1', leadershipLevel: 'open_ended', sortOrder: 10, dimension: null, active: true,
    textEn: 'What works well?', textAm: 'በጥሩ ሁኔታ የሚሰራው ምንድን ነው?',
  }];
  const buffer = await buildQuestionWordDocument({ survey: { nameEn: 'Leadership Survey', nameAm: 'የአመራር ጥናት' }, questions: source });
  assert.ok(buffer.length > 1_000);
  const parsed = await parseQuestionWordDocument(buffer);
  assert.deepEqual(parsed.questions, source);
});

test('Word questionnaire import rejects documents without the template table', async () => {
  const buffer = await buildQuestionWordDocument({ survey: { nameEn: 'Empty Survey' }, questions: [] });
  await assert.rejects(() => parseQuestionWordDocument(buffer), /does not contain any question rows/i);
});
