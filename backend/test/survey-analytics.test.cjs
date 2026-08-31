const test = require('node:test');
const assert = require('node:assert/strict');
const sections = require('../../frontend/src/levelSurveyQuestions.json');
const { SURVEY_VERSION, LEGACY_SURVEY_VERSION } = require('../survey-validation');
const { buildSurveyAnalytics, parseFilters, distribution, correlation } = require('../survey-analytics');

function row(id = 1, values = [1, 3, 5], extra = {}) {
  return {
    id, surveyVersion: SURVEY_VERSION, leadershipLevel: 'all_levels', evaluatorLevel: 'expert',
    sex: 'female', age: 40, workExperience: 10, completedAt: '2026-08-31T12:00:00Z',
    responses: Object.fromEntries(sections.flatMap((section, index) => section.questions.map(question => [question.code, values[index]]))), ...extra,
  };
}

test('distributions exclude N/A, missing, malformed and out-of-range values from means', () => {
  const stats = distribution([1, 2, 3, 4, 5, 6, null, undefined, 9, '5', 1.5]);
  assert.deepEqual(stats.counts, [1, 1, 1, 1, 1, 1]);
  assert.equal(stats.average, 3); assert.equal(stats.median, 3); assert.equal(stats.sd, 1.58);
  assert.equal(stats.favorable, 40); assert.equal(stats.neutral, 20); assert.equal(stats.unfavorable, 40);
  assert.equal(stats.naRate, 16.67); assert.equal(stats.missing, 2); assert.equal(stats.invalid, 3);
  assert.equal(distribution([6]).average, null); assert.equal(distribution([]).naRate, null);
  assert.equal(distribution([1, 4]).median, 2.5);
});

test('current version is isolated; historic reform and unknown keys never enter leadership metrics', () => {
  const current = row(); current.responses.UNKNOWN = 5; current.overallResponses = { OR01: 1 };
  const legacy = row(2, [5, 5, 5], { surveyVersion: LEGACY_SURVEY_VERSION, leadershipLevel: 'high_level' });
  const results = buildSurveyAnalytics([current, legacy]);
  assert.equal(results.summary.totalResponses, 1);
  assert.equal(results.summary.averageScore, 2.86); // (23 + 28*3 + 18*5) / 69
  assert.equal(results.summary.validRatings, 69); assert.equal(results.items.length, 69);
  assert.equal(results.availableVersions.find(version => version.version === LEGACY_SURVEY_VERSION).count, 1);
  const oldResults = buildSurveyAnalytics([current, legacy], parseFilters({ version: LEGACY_SURVEY_VERSION }));
  assert.equal(oldResults.summary.totalResponses, 1); assert.equal(oldResults.summary.validRatings, 23);
  assert.equal(oldResults.levels[1].submissions, 0);
  assert.equal(oldResults.demographics[0].groups.find(group => group.label === 'expert').scoredSubmissions, 0);
  assert.equal('responses' in results.recentResponses[0], false);
  assert.equal('overallResponses' in results.recentResponses[0], false);
});

test('group comparisons use equal-level respondent means and suppress small samples', () => {
  const four = buildSurveyAnalytics(Array.from({ length: 4 }, (_, index) => row(index)));
  assert.equal(four.demographics[0].groups.find(group => group.label === 'expert').average, null);
  assert.equal(four.priorities.length, 0);
  const five = buildSurveyAnalytics(Array.from({ length: 5 }, (_, index) => row(index)));
  const group = five.demographics[0].groups.find(group => group.label === 'expert');
  assert.equal(group.average, 3); assert.equal(group.scoredSubmissions, 5);
  assert.deepEqual(group.levels.map(level => level.average), [1, 3, 5]);
  assert.equal(five.priorities.length, 5); assert.equal(five.priorities[0].code, 'HL01');
  assert.equal(five.strengths[0].code, 'LL01');
});

