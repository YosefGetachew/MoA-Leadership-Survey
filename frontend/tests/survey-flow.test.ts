import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSurveyPages, sanitizeDraft, isWholeYearInput, demographicIssues, validDemographics, evaluatorLevels, type SurveySection } from '../src/surveyFlow.ts';
const sections = JSON.parse(readFileSync(new URL('../src/levelSurveyQuestions.json', import.meta.url),'utf8')) as SurveySection[];
test('each demographic field reports a specific correction', () => {
  assert.deepEqual(demographicIssues({sex:'',age:'',workExperience:''}), {sex:'sexRequired',age:'yearRequired',workExperience:'yearRequired'});
  assert.deepEqual(demographicIssues({sex:'female',age:'45.5',workExperience:'4.5'}), {age:'wholeYearWarning',workExperience:'wholeYearWarning'});
  assert.deepEqual(demographicIssues({sex:'male',age:'17',workExperience:'0'}), {age:'ageRange'});
  assert.deepEqual(demographicIssues({sex:'male',age:'46',workExperience:'50'}), {workExperience:'experienceRange'});
  assert.deepEqual(demographicIssues({sex:'male',age:'46',workExperience:'0'}), {});
});
test('year validation flags decimals without modifying the input', () => {
  for (const value of ['', '0', '46', '100']) assert.equal(isWholeYearInput(value), true);
  for (const value of ['45.5', '45 years', '1e2', '-1', '+46', ' 46', '46 ', '1,000', '1234']) assert.equal(isWholeYearInput(value), false);
});
test('decimal entries survive draft restoration unchanged and cannot pass validation', () => {
  for (const value of ['4.5', '45.5', '45.', '1e2']) {
    const draft = sanitizeDraft({ evaluatorLevel: 'expert', demographics: { sex: 'female', age: value, workExperience: value } }, sections);
    assert.equal(draft.demographics.age, value);
    assert.equal(draft.demographics.workExperience, value);
    assert.equal(validDemographics(draft.demographics), false);
  }
});
test('all respondents follow evaluator information, senior, middle, lower with numbering restarted per section',()=>{
  assert.equal(evaluatorLevels.length,4);
  const pages=buildSurveyPages([...sections].reverse());
  assert.equal(pages.length,16);
  assert.equal(pages[0].level,'demographics');assert.equal(pages[1].level,'high_level');
  assert.equal(pages[6].level,'middle_level');assert.equal(pages[12].level,'lower_level');
  assert.equal(pages[1].offset,0);assert.equal(pages[6].offset,0);assert.equal(pages[12].offset,0);
  const codes=pages.flatMap(page=>page.questions.map(q=>q.code));
  assert.equal(codes.length,69);assert.equal(new Set(codes).size,69);
  for (const section of sections) {
    const numbers = pages.filter(page => page.level === section.level).flatMap(page => page.questions.map((_, index) => page.offset + index + 1));
    assert.deepEqual(numbers, Array.from({length: section.questions.length}, (_, index) => index + 1));
  }
  assert.equal(pages.at(-1)!.offset+pages.at(-1)!.questions.length,18);
});
test('drafts retain demographics and ratings but not removed fields',()=>{
  const draft=sanitizeDraft({evaluatorLevel:'expert',demographics:{sex:'male',age:'30',workExperience:'0'},evaluator:{organization:'removed'},targets:{high_level:{position:'removed'}},overallAnswers:{OR01:4},answers:{HL01:6,ML01:4,LL01:3,OR01:4,WRONG:4,HL02:7}},sections);
  assert.deepEqual(draft.answers,{HL01:6,ML01:4,LL01:3});
  assert.equal(draft.evaluatorLevel,'expert');
  assert.deepEqual(draft.demographics,{sex:'male',age:'30',workExperience:'0'});
  assert.deepEqual(Object.keys(draft).sort(),['answers','demographics','evaluatorLevel']);
  assert.equal(sanitizeDraft({evaluatorLevel:'invalid'},sections).evaluatorLevel,'');
  assert.equal(sanitizeDraft(null,sections).evaluatorLevel,'');
});
test('demographics require sex, valid whole-year age and experience; zero experience is valid',()=>{
  const info={sex:'female' as const,age:'35',workExperience:'0'};
  assert.equal(validDemographics(info),true);
  for(const fields of [{sex:'' as const},{age:''},{age:'17'},{age:'101'},{age:'35.5'},{workExperience:''},{workExperience:'-1'},{workExperience:'36'},{workExperience:'2.5'}]) assert.equal(validDemographics({...info,...fields}),false);
});
