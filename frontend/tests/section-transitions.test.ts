import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSurveyPages, sectionTransition } from '../src/surveyFlow.ts';
import sections from '../src/levelSurveyQuestions.json' with { type: 'json' };
import type { SurveySection } from '../src/surveyFlow.ts';

test('section transitions occur only at Senior, Middle and Lower section endings', () => {
  const pages = buildSurveyPages(sections as SurveySection[]);
  assert.equal(sectionTransition(pages, -1), null);
  assert.equal(sectionTransition(pages, 0), null);
  assert.equal(sectionTransition(pages, 4), null);
  assert.deepEqual(sectionTransition(pages, 5), { from: 'high_level', to: 'middle_level' });
  assert.deepEqual(sectionTransition(pages, 11), { from: 'middle_level', to: 'lower_level' });
  assert.deepEqual(sectionTransition(pages, 15), { from: 'lower_level', to: null });
  assert.equal(pages[6].offset, 0); assert.equal(pages[12].offset, 0);
  assert.equal(pages.reduce((sum, page) => sum + page.questions.length, 0), 69);
});
