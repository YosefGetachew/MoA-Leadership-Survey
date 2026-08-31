const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSurveyCsv } = require('../survey-csv');

// All exporter cells are quoted. Parse escaped quotes and commas for width/value checks.
function parse(csv) {
  return csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n').map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replace(/""/g, '"')));
}
const row = {id:1,survey_version:'v4',leadership_level:'all_levels',evaluator_level:'expert',sex:'female',age:46,work_experience:0,completed_at:new Date('2026-08-31T10:00:00Z'),responses:{HL01:4,ML01:6,LL18:5}};
test('clean CSV has 77 columns, section-local numbering, numeric ratings and distinct N/A', () => {
  const csv = buildSurveyCsv([row]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const [headers, values] = parse(csv);
  assert.equal(headers.length, 77); assert.equal(values.length, 77);
  assert.equal(headers[8], 'Senior Leadership 1 (HL01)');
  assert.equal(headers[31], 'Middle Leadership 1 (ML01)');
  assert.equal(headers[59], 'Lower Leadership 1 (LL01)');
  assert.equal(headers[76], 'Lower Leadership 18 (LL18)');
  assert.equal(values[3], 'Expert'); assert.equal(values[4], 'Female');
  assert.equal(values[5], '46'); assert.equal(values[6], '0');
  assert.equal(values[7], '2026-08-31T10:00:00.000Z');
  assert.equal(values[8], '4'); assert.equal(values[9], '');
  assert.equal(values[31], 'N/A'); assert.equal(values[76], '5');
  assert.doesNotMatch(csv, /OR0[1-7]|institution|evaluator_name|evaluator_contact/);
});
test('earlier rows retain coverage but do not invent demographics or unanswered ratings', () => {
  const [, values] = parse(buildSurveyCsv([{...row, leadership_level:'high_level', evaluator_level:null,sex:null,age:null,work_experience:null,responses:{HL01:3}}]));
  assert.equal(values[2], 'Senior Leadership');
  assert.deepEqual(values.slice(3,7), ['', '', '', '']);
  assert.equal(values[8], '3'); assert.equal(values[31], '');
});
test('empty exports have headers, and quoting prevents formula evaluation', () => {
  assert.equal(parse(buildSurveyCsv([])).length, 1);
  const [, values] = parse(buildSurveyCsv([{...row, survey_version:'=test,"quoted"'}]));
  assert.equal(values[1], '\'=test,"quoted"');
});
