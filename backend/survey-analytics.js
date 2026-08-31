const sections = require('../frontend/src/levelSurveyQuestions.json');
const { SURVEY_VERSION, PREVIOUS_SURVEY_VERSION, LEGACY_SURVEY_VERSION, EVALUATOR_LEVELS } = require('./survey-validation');

const versions = [SURVEY_VERSION, PREVIOUS_SURVEY_VERSION, LEGACY_SURVEY_VERSION];
const MIN_GROUP = 5;
const MIN_PAIRS = 10;
const valid = value => Number.isInteger(value) && value >= 1 && value <= 5;
const answered = value => valid(value) || value === 6;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = value => value === null ? null : Number(value.toFixed(2));
const percent = (numerator, denominator) => denominator ? round(100 * numerator / denominator) : null;
const codesFor = row => sections.filter(section => row.leadershipLevel === 'all_levels' || row.leadershipLevel === section.level).flatMap(section => section.questions.map(question => question.code));
const scoresFor = (row, codes) => codes.map(code => row.responses?.[code]);

function parseFilters(query = {}) {
  const filters = { version: query.version || SURVEY_VERSION, evaluatorLevel: query.evaluatorLevel || '', from: query.from || '', to: query.to || '' };
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  if (!versions.includes(filters.version)) fail('Select a supported survey version.');
  if (filters.evaluatorLevel && !EVALUATOR_LEVELS.includes(filters.evaluatorLevel)) fail('Select a valid evaluator category.');
  for (const date of [filters.from, filters.to]) {
    if (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) fail('Use a valid date in YYYY-MM-DD format.');
  }
  if (filters.from && filters.to && filters.from > filters.to) fail('The start date must be on or before the end date.');
  return filters;
}

function distribution(values) {
  const counts = [1, 2, 3, 4, 5, 6].map(score => values.filter(value => value === score).length);
  const scored = values.filter(valid);
  const average = mean(scored);
  const sorted = [...scored].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    counts, valid: scored.length, na: counts[5], missing: values.filter(value => value == null).length,
    invalid: values.filter(value => value != null && !answered(value)).length,
    average: round(average),
    median: sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null,
    sd: scored.length > 1 ? round(Math.sqrt(scored.reduce((sum, value) => sum + (value - average) ** 2, 0) / (scored.length - 1))) : null,
    favorable: percent(counts[3] + counts[4], scored.length),
    neutral: percent(counts[2], scored.length),
    unfavorable: percent(counts[0] + counts[1], scored.length),
    naRate: percent(counts[5], scored.length + counts[5]),
  };
}

function correlation(pairs) {
  if (pairs.length < MIN_PAIRS) return { n: pairs.length, r: null, reason: 'At least 10 paired submissions required' };
  const xMean = mean(pairs.map(pair => pair[0])), yMean = mean(pairs.map(pair => pair[1]));
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of pairs) { xx += (x - xMean) ** 2; yy += (y - yMean) ** 2; xy += (x - xMean) * (y - yMean); }
  if (xx === 0 || yy === 0) return { n: pairs.length, r: null, reason: 'Not estimable: one score has no variation' };
  return { n: pairs.length, r: round(Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy)))), reason: null };
}

