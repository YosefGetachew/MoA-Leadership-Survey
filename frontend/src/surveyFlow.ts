import questionnaire from "./levelSurveyQuestions.json" with { type: "json" };
import { amharicLevels } from "./amharic.ts";
export type LeadershipLevel = 'high_level' | 'middle_level' | 'lower_level';
export type EvaluatorLevel = 'senior_leadership' | 'middle_leadership' | 'lower_leadership' | 'expert';
export type Answers = Record<string, number>;
export interface MatrixQuestion { code: string; text: string; textAm?: string; dimension?: string }
export interface SurveySection { level: LeadershipLevel; title: string; audience: string; questions: MatrixQuestion[] }
export const SURVEY_VERSION = 'leadership-demographics-v4';
export const DRAFT_KEY = 'leadership-demographics-draft-v4';
export const evaluatorLevels: Array<{ value: EvaluatorLevel; title: string; titleAm: string; description: string; descriptionAm: string }> = [
  { value: 'senior_leadership', title: 'Senior Leadership', titleAm: 'ከፍተኛ ደረጃ አመራር', description: questionnaire[0].audience, descriptionAm: amharicLevels.high_level.audience },
  { value: 'middle_leadership', title: 'Middle Leadership', titleAm: 'መካከለኛ ደረጃ አመራር', description: questionnaire[1].audience, descriptionAm: amharicLevels.middle_level.audience },
  { value: 'lower_leadership', title: 'Lower Leadership', titleAm: 'የታችኛው ደረጃ አመራር', description: questionnaire[2].audience, descriptionAm: amharicLevels.lower_level.audience },
  { value: 'expert', title: 'Expert', titleAm: 'ባለሙያ', description: 'Technical and professional staff without a leadership or supervisory role.', descriptionAm: 'የአመራር ወይም የቁጥጥር ኃላፊነት የሌላቸው የቴክኒክና ሙያዊ ሠራተኞች።' },
];

export function buildSurveyPages(sections: SurveySection[], size = 5) {
  const pages: Array<{ level: LeadershipLevel | 'demographics'; questions: MatrixQuestion[]; offset: number }> = [{ level: 'demographics', questions: [], offset: 0 }];
  if (!Number.isInteger(size) || size < 1) throw new Error("Invalid page size");
  for (const level of ['high_level', 'middle_level', 'lower_level'] as const) {
    const section = sections.find(item => item.level === level);
    if (!section) throw new Error(`Missing questionnaire: ${level}`);
    for (let index = 0; index < section.questions.length; index += size) pages.push({ level, questions: section.questions.slice(index, index + size), offset: index });
  }
  return pages;
}

export function sectionTransition(pages: ReturnType<typeof buildSurveyPages>, page: number): { from: LeadershipLevel; to: LeadershipLevel | null } | null {
  const current = pages[page];
  const next = pages[page + 1];
  if (!current || current.level === 'demographics' || current.level === next?.level) return null;
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
export function sanitizeDraft(raw: unknown, sections: SurveySection[]): { evaluatorLevel: EvaluatorLevel | ''; answers: Answers; demographics: Demographics } {
  const empty = { evaluatorLevel: '' as EvaluatorLevel | '', answers: {} as Answers, demographics: emptyDemographics() };
  if (!raw || typeof raw !== 'object') return empty;
  const saved = raw as Record<string, unknown>;
  const codes = sections.flatMap(section => section.questions.map(question => question.code));
  const answers = saved.answers && typeof saved.answers === 'object' ? Object.fromEntries(Object.entries(saved.answers).filter(([code, score]) => codes.includes(code) && Number.isInteger(score) && score >= 1 && score <= 6)) : {};
  const info = saved.demographics && typeof saved.demographics === 'object' ? saved.demographics as Record<string, unknown> : {};
  return {
    evaluatorLevel: evaluatorLevels.some(item => item.value === saved.evaluatorLevel) ? saved.evaluatorLevel as EvaluatorLevel : '' as const,
    answers,
    demographics: {
      sex: info.sex === 'male' || info.sex === 'female' ? info.sex : '' as const,
      age: typeof info.age === 'string' ? info.age : '',
      workExperience: typeof info.workExperience === 'string' ? info.workExperience : '',
    },
  };
}
