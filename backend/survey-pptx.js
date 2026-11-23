const PptxGenJS = require('pptxgenjs');

const green = '0B5D44';
const muted = '5F746A';
const light = 'EAF3EE';
const fmt = value => value === null || value === undefined ? '—' : typeof value === 'number' ? value.toFixed(2) : String(value);
const pct = value => value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`;
function addTitle(slide, title, subtitle) {
  slide.addText(title, { x: 0.45, y: 0.3, w: 12.4, h: 0.4, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: green });
  if (subtitle) slide.addText(subtitle, { x: 0.45, y: 0.78, w: 12.2, h: 0.3, fontSize: 10, color: muted });
}
function addTable(slide, rows, y, options = {}) {
  if (!rows.length) { slide.addText('No data available.', { x: 0.55, y, w: 11.5, h: 0.3, fontSize: 12, color: muted }); return; }
  slide.addTable(rows, { x: 0.55, y, w: 12.1, h: options.h || 5.7, fontSize: options.fontSize || 10, color: '17352A', border: { type: 'solid', color: 'C9D9CF', pt: 0.6 }, fill: 'FFFFFF', margin: 0.06, rowH: 0.28, autoFit: false, ...(options.table || {}) });
}
async function buildSummaryPptx(analysis, surveyName, filterDescription) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'MoA Leadership Survey';
  pptx.subject = 'Survey analysis summary';
  pptx.title = `${surveyName} – analysis summary`;
  pptx.company = 'Ministry of Agriculture';
  pptx.lang = 'en-US';

  let slide = pptx.addSlide();
  slide.background = { color: green };
  slide.addText('Leadership survey analysis', { x: 0.7, y: 1.5, w: 11.8, h: 0.7, fontSize: 30, bold: true, color: 'FFFFFF' });
  slide.addText(surveyName, { x: 0.7, y: 2.35, w: 11.8, h: 0.5, fontSize: 20, color: 'D8F0E2' });
  slide.addText(`Summary generated ${new Date(analysis.generatedAt).toLocaleString()}\n${filterDescription}`, { x: 0.7, y: 5.8, w: 11.8, h: 0.7, fontSize: 12, color: 'E8F5ED' });

  slide = pptx.addSlide(); addTitle(slide, 'Headline results', 'Descriptive results from submitted assessments; not an estimate of the whole workforce.');
  addTable(slide, [
    ['Metric', 'Result'],
    ['Submitted assessments', String(analysis.summary.totalResponses)],
    ['Average leadership rating', `${fmt(analysis.summary.averageScore)} / 5`],
    ['Favorable ratings (4–5)', pct(analysis.summary.favorableRate)],
    ['N/A selections', pct(analysis.summary.naRate)],
    ['Valid ratings', String(analysis.summary.validRatings)],
    ['Complete submissions', pct(analysis.summary.completeRate)],
  ], 1.25, { fontSize: 14, h: 4.7, table: { colW: [5.8, 5.8], bold: false } });

  slide = pptx.addSlide(); addTitle(slide, 'Respondent statistics', 'Counts and shares use the selected analysis filters.');
  const respondentRows = [['Dimension', 'Group', 'Count', 'Share']];
  [['Evaluator level', analysis.respondentStatistics.evaluatorLevels], ['Sex', analysis.respondentStatistics.sex], ['Age group', analysis.respondentStatistics.ageGroups]].forEach(([dimension, groups]) => groups.forEach(group => respondentRows.push([dimension, group.label, String(group.count), pct(group.percent)])));
  addTable(slide, respondentRows, 1.15, { fontSize: 10, h: 5.8 });

  slide = pptx.addSlide(); addTitle(slide, 'Daily submission audit', 'Submissions by UTC calendar day.');
  addTable(slide, [['Date', 'Submissions'], ...analysis.daily.map(row => [row.date, String(row.submissions)])], 1.1, { fontSize: 11, h: 5.9, table: { colW: [5.8, 5.8] } });

  slide = pptx.addSlide(); addTitle(slide, 'Leadership-level comparison', 'Respondent means by leadership section.');
  addTable(slide, [['Leadership level', 'Mean / 5', 'Scored', 'Submitted'], ...analysis.levels.map(level => [level.title, fmt(level.respondentMean), String(level.scoredSubmissions), String(level.submissions)])], 1.1, { fontSize: 12, h: 5.8 });

  slide = pptx.addSlide(); addTitle(slide, 'Question-level priorities and strengths', 'Statements with sufficient valid ratings for ranking.');
  addTable(slide, [['Type', 'Question', 'Mean', 'Valid n'], ...[...analysis.priorities.map(item => ['Lower scoring', item.text, fmt(item.average), String(item.valid)]), ...analysis.strengths.map(item => ['Higher scoring', item.text, fmt(item.average), String(item.valid)])]], 1.05, { fontSize: 9, h: 6 });

  slide = pptx.addSlide(); addTitle(slide, 'Coverage and response quality', 'Quality flags identify records for review; they do not automatically invalidate responses.');
  addTable(slide, [['Measure', 'Value'], ['Expected ratings', String(analysis.quality.expectedRatings)], ['Valid ratings', String(analysis.quality.validRatings)], ['N/A ratings', String(analysis.quality.naRatings)], ['Missing ratings', String(analysis.quality.missingRatings)], ['Invalid ratings', String(analysis.quality.invalidRatings)], ['Complete submissions', String(analysis.quality.completeSubmissions)], ['Uniform rating flags', String(analysis.quality.straightLineSubmissions)], ['Missing demographics', String(analysis.quality.missingDemographics)]], 1.05, { fontSize: 11, h: 5.8 });

  slide = pptx.addSlide(); addTitle(slide, 'Open-ended feedback', 'Responses are shown verbatim for qualitative review.');
  const feedback = [['Question', 'Responses']];
  analysis.qualitative.forEach(question => feedback.push([question.text, String(question.responses.length)]));
  addTable(slide, feedback, 1.05, { fontSize: 10, h: 2.6 });
  const excerpts = analysis.qualitative.flatMap(question => question.responses.slice(0, 6).map(response => [`${question.code}: ${question.text}`, response.text])).slice(0, 12);
  if (excerpts.length) addTable(slide, [['Question', 'Response excerpt'], ...excerpts], 3.2, { fontSize: 8, h: 3.2 });

  return pptx.write({ outputType: 'nodebuffer' });
}
module.exports = { buildSummaryPptx };
