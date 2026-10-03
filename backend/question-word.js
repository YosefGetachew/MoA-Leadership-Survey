const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, HeadingLevel } = require('docx');
const mammoth = require('mammoth');

const HEADERS = [
  'Questionnaire code',
  'Category code',
  'Display order',
  'Analysis dimension',
  'Active',
  'English question',
  'Amharic question',
];

const CATEGORY_LABELS = {
  high_level: 'Senior Leadership',
  middle_level: 'Middle Leadership',
  lower_level: 'Lower Leadership',
  open_ended: 'Open-ended questions',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

function cell(value, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(value ?? ''), bold })] })],
  });
}

async function buildQuestionWordDocument({ survey, questions }) {
  const rows = questions.map(question => new TableRow({
    children: [
      cell(question.code),
      cell(question.leadershipLevel),
      cell(question.sortOrder),
      cell(question.dimension || ''),
      cell(question.active ? 'Yes' : 'No'),
      cell(question.textEn),
      cell(question.textAm),
    ],
  }));
  const document = new Document({
    creator: 'Ministry of Agriculture Leadership Survey',
    title: `${survey.nameEn} questionnaire`,
    description: 'Editable bilingual questionnaire import template',
    sections: [{
      children: [
        new Paragraph({ text: survey.nameEn, heading: HeadingLevel.TITLE }),
        survey.nameAm ? new Paragraph({ text: survey.nameAm }) : new Paragraph({ text: '' }),
        new Paragraph({ text: 'Questionnaire import/export file', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Edit the English and Amharic question cells, or add new rows. Do not rename or reorder the column headings. For existing questionnaire codes, the import updates only the English and Amharic wording; their other settings remain unchanged. Importing does not delete questions that are omitted from this file.' }),
        new Paragraph({ text: `Category codes: ${Object.entries(CATEGORY_LABELS).map(([code, label]) => `${code} (${label})`).join('; ')}.` }),
        new Paragraph({ text: 'For new questions: use a unique code beginning with a letter; enter a whole-number display order; use Yes or No for Active; and provide both English and Amharic wording.' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ tableHeader: true, children: HEADERS.map(header => cell(header, true)) }), ...rows],
        }),
      ],
    }],
  });
  return Packer.toBuffer(document);
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function htmlCellText(value) {
  return decodeHtml(value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\r/g, '')
    .split('\n').map(part => part.trim()).filter(Boolean).join('\n').trim();
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseActive(value, rowNumber) {
  const normalized = value.toLowerCase().trim();
  if (['yes', 'true', '1', 'active'].includes(normalized)) return true;
  if (['no', 'false', '0', 'inactive'].includes(normalized)) return false;
  throw Object.assign(new Error(`Row ${rowNumber}: Active must be Yes or No.`), { statusCode: 400 });
}

async function parseQuestionWordDocument(buffer) {
  const converted = await mammoth.convertToHtml({ buffer });
  const tables = converted.value.match(/<table[\s\S]*?<\/table>/gi) || [];
  const required = HEADERS.map(normalizeHeader);
  let selected;
  for (const table of tables) {
    const tableRows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const cells = (tableRows[0]?.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(htmlCellText).map(normalizeHeader);
    if (required.every((header, index) => cells[index] === header)) { selected = tableRows; break; }
  }
  if (!selected) throw Object.assign(new Error('The Word file does not contain the questionnaire table. Export a fresh Word file and keep its column headings unchanged.'), { statusCode: 400 });
  if (selected.length < 2) throw Object.assign(new Error('The questionnaire table does not contain any question rows.'), { statusCode: 400 });
  if (selected.length > 501) throw Object.assign(new Error('A questionnaire import can contain at most 500 questions.'), { statusCode: 400 });

  const questions = [];
  const seen = new Set();
  for (let index = 1; index < selected.length; index += 1) {
    const rowNumber = index + 1;
    const values = (selected[index].match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(htmlCellText);
    if (!values.some(Boolean)) continue;
    if (values.length < HEADERS.length) throw Object.assign(new Error(`Row ${rowNumber}: all seven questionnaire columns are required.`), { statusCode: 400 });
    const [rawCode, rawCategory, rawOrder, dimension, rawActive, textEn, textAm] = values;
    const code = rawCode.toUpperCase().trim();
    const leadershipLevel = rawCategory.toLowerCase().trim();
    const sortOrder = Number(rawOrder);
    if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) throw Object.assign(new Error(`Row ${rowNumber}: "${rawCode}" is not a valid questionnaire code.`), { statusCode: 400 });
    if (seen.has(code)) throw Object.assign(new Error(`Row ${rowNumber}: questionnaire code ${code} appears more than once.`), { statusCode: 400 });
    if (!Object.hasOwn(CATEGORY_LABELS, leadershipLevel)) throw Object.assign(new Error(`Row ${rowNumber}: "${rawCategory}" is not a valid category code.`), { statusCode: 400 });
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) throw Object.assign(new Error(`Row ${rowNumber}: Display order must be a whole number from 0 to 9999.`), { statusCode: 400 });
    if (!textEn || !textAm) throw Object.assign(new Error(`Row ${rowNumber}: both English and Amharic question text are required.`), { statusCode: 400 });
    if (textEn.length > 4000 || textAm.length > 4000) throw Object.assign(new Error(`Row ${rowNumber}: question text cannot exceed 4,000 characters.`), { statusCode: 400 });
    if (dimension.length > 120) throw Object.assign(new Error(`Row ${rowNumber}: Analysis dimension cannot exceed 120 characters.`), { statusCode: 400 });
    seen.add(code);
    questions.push({ code, leadershipLevel, sortOrder, dimension: dimension || null, active: parseActive(rawActive, rowNumber), textEn, textAm });
  }
  if (!questions.length) throw Object.assign(new Error('The questionnaire table does not contain any question rows.'), { statusCode: 400 });
  return { questions, warnings: converted.messages.map(message => message.message).filter(Boolean) };
}

module.exports = { HEADERS, CATEGORY_LABELS, CATEGORY_ORDER, buildQuestionWordDocument, parseQuestionWordDocument };
