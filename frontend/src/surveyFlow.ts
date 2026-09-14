export type LeadershipLevel = 'high_level' | 'middle_level' | 'lower_level';
export type SurveyPageLevel = LeadershipLevel | 'demographics' | 'open_ended';
export type EvaluatorLevel = 'senior_leadership' | 'middle_leadership' | 'lower_leadership' | 'expert';
export type Answers = Record<string, number>;
export type OpenEndedAnswers = Record<string, string>;
export interface MatrixQuestion { code: string; text: string; textAm?: string; dimension?: string; sortOrder?: number; active?: boolean }
export interface SurveySection { level: LeadershipLevel; title: string; titleAm?: string; audience: string; audienceAm?: string; questions: MatrixQuestion[] }
export const SURVEY_VERSION = 'leadership-demographics-v4';
export const DRAFT_KEY = 'leadership-demographics-draft-v4';
export const evaluatorLevels: Array<{ value: EvaluatorLevel; title: string; titleAm: string; description: string; descriptionAm: string }> = [
  { value: 'senior_leadership', title: 'Senior Leadership', titleAm: 'ከፍተኛ ደረጃ አመራር', description: 'Mministers, state ministers, directors general, commissioners, bureau heads and equivalent senior executives', descriptionAm: 'ሚኒስትር፣ ዴኤታዎች፣ ዳይሬክተሮች፣ ኮሚሽነሮች፣ የቢሮ ኃላፊዎች እና እኩያ የሆኑ ከፍተኛ ኃላፊዎች' },
  { value: 'middle_leadership', title: 'Middle Leadership', titleAm: 'መካከለኛ ደረጃ አመራር', description: 'Lead executives, executives, advisors, and project coordinators', descriptionAm: 'መሪ ሥራ አስፈጻሚዎች፣ ሥራ አስፈጻሚዎች፣ አማካሪዎች እና የፕሮጀክት አስተባባሪዎች' },
  { value: 'lower_leadership', title: 'Lower Leadership', titleAm: 'የታችኛው ደረጃ አመራር', description: 'Team leaders, Desk head', descriptionAm: 'የቡድን መሪዎች፣ የዴስክ ኃላፊዎች' },
  { value: 'expert', title: 'Expert', titleAm: 'ባለሙያ', description: 'Technical and professional staff without a leadership or supervisory role.', descriptionAm: 'የአመራር ወይም የቁጥጥር ኃላፊነት የሌላቸው የቴክኒክና ሙያዊ ሠራተኞች።' },
];

export function buildSurveyPages(sections: SurveySection[], size = 5, openQuestions: MatrixQuestion[] = []) {
  const pages: Array<{ level: SurveyPageLevel; questions: MatrixQuestion[]; offset: number }> = [{ level: 'demographics', questions: [], offset: 0 }];
  if (!Number.isInteger(size) || size < 1) throw new Error("Invalid page size");
  for (const level of ['high_level', 'middle_level', 'lower_level'] as const) {
    const section = sections.find(item => item.level === level);
    if (!section) throw new Error(`Missing questionnaire: ${level}`);
    for (let index = 0; index < section.questions.length; index += size) pages.push({ level, questions: section.questions.slice(index, index + size), offset: index });
  }
  if (openQuestions.length) pages.push({ level: 'open_ended', questions: openQuestions, offset: 0 });
  return pages;
}

export function sectionTransition(pages: ReturnType<typeof buildSurveyPages>, page: number): { from: LeadershipLevel; to: LeadershipLevel | 'open_ended' | null } | null {
  const current = pages[page];
  const next = pages[page + 1];
  if (!current || current.level === 'demographics' || current.level === 'open_ended' || current.level === next?.level) return null;
  return { from: current.level, to: next && next.level !== 'demographics' ? next.level : null };
}

export interface Demographics { sex: '' | 'male' | 'female'; age: string; workExperience: string }
export const emptyDemographics = (): Demographics => ({ sex: '', age: '', workExperience: '' });
// Validate without altering the typed value; an empty value is allowed while editing.
export const isWholeYearInput = (value: string) => /^[0-9]{0,3}$/.test(value);
export function demographicIssues(value: Demographics) {
  const issues: Partial<Record<keyof Demographics, 'sexRequired' | 'yearRequired' | 'wholeYearWarning' | 'ageRange' | 'experienceRange'>> = {};
  if (!['male', 'female'].includes(value.sex)) issues.sex = 'sexRequired';
  if (!value.age) issues.age = 'yearRequired';
  else if (!/^\d+$/.test(value.age)) issues.age = 'wholeYearWarning';
  else if (Number(value.age) < 18 || Number(value.age) > 100) issues.age = 'ageRange';
  if (!value.workExperience) issues.workExperience = 'yearRequired';
  else if (!/^\d+$/.test(value.workExperience)) issues.workExperience = 'wholeYearWarning';
  else if (Number(value.workExperience) > 100 || (!issues.age && Number(value.workExperience) > Number(value.age))) issues.workExperience = 'experienceRange';
  return issues;
}
export function validDemographics(value: Demographics) {
  return Object.keys(demographicIssues(value)).length === 0;
}
export function sanitizeDraft(raw: unknown, sections: SurveySection[], openQuestions: MatrixQuestion[] = []): { evaluatorLevel: EvaluatorLevel | ''; answers: Answers; openEndedAnswers: OpenEndedAnswers; demographics: Demographics } {
  const empty = { evaluatorLevel: '' as EvaluatorLevel | '', answers: {} as Answers, openEndedAnswers: {} as OpenEndedAnswers, demographics: emptyDemographics() };
  if (!raw || typeof raw !== 'object') return empty;
  const saved = raw as Record<string, unknown>;
  const codes = sections.flatMap(section => section.questions.map(question => question.code));
  const answers = saved.answers && typeof saved.answers === 'object' ? Object.fromEntries(Object.entries(saved.answers).filter(([code, score]) => codes.includes(code) && Number.isInteger(score) && score >= 1 && score <= 6)) : {};
  const openCodes = openQuestions.map(question => question.code);
  const openEndedAnswers = saved.openEndedAnswers && typeof saved.openEndedAnswers === 'object' ? Object.fromEntries(Object.entries(saved.openEndedAnswers).filter(([code, value]) => openCodes.includes(code) && typeof value === 'string').map(([code, value]) => [code, String(value).slice(0, 4000)])) : {};
  const info = saved.demographics && typeof saved.demographics === 'object' ? saved.demographics as Record<string, unknown> : {};
  return {
    evaluatorLevel: evaluatorLevels.some(item => item.value === saved.evaluatorLevel) ? saved.evaluatorLevel as EvaluatorLevel : '' as const,
    answers, openEndedAnswers,
    demographics: {
      sex: info.sex === 'male' || info.sex === 'female' ? info.sex : '' as const,
      age: typeof info.age === 'string' ? info.age : '',
      workExperience: typeof info.workExperience === 'string' ? info.workExperience : '',
    },
  };
}
