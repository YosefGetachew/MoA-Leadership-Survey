const SURVEY_VERSION = 'leadership-demographics-v4';
const PREVIOUS_SURVEY_VERSION = 'leadership-all-levels-v3';
const LEGACY_SURVEY_VERSION = 'leadership-reform-v2-2026-08-28';
const EVALUATOR_LEVELS = ['senior_leadership', 'middle_leadership', 'lower_leadership', 'expert'];
const LEADERSHIP_POSITIONS = {
  high_level: new Set(['minister', 'state_minister', 'advisor_to_minister', 'director_general']),
  middle_level: new Set(['lead_executive', 'executive', 'project_coordinator']),
  lower_level: new Set(['team_leader', 'desk_head']),
};
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
function invalid(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }

function validateScores(input, codes, message) {
  const supplied = record(input);
  if (Object.keys(supplied).some(code => !codes.includes(code))) invalid('The response contains unknown questions.');
  return Object.fromEntries(codes.map(code => {
    const value = supplied[code];
    if (!Number.isInteger(value) || value < 1 || value > 6) invalid(message);
    return [code, value];
  }));
}

function validateSubmission(input, questionCodes, openQuestionCodes) {
  const body = record(input);
  if (body.surveyVersion !== SURVEY_VERSION) invalid('The survey has changed. Please refresh and complete the current questionnaire.');
  if (!EVALUATOR_LEVELS.includes(body.evaluatorLevel)) invalid('Select your leadership level in the ministry.');
  if (!['male', 'female'].includes(body.sex)) invalid('Select Male or Female.');
  if (!Number.isInteger(body.age) || body.age < 18 || body.age > 100) invalid('Enter your age from 18 to 100 in whole years, rounding up any extra months.');
  if (!Number.isInteger(body.workExperience) || body.workExperience < 0 || body.workExperience > body.age) invalid('Enter work experience from 0 up to your age in whole years, rounding up any extra months.');
  if (!Array.isArray(questionCodes) || !questionCodes.length) invalid('The questionnaire is not configured. Contact the survey administrator.');
  const responses = validateScores(body.responses, questionCodes, 'Please complete Senior, Middle and Lower Leadership before submitting.');
  const values = Object.values(responses);
  const suppliedOpen = record(body.openEndedResponses);
  const expectedOpenCodes = Array.isArray(openQuestionCodes) ? openQuestionCodes : Object.keys(suppliedOpen);
  if (Object.keys(suppliedOpen).some(code => !expectedOpenCodes.includes(code))) invalid('The response contains unknown open-ended questions.');
  const openEndedResponses = Object.fromEntries(expectedOpenCodes.map(code => {
    const value = typeof suppliedOpen[code] === 'string' ? suppliedOpen[code].trim().slice(0, 4000) : '';
    if (!value) invalid('Please answer every open-ended question before submitting.');
    return [code, value];
  }));
  // Name and contact fields are deliberately never copied into the normalized payload.
  return {
    evaluatorLevel: body.evaluatorLevel,
    sex: body.sex, age: body.age, workExperience: body.workExperience, responses, openEndedResponses,
    answeredCount: values.length,
    naCount: values.filter(value => value === 6).length,
  };
}

module.exports = { validateSubmission, SURVEY_VERSION, PREVIOUS_SURVEY_VERSION, LEGACY_SURVEY_VERSION, LEADERSHIP_POSITIONS, EVALUATOR_LEVELS };
