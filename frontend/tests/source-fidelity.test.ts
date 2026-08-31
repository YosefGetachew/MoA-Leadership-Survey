import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { amharicLevels, amharicQuestions, amharicCopy } from '../src/amharic.ts';
import { evaluatorLevels } from '../src/surveyFlow.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/final-word-questionnaire.json', import.meta.url), 'utf8'));
const sections = JSON.parse(readFileSync(new URL('../src/levelSurveyQuestions.json', import.meta.url), 'utf8'));
test('all 69 English and 69 Amharic statements match the supplied Word wording', () => {
  assert.deepEqual(sections.map((section: { questions: unknown[] }) => section.questions.length), [23, 28, 18]);
  fixture.sections.forEach((source: { level: string; questions: Array<{ code: string; text: string; textAm: string }> }) => {
    const actual = sections.find((section: { level: string }) => section.level === source.level);
    assert.deepEqual(actual.questions.map((question: { code: string }) => question.code), source.questions.map(question => question.code));
    source.questions.forEach((question, index) => {
      assert.equal(actual.questions[index].text, question.text, `${question.code} English`);
      assert.equal(amharicQuestions[question.code], question.textAm, `${question.code} Amharic`);
    });
  });
});
test('leadership descriptions are identical in the role picker, section heading, and Word source', () => {
  fixture.sections.forEach((source: { level: string; audience: string; audienceAm: string }, index: number) => {
    assert.equal(sections[index].audience, source.audience);
    assert.equal(amharicLevels[source.level].audience, source.audienceAm);
    assert.equal(evaluatorLevels[index].description, source.audience);
    assert.equal(evaluatorLevels[index].descriptionAm, source.audienceAm);
  });
});
test('Amharic agreement labels retain the Word scale wording', () => {
  assert.equal(amharicCopy.stronglyDisagree, 'በጣም አልስማማም');
  assert.equal(amharicCopy.neither, 'አልስማማም ወይም አልቃወምም (ገለልተኛ)');
  assert.equal(amharicCopy.naLong, 'አይመለከተውም / በቂ መረጃ የለኝም');
});
