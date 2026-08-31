const sections = require('../frontend/src/levelSurveyQuestions.json');

const evaluatorLabels = {
  senior_leadership: 'Senior Leadership', middle_leadership: 'Middle Leadership',
  lower_leadership: 'Lower Leadership', expert: 'Expert',
};
const sexLabels = { male: 'Male', female: 'Female' };
const coverageLabels = Object.fromEntries(sections.map(section => [section.level, section.title]));
function csvCell(value) {
  let text = String(value ?? '');
  // Quoting alone does not prevent spreadsheet formula execution.
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function rating(value) {
  if (value === 6) return 'N/A';
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : '';
}
function buildSurveyCsv(rows) {
  const questions = sections.flatMap(section => section.questions.map((question, index) => ({
    code: question.code, header: `${section.title} ${index + 1} (${question.code})`,
  })));
  const headers = ['ID', 'Survey version', 'Assessed levels', 'Evaluator leadership level', 'Sex', 'Age (years)', 'Work experience (years)', 'Submitted at (UTC)', ...questions.map(question => question.header)];
  const records = rows.map(row => [
    row.id, row.survey_version,
    row.leadership_level === 'all_levels' ? 'Senior, Middle and Lower Leadership' : coverageLabels[row.leadership_level] || '',
    evaluatorLabels[row.evaluator_level] || '', sexLabels[row.sex] || '', row.age, row.work_experience,
    new Date(row.completed_at).toISOString(), ...questions.map(question => rating(row.responses?.[question.code])),
  ]);
  // UTF-8 BOM and CRLF make the download straightforward to open in Excel.
  return '\uFEFF' + [headers, ...records].map(record => record.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
module.exports = { buildSurveyCsv };
