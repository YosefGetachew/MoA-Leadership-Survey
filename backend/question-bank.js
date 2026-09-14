const QUESTION_CATEGORIES = new Map([
  ['high_level', { level: 'high_level', title: 'Senior Leadership', audience: 'Mministers, state ministers, directors general, commissioners, bureau heads and equivalent senior executives' }],
  ['middle_level', { level: 'middle_level', title: 'Middle Leadership', audience: 'Lead executives, executives, advisors, and project coordinators' }],
  ['lower_level', { level: 'lower_level', title: 'Lower Leadership', audience: 'Team leaders, Desk head' }],
]);
const QUESTION_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,19}$/;
const { normalizeSurveySettings } = require('./survey-catalog');

function rowsToSections(rows, surveySettings) {
  const settings = normalizeSurveySettings(surveySettings);
  return [...QUESTION_CATEGORIES.values()].map(category => ({
    level: category.level,
    title: settings.categories[category.level].titleEn,
    titleAm: settings.categories[category.level].titleAm,
    audience: settings.categories[category.level].audienceEn,
    audienceAm: settings.categories[category.level].audienceAm,
    questions: rows
      .filter(row => row.leadershipLevel === category.level)
      .map(row => ({
        code: row.code,
        text: row.textEn,
        textAm: row.textAm,
        dimension: row.dimension || undefined,
        sortOrder: row.sortOrder,
        active: row.active,
      })),
  }));
}

async function getQuestionSections(query, { includeInactive = false, surveyId = 1 } = {}) {
  const survey = (await query('SELECT settings FROM surveys WHERE id=$1', [surveyId]))[0];
  const rows = await query(
    `SELECT code,text_en AS "textEn",text_am AS "textAm",dimension,
            leadership_level AS "leadershipLevel",sort_order AS "sortOrder",active,
            updated_at AS "updatedAt",updated_by AS "updatedBy"
     FROM survey_questions
     WHERE survey_id=$1 ${includeInactive ? '' : 'AND active=true'}
     ORDER BY leadership_level,sort_order,code`,
    [surveyId],
  );
  return rowsToSections(rows, survey?.settings);
}

async function getOpenEndedQuestions(query, { includeInactive = false, surveyId = 1 } = {}) {
  return query(
    `SELECT code,text_en AS text,text_am AS "textAm",dimension,sort_order AS "sortOrder",active,
            updated_at AS "updatedAt",updated_by AS "updatedBy"
     FROM survey_questions
     WHERE survey_id=$1 AND leadership_level='open_ended' ${includeInactive ? '' : 'AND active=true'}
     ORDER BY sort_order,code`,
    [surveyId],
  );
}

function questionCodes(sections) {
  return sections.flatMap(section => section.questions.filter(question => question.active !== false).map(question => question.code));
}

module.exports = { QUESTION_CATEGORIES, QUESTION_CODE_PATTERN, getQuestionSections, getOpenEndedQuestions, questionCodes, rowsToSections };