function buildSurveyAnalytics(allRows, filters = parseFilters()) {
  const rows = allRows.filter(row => row.surveyVersion === filters.version
    && (!filters.evaluatorLevel || row.evaluatorLevel === filters.evaluatorLevel)
    && (!filters.from || new Date(row.completedAt).toISOString().slice(0, 10) >= filters.from)
    && (!filters.to || new Date(row.completedAt).toISOString().slice(0, 10) <= filters.to));
  const observations = rows.map(row => {
    const values = scoresFor(row, codesFor(row));
    const levelMeans = sections.map(section => {
      if (row.leadershipLevel !== 'all_levels' && row.leadershipLevel !== section.level) return null;
      const ratings = scoresFor(row, section.questions.map(question => question.code)).filter(valid);
      return ratings.length >= Math.ceil(section.questions.length / 2) ? mean(ratings) : null;
    });
    return { row, values, levelMeans, composite: levelMeans.every(value => value !== null) ? mean(levelMeans) : null };
  });
  const values = observations.flatMap(observation => observation.values);
  const overall = distribution(values);
  const levels = sections.map((section, index) => {
    const applicable = rows.filter(row => row.leadershipLevel === 'all_levels' || row.leadershipLevel === section.level);
    const means = observations.map(observation => observation.levelMeans[index]).filter(value => value !== null);
    return { level: section.level, title: section.title, submissions: applicable.length, scoredSubmissions: means.length, respondentMean: round(mean(means)), ...distribution(applicable.flatMap(row => scoresFor(row, section.questions.map(question => question.code)))) };
  });
  const items = sections.flatMap(section => section.questions.map((question, index) => {
    const applicable = rows.filter(row => row.leadershipLevel === 'all_levels' || row.leadershipLevel === section.level);
    const stats = distribution(applicable.map(row => row.responses?.[question.code]));
    return { code: question.code, text: question.text, number: index + 1, leadershipLevel: section.level, title: section.title, responses: stats.valid, ...stats };
  }));
  const ranked = items.filter(item => item.valid >= MIN_GROUP).sort((a, b) => a.average - b.average || a.code.localeCompare(b.code));
  const makeGroups = (dimension, labels, keyOf) => ({ dimension, groups: labels.map(label => {
    const group = observations.filter(observation => keyOf(observation.row) === label);
    const composites = group.map(observation => observation.composite).filter(value => value !== null);
    return { label, submissions: group.length, scoredSubmissions: composites.length, average: composites.length >= MIN_GROUP ? round(mean(composites)) : null,
      levels: sections.map((section, index) => {
        const means = group.map(observation => observation.levelMeans[index]).filter(value => value !== null);
        return { level: section.level, n: means.length, average: means.length >= MIN_GROUP ? round(mean(means)) : null };
      }) };
  }) });
  const demographics = [
    makeGroups('Evaluator category', [...EVALUATOR_LEVELS, 'Not collected'], row => EVALUATOR_LEVELS.includes(row.evaluatorLevel) ? row.evaluatorLevel : 'Not collected'),
    makeGroups('Sex', ['Male', 'Female', 'Not collected'], row => row.sex === 'male' ? 'Male' : row.sex === 'female' ? 'Female' : 'Not collected'),
    makeGroups('Age (years)', ['18–29', '30–39', '40–49', '50–59', '60–100', 'Not collected'], row => !Number.isInteger(row.age) || row.age < 18 || row.age > 100 ? 'Not collected' : row.age < 30 ? '18–29' : row.age < 40 ? '30–39' : row.age < 50 ? '40–49' : row.age < 60 ? '50–59' : '60–100'),
    makeGroups('Work experience (years)', ['0–5', '6–10', '11–20', '21+', 'Not collected'], row => !Number.isInteger(row.workExperience) || row.workExperience < 0 ? 'Not collected' : row.workExperience <= 5 ? '0–5' : row.workExperience <= 10 ? '6–10' : row.workExperience <= 20 ? '11–20' : '21+'),
  ];
  const correlations = sections.flatMap((section, index) => sections.slice(index + 1).map((other, offset) => ({
    first: section.title, second: other.title,
    ...correlation(observations.map(observation => [observation.levelMeans[index], observation.levelMeans[index + offset + 1]]).filter(pair => pair.every(value => value !== null))),
  })));
  const weekly = new Map();
  for (const observation of observations) {
    const date = new Date(observation.row.completedAt);
    if (!Number.isFinite(date.getTime())) continue;
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const week = date.toISOString().slice(0, 10);
    const bucket = weekly.get(week) || { week, submissions: 0, values: [] };
    bucket.submissions++; bucket.values.push(...observation.values); weekly.set(week, bucket);
  }
  const complete = observations.filter(observation => observation.values.length > 0 && observation.values.every(answered)).length;
  const quality = {
    expectedRatings: values.length, validRatings: overall.valid, naRatings: overall.na, missingRatings: overall.missing, invalidRatings: overall.invalid,
    completeSubmissions: complete,
    allNaSubmissions: observations.filter(observation => observation.values.length && observation.values.every(value => value === 6)).length,
    straightLineSubmissions: observations.filter(observation => observation.values.filter(valid).length >= 10 && new Set(observation.values.filter(valid)).size === 1).length,
    missingDemographics: rows.filter(row => !['male', 'female'].includes(row.sex) || !Number.isInteger(row.age) || row.age < 18 || row.age > 100 || !Number.isInteger(row.workExperience) || row.workExperience < 0 || row.workExperience > row.age).length,
  };
  return {
    version: filters.version, filters, generatedAt: new Date().toISOString(),
    availableVersions: versions.map(version => ({ version, count: allRows.filter(row => row.surveyVersion === version).length })),
    summary: { totalResponses: rows.length, levelCounts: Object.fromEntries(levels.map(level => [level.level, level.submissions])), averageScore: overall.average,
      naRate: overall.naRate, completeRate: percent(complete, rows.length), favorableRate: overall.favorable, validRatings: overall.valid },
    levels, items, demographics, correlations, quality,
    priorities: ranked.slice(0, 5), strengths: [...ranked].sort((a, b) => b.average - a.average || a.code.localeCompare(b.code)).slice(0, 5),
    weekly: [...weekly.values()].sort((a, b) => a.week.localeCompare(b.week)).map(bucket => ({ week: bucket.week, submissions: bucket.submissions, ...distribution(bucket.values) })),
    // Explicit projection keeps raw ratings and obsolete personal/registry fields out of this response.
    recentResponses: [...rows].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 100).map(row => ({
      id: row.id, leadershipLevel: row.leadershipLevel, evaluatorLevel: row.evaluatorLevel, sex: row.sex, age: row.age, workExperience: row.workExperience,
      answeredCount: scoresFor(row, codesFor(row)).filter(answered).length, naCount: scoresFor(row, codesFor(row)).filter(value => value === 6).length, completedAt: row.completedAt,
    })),
  };
}

module.exports = { buildSurveyAnalytics, parseFilters, distribution, correlation };