test('section coverage threshold, actual completeness and quality flags handle N/A and missing data', () => {
  const partial = row();
  sections[0].questions.slice(11).forEach(question => { partial.responses[question.code] = 6; });
  const allNa = row(2, [6, 6, 6]);
  const malformed = row(3, [4, 4, 4]); delete malformed.responses.HL01; malformed.responses.ML01 = '4';
  const results = buildSurveyAnalytics([partial, allNa, malformed]);
  assert.equal(results.levels[0].scoredSubmissions, 1); // 11/23 is too few; malformed has 22 valid
  assert.equal(results.quality.completeSubmissions, 2); assert.equal(results.summary.completeRate, 66.67);
  assert.equal(results.quality.expectedRatings, 207); assert.equal(results.quality.missingRatings, 1); assert.equal(results.quality.invalidRatings, 1);
  assert.equal(results.quality.allNaSubmissions, 1); assert.equal(results.quality.straightLineSubmissions, 1);
  partial.responses.HL12 = 1;
  assert.equal(buildSurveyAnalytics([partial]).levels[0].scoredSubmissions, 1); // 12/23 qualifies
});

test('Pearson pairs enforce sample and variance rules; direction is correct', () => {
  assert.equal(correlation([[1, 1]]).r, null);
  const increasing = Array.from({ length: 10 }, (_, index) => [index, index * 2]);
  assert.equal(correlation(increasing).r, 1);
  assert.equal(correlation(increasing.map(([x, y]) => [x, -y])).r, -1);
  assert.match(correlation(increasing.map(([x]) => [x, 4])).reason, /no variation/);
  const records = Array.from({ length: 10 }, (_, index) => row(index, [index % 5 + 1, index % 5 + 1, 5 - index % 5]));
  const results = buildSurveyAnalytics(records);
  assert.equal(results.correlations[0].n, 10); assert.equal(results.correlations[0].r, 1); assert.equal(results.correlations[1].r, -1);
});

test('UTC filters are inclusive, weeks start Monday, and date/category filters affect all analysis', () => {
  const records = [row(1, [1, 1, 1], { completedAt: '2026-08-30T23:59:59Z' }), row(2, [4, 4, 4], { completedAt: '2026-08-31T23:59:59Z' }), row(3, [5, 5, 5], { evaluatorLevel: 'senior_leadership' })];
  const results = buildSurveyAnalytics(records, parseFilters({ from: '2026-08-31', to: '2026-08-31', evaluatorLevel: 'expert' }));
  assert.equal(results.summary.totalResponses, 1); assert.equal(results.summary.averageScore, 4);
  assert.equal(results.weekly.length, 1); assert.equal(results.weekly[0].week, '2026-08-31');
  assert.equal(results.weekly[0].submissions, 1); assert.equal(results.recentResponses[0].id, 2);
  const all = buildSurveyAnalytics(records);
  assert.deepEqual(all.weekly.map(week => week.week), ['2026-08-24', '2026-08-31']);
  assert.equal(all.weekly.reduce((sum, week) => sum + week.submissions, 0), all.summary.totalResponses);
  assert.equal(all.levels.reduce((sum, level) => sum + level.valid + level.na + level.missing + level.invalid, 0), all.quality.expectedRatings);
  for (const query of [{ version: 'unknown' }, { evaluatorLevel: 'invalid' }, { from: '2026-02-30' }, { to: 'invalid' }, { from: '2026-09-01', to: '2026-08-01' }, { from: ['2026-08-31'] }]) assert.throws(() => parseFilters(query), error => error.statusCode === 400);
});

test('empty results and all-N/A do not manufacture zero averages or 100% response rates', () => {
  const empty = buildSurveyAnalytics([]);
  assert.equal(empty.summary.averageScore, null); assert.equal(empty.summary.completeRate, null); assert.equal(empty.summary.naRate, null);
  assert.equal(empty.weekly.length, 0); assert.equal(empty.priorities.length, 0);
  const results = buildSurveyAnalytics([row(1, [6, 6, 6])]);
  assert.equal(results.summary.naRate, 100); assert.equal(results.summary.averageScore, null);
  assert.equal(results.summary.favorableRate, null); assert.equal(results.summary.completeRate, 100);
  assert.equal(results.correlations[0].n, 0);
});
