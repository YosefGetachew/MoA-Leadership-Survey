import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ResultsDashboard from "./ResultsDashboard";
import QuestionManager from "./QuestionManager";
import SurveyWindowAdmin, { PeriodInformation, windowCopy, type Availability } from "./SurveyWindow";
import SurveyPeriodNotice from "./SurveyPeriodNotice";
import SurveyCatalog, { type SurveyDefinition } from "./SurveyCatalog";
import SurveySettings from "./SurveySettings";
import UserManagement from "./UserManagement";
import { QRCodeSVG } from "qrcode.react";
import { amharicCopy, amharicLevels } from "./amharic";
import { buildSurveyPages, sectionTransition, DRAFT_KEY, emptyDemographics, demographicIssues, validDemographics, evaluatorLevels, sanitizeDraft, SURVEY_VERSION, type Answers, type OpenEndedAnswers, type Demographics, type EvaluatorLevel, type LeadershipLevel, type MatrixQuestion, type SurveySection } from "./surveyFlow";
type Language = "en" | "am";

interface AdminSession {
  authorized: boolean;
  username?: string;
  displayName?: string;
  role?: string;
}

function AdminSectionIcon({ section }: { section: "questions" | "survey" | "settings" | "statistics" | "users" }) {
  if (section === "users") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" /></svg>;
  if (section === "questions") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></svg>;
  if (section === "survey") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" /><path d="m8 15 2 2 5-5" /></svg>;
  if (section === "statistics") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4V9.55h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.66 3.8l.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 10 2.5v-.1h4.05v.1a1.7 1.7 0 0 0 .95 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4.05h-.1a1.7 1.7 0 0 0-1.7.95Z" /></svg>;
}

const QUESTIONS_PER_PAGE = 5;
const englishCopy = {
  ministry: "Ministry of Agriculture", surveyName: "Leadership Assessment Survey", admin: "Admin",
  loading: "Loading the assessment…", unavailable: "The survey service is unavailable. Please confirm that the API is running.",
  finalTool: "Final questionnaire · Vf1", title: "Leadership Assessment Questionnaire",
  qrTitle: "Scan to open the survey", qrHelp: "Use a phone camera to access this questionnaire.",
  lead: "Assess Senior, Middle and Lower Leadership in the Ministry of Agriculture based on your direct experience. We do not collect your name, email or phone number.",
  howTo: "How to answer", instructions: "All evaluators, from Senior Leadership to Expert level, will complete the same assessment.\n\nSelect your own leadership level and enter your sex, age and work experience.\n\nYour evaluation starts with Senior Leadership, continues to Middle Level Leadership, and ends with Lower Level Leadership. Complete each section before moving to the next.\n\nRate every statement from 1 to 5, or select N/A when you do not have sufficient information.",
  chooseLevel: "What is your leadership level in the ministry?", statements: "statements", estimate: "All three leadership levels",
  evaluatorLevelRequired: "Select your own leadership level in the ministry.",
  assessmentOrder: "Evaluator information → Senior Leadership → Middle Leadership → Lower Level Leadership → Expert",
  targetWarning: "Changing the leader or institution will clear answers for this leadership section only. Continue?",
  selectSector: "Select a sector or institution", specifyOther: "Specify the other sector or institution",
  evaluatedPosition: "Leadership position being evaluated", selectPosition: "Select a leadership position",
  positionHelp: "Only positions belonging to this assessment section are shown.", positionRequired: "Select the leadership position being evaluated.",
  overallSection: "Evaluator information", overallIntro: "Please fill in these three details before starting your assessment. Fields marked * are required.",
  leadershipSection: "Leadership assessment",
  evaluatedSector: "Sector / institution being evaluated", evaluatedSectorPlaceholder: "For example: Crop Development Sector or Regional Agriculture Bureau",
  sectorHelp: "Only Ministry units linked to the selected leadership position are shown.", sectorRequired: "Select the sector or institution being evaluated.",
  noSectors: "No active Ministry unit is registered for this leadership position. Please contact the survey administrator.",
  sex: "Sex", male: "Male", female: "Female", selectSex: "Select sex", age: "Age (years)", workExperience: "Work experience (years)", demographicError: "Select Male or Female, enter an age from 18 to 100, and enter work experience from 0 up to your age, in whole years.",
  ageHint: "Enter your age in years, for example 46.",
  wholeYearWarning: "Use a whole number, such as 46. Please check and update your entry.",
  sexRequired: "Please select Male or Female.", yearRequired: "Please enter the number of years.",
  ageRange: "Please enter an age between 18 and 100.", experienceRange: "Work experience cannot be more than your age.",
  yearsUnit: "years", roundingTitle: "How to enter years", roundingHelp: "If you have extra months, use the next whole year. For example: 45 years and 5 months → 46 years.",
  requiredDetails: "Required details completed", continueAssessment: "Continue to Senior Leadership",
  experienceHint: "Include your total work experience. Enter 0 if you have not worked yet.",
  evaluatorInfo: "Evaluator information", optional: "Optional", evaluatorPrivacy: "These work details are optional. Do not enter your name, email or phone number.",
  evaluatorOrganization: "Organization / unit", evaluatorPosition: "Position or job title",
  begin: "Begin assessment", page: "Page", of: "of", complete: "complete",
  stronglyDisagree: "Strongly disagree", disagree: "Disagree", neither: "Neither agree nor disagree", agree: "Agree", stronglyAgree: "Strongly agree",
  na: "N/A", naLong: "Not applicable / I do not have sufficient information",
  requiredPage: "Please answer every statement on this page. Select N/A when you do not have enough information.",
  unansweredHere: "unanswered on this page", swipeScale: "On a small screen, swipe left or right to see every rating option.",
  thisPage: "this page", total: "total", savedOnDevice: "Progress saved on this device",
  requiredAll: "Please answer every statement before submitting.", back: "Back", next: "Next", answered: "answered",
  clearSelections: "Clear choices", clearWarning: "Clear every choice selected on this page?",
  submit: "Submit assessment", submitting: "Submitting…", responseRecorded: "Response recorded",
  openSection: "Part Three: Open-ended questions", openIntro: "Before submitting, briefly answer each question in your own words.", openRequired: "Please answer every open-ended question before submitting.", characters: "characters",
  thankYou: "Thank you for completing all three leadership assessments.", saved: "Your evaluator information and all three leadership sections have been saved together.",
  singleSubmission: "Your assessment has been submitted. Only one response is allowed for this survey period.",
  adminAnother: "Start another evaluation", adminRepeatHelp: "You are signed in as an administrator. You may start a new evaluation; the previous response remains saved.",
  adminSignIn: "Administrator sign in", footer: "Ministry of Agriculture · Leadership Assessment · Responses are stored in PostgreSQL",
  changeWarning: "Changing the leadership level will clear your current answers. Continue?", saveFailed: "Your response could not be saved.",
};

function surveyScale(language: Language) {
  const copy = language === "am" ? amharicCopy : englishCopy;
  return [
    { value: 1, display: "1", label: copy.stronglyDisagree, short: copy.stronglyDisagree },
    { value: 2, display: "2", label: copy.disagree, short: copy.disagree },
    { value: 3, display: "3", label: copy.neither, short: language === "am" ? copy.neither : "Neither" },
    { value: 4, display: "4", label: copy.agree, short: copy.agree },
    { value: 5, display: "5", label: copy.stronglyAgree, short: copy.stronglyAgree },
    { value: 6, display: "N/A", label: copy.naLong, short: language === "am" ? copy.na : "Not applicable" },
  ];
}

function api<T>(url: string, options?: RequestInit): Promise<T> {
  return fetch(url, { credentials: "include", ...options, headers: { "Content-Type": "application/json", ...options?.headers } })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || "The request could not be completed."), { code: payload.code });
      return payload as T;
    });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function LanguageSwitch({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return (
    <div className="language-switch" role="group" aria-label="Language / ቋንቋ">
      <button className={language === "en" ? "active" : ""} aria-pressed={language === "en"} onClick={() => onChange("en")}>English</button>
      <button className={language === "am" ? "active" : ""} aria-pressed={language === "am"} onClick={() => onChange("am")}>አማርኛ</button>
    </div>
  );
}

function Survey({ onAdmin }: { onAdmin: () => void }) {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem("moa-survey-language") === "am" ? "am" : "en");
  const [draft] = useState<Record<string, unknown> | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch { return null; }
  });
  const [sections, setSections] = useState<SurveySection[]>([]);
  const [openQuestions, setOpenQuestions] = useState<MatrixQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState(false);
  const [evaluatorLevel, setEvaluatorLevel] = useState<EvaluatorLevel | "">("");
  const [answers, setAnswers] = useState<Answers>({});
  const [openEndedAnswers, setOpenEndedAnswers] = useState<OpenEndedAnswers>({});
  const [demographics, setDemographics] = useState(emptyDemographics());
  const [touched, setTouched] = useState<Partial<Record<keyof Demographics, boolean>>>({});
  const [profileAttempted, setProfileAttempted] = useState(false);
  const profileIssues = demographicIssues(demographics);
  const [page, setPage] = useState(-1);
  const [submitted, setSubmitted] = useState(false);
  const [canSubmitAnother, setCanSubmitAnother] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [transition, setTransition] = useState<ReturnType<typeof sectionTransition>>(null);
  const [missingQuestion, setMissingQuestion] = useState<string | null>(null);
  const activePeriod = useRef<string | null>(typeof draft?.periodId === "string" ? draft.periodId : null);
  const initialized = useRef(false);
  const statusRequest = useRef(0);
  const matrixRegion = useRef<HTMLDivElement>(null);
  const progressBar = useRef<HTMLDivElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const t = language === "am" ? amharicCopy : englishCopy;
  const wt = windowCopy[language];
  const surveyAccessUrl = `${window.location.origin}${window.location.pathname}`;
  const scale = surveyScale(language);
  const levelTitle = (item: SurveySection) => language === "am" ? item.titleAm || amharicLevels[item.level].title : item.title;
  const levelAudience = (item: SurveySection) => language === "am" ? item.audienceAm || amharicLevels[item.level].audience : item.audience;
  const questionTranslation = (question: MatrixQuestion) => question.textAm || "";
  const surveyPages = sections.length === 3 ? buildSurveyPages(sections, QUESTIONS_PER_PAGE, openQuestions) : [];
  const pageData = surveyPages[page];
  const section = sections.find(item => item.level === pageData?.level);
  const totalPages = surveyPages.length;
  const isDemographicsPage = pageData?.level === "demographics";
  const isOpenEndedPage = pageData?.level === "open_ended";
  const pageQuestions = pageData?.questions || [];
  const leadershipAnswered = sections.flatMap(item => item.questions).filter(question => answers[question.code]).length;
  const openAnsweredCount = openQuestions.filter(question => openEndedAnswers[question.code]?.trim()).length;
  const answeredCount = leadershipAnswered + openAnsweredCount;
  const pageAnsweredCount = pageQuestions.filter(question => answers[question.code]).length;
  const totalQuestionCount = sections.reduce<number>((sum, item) => sum + item.questions.length, 0);
  const totalItemCount = totalQuestionCount + openQuestions.length;
  const progress = totalItemCount ? Math.round((answeredCount / totalItemCount) * 100) : 0;
  const surveyDisplayName = language === "am" && availability?.survey?.nameAm ? availability.survey.nameAm : availability?.survey?.nameEn || t.surveyName;
  const surveyLead = (language === "am" ? availability?.survey?.settings?.descriptionAm : availability?.survey?.settings?.descriptionEn) || t.lead;
  const surveyInstructionsEn = availability?.survey?.settings?.instructionsEn || englishCopy.instructions;
  const surveyInstructionsAm = availability?.survey?.settings?.instructionsAm || amharicCopy.instructions;
  const hierarchyOrder = [
    language === "am" ? "የገምጋሚው መረጃ" : "Evaluator information",
    ...sections.map(levelTitle),
    language === "am" ? "ባለሙያ" : "Expert",
    t.openSection,
  ].join(" → ");
  const transitionFrom = transition ? sections.find(item => item.level === transition.from) : undefined;
  const transitionTo = transition?.to ? sections.find(item => item.level === transition.to) : undefined;
  const transitionToOpen = transition?.to === 'open_ended';
  const transitionHeading = transitionFrom
    ? language === "am"
      ? `${levelTitle(transitionFrom)} ክፍልን አጠናቀዋል።`
      : `You have completed the ${levelTitle(transitionFrom)} section.`
    : "";
  const transitionMessage = transitionTo
    ? language === "am"
      ? `አሁን ወደ ${levelTitle(transitionTo)} ለመቀጠል ዝግጁ ነዎት።`
      : `You are now about to continue to ${levelTitle(transitionTo)}.`
    : transitionToOpen
      ? language === 'am' ? 'አሁን ከማስገባትዎ በፊት ሦስቱን ክፍት ጥያቄዎች ይመልሱ።' : 'Now answer the three open-ended questions before submitting your assessment.'
      : wt.finalNext;
  const transitionButton = transitionTo
    ? language === "am" ? `ወደ ${levelTitle(transitionTo)} ቀጥል` : `Continue to ${levelTitle(transitionTo)}`
    : transitionToOpen ? language === 'am' ? 'ወደ ክፍት ጥያቄዎች ቀጥል' : 'Continue to open-ended questions' : t.submit;

  useEffect(() => {
    let live = true;
    api<{ sections: SurveySection[]; openQuestions?: MatrixQuestion[] }>("/api/survey/questions")
      .then(payload => {
        if (!live || payload.sections.length !== 3 || payload.sections.some(section => !section.questions.length)) throw new Error("The questionnaire is not configured.");
        const qualitative = payload.openQuestions || [];
        if (qualitative.length !== 3 || !['GQ1', 'GQ2', 'GQ3'].every(code => qualitative.some(question => question.code === code))) throw new Error("The open-ended questionnaire is not configured.");
        const restored = typeof draft?.periodId === "string" && draft.periodId === activePeriod.current ? sanitizeDraft(draft, payload.sections, qualitative) : sanitizeDraft(null, payload.sections, qualitative);
        setSections(payload.sections);
        setOpenQuestions(qualitative);
        setEvaluatorLevel(restored.evaluatorLevel);
        setAnswers(restored.answers);
        setOpenEndedAnswers(restored.openEndedAnswers);
        setDemographics(restored.demographics);
      })
      .catch(() => { if (live) setQuestionsError(true); })
      .finally(() => { if (live) setQuestionsLoading(false); });
    return () => { live = false; };
  }, [draft]);

  useEffect(() => {
    const region = matrixRegion.current;
    const bar = progressBar.current;
    if (!region || !bar) return;
    // The horizontal scroll container also owns sticky positioning. Offset its
    // header when the document scrolls so the scale stays below the progress bar.
    const updateScalePosition = () => {
      const inset = Math.max(0, bar.getBoundingClientRect().bottom - region.getBoundingClientRect().top);
      region.style.setProperty('--matrix-sticky-top', `${inset}px`);
    };
    updateScalePosition();
    const observer = new ResizeObserver(updateScalePosition);
    observer.observe(bar);
    observer.observe(region);
    window.addEventListener('scroll', updateScalePosition, { passive: true });
    window.addEventListener('resize', updateScalePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateScalePosition);
      window.removeEventListener('resize', updateScalePosition);
    };
  }, [page, language, checking, submitted, availability?.isOpen, availabilityError, transition]);

  const refreshAvailability = useCallback(async () => {
    const request = ++statusRequest.current;
    try {
      const status = await api<{ submitted: boolean; availability: Availability; canSubmitAnother?: boolean }>("/api/survey/status");
      if (request !== statusRequest.current) return;
      if (!status.availability) throw new Error("Update the backend to enable survey windows.");
      setCanSubmitAnother(status.canSubmitAnother === true);
      const periodId = status.availability.period?.id || null;
      if (periodId && activePeriod.current !== periodId) {
        setEvaluatorLevel(""); setAnswers({}); setOpenEndedAnswers({}); setDemographics(emptyDemographics());
        setTouched({}); setProfileAttempted(false); setPage(-1); setTransition(null); setError("");
        localStorage.removeItem(DRAFT_KEY);
        setSubmitted(status.submitted);
      } else if (!initialized.current || status.submitted) setSubmitted(status.submitted);
      if (status.submitted) localStorage.removeItem(DRAFT_KEY);
      activePeriod.current = periodId;
      initialized.current = true;
      setAvailability(status.availability); setAvailabilityError(false);
    } catch {
      if (request === statusRequest.current) setAvailabilityError(true);
    } finally { if (request === statusRequest.current) setChecking(false); }
  }, []);

  useEffect(() => {
    void refreshAvailability();
    const interval = window.setInterval(() => void refreshAvailability(), 15000);
    const focus = () => void refreshAvailability();
    window.addEventListener("focus", focus);
    return () => { ++statusRequest.current; window.clearInterval(interval); window.removeEventListener("focus", focus); };
  }, [refreshAvailability]);

  useEffect(() => {
    if (!availability?.period || availability.state === "closed") return;
    const boundary = availability.state === "scheduled" ? availability.period.startsAt : availability.period.endsAt;
    const delay = Math.max(50, Math.min(2147483647, Date.parse(boundary) - Date.parse(availability.serverTime) + 50));
    const timer = window.setTimeout(() => { void refreshAvailability(); }, delay);
    return () => window.clearTimeout(timer);
  }, [availability, refreshAvailability]);

  useEffect(() => {
    if (transition) document.getElementById("section-completed-heading")?.focus();
  }, [transition]);

  useEffect(() => {
    if (page >= 0 && !transition) pageHeading.current?.focus({ preventScroll: true });
    setMissingQuestion(null);
  }, [page, transition]);

  useEffect(() => {
    localStorage.setItem("moa-survey-language", language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (availability?.period && !submitted && (evaluatorLevel || Object.keys(answers).length)) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ periodId: availability.period.id, evaluatorLevel, answers, openEndedAnswers, demographics }));
    }
  }, [evaluatorLevel, answers, openEndedAnswers, demographics, submitted, availability]);

  function pageIsComplete() {
    if (isDemographicsPage) {
      if (!validDemographics(demographics)) {
        setProfileAttempted(true);
        const field = (["sex", "age", "workExperience"] as const).find(key => profileIssues[key]);
        if (field) document.getElementById("profile-" + field)?.focus();
        return false;
      }
      return true;
    }
    if (isOpenEndedPage) {
      const missing = pageQuestions.find(question => !openEndedAnswers[question.code]?.trim());
      if (missing) {
        setMissingQuestion(missing.code); setError(t.openRequired);
        document.getElementById(`question-${missing.code}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => document.getElementById(`open-${missing.code}`)?.focus({ preventScroll: true }), 350);
        return false;
      }
      return true;
    }
    const activeAnswers = answers;
    const missing = pageQuestions.find(question => !activeAnswers[question.code]);
    if (missing) {
      const remaining = pageQuestions.length - pageAnsweredCount;
      setMissingQuestion(missing.code);
      setError(`${t.requiredPage} ${remaining} ${t.unansweredHere}.`);
      document.getElementById(`question-${missing.code}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => document.querySelector<HTMLInputElement>(`#question-${missing.code} input`)?.focus({ preventScroll: true }), 350);
      return false;
    }
    return true;
  }

  function goNext() {
    if (!pageIsComplete()) return;
    setError("");
    if (page === totalPages - 1) { void submit(); return; }
    const boundary = sectionTransition(surveyPages, page);
    if (boundary) setTransition(boundary);
    else setPage(current => Math.min(current + 1, totalPages - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginAssessment() {
    if (!evaluatorLevel) { setError(t.evaluatorLevelRequired); return; }
    setPage(0);
    setError("");
    window.scrollTo(0, 0);
  }

  async function startAnotherEvaluation() {
    if (restarting || !canSubmitAnother) return;
    setRestarting(true); setError('');
    // Ignore any status request that began before the administrator reset.
    ++statusRequest.current;
    try {
      await api('/api/survey/restart', { method: 'POST', body: JSON.stringify({ periodId: activePeriod.current }) });
      ++statusRequest.current;
      localStorage.removeItem(DRAFT_KEY);
      setAnswers({}); setOpenEndedAnswers({}); setDemographics(emptyDemographics()); setEvaluatorLevel('');
      setTouched({}); setProfileAttempted(false); setTransition(null); setPage(-1); setSubmitted(false);
      window.scrollTo(0, 0);
    } catch (error) {
      setError(error instanceof Error ? error.message : t.saveFailed);
      void refreshAvailability();
    } finally { setRestarting(false); }
  }

  function clearPageSelections() {
    if (!pageAnsweredCount || !window.confirm(t.clearWarning)) return;
    const pageCodes = new Set(pageQuestions.map(question => question.code));
    const withoutPage = (current: Answers) => Object.fromEntries(Object.entries(current).filter(([code]) => !pageCodes.has(code)));
    setAnswers(withoutPage);
    setError("");
  }

  async function submit() {
    if (!pageIsComplete()) return;
    if (!evaluatorLevel || !validDemographics(demographics) || leadershipAnswered !== totalQuestionCount || openAnsweredCount !== openQuestions.length) {
      setError(t.requiredAll);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api("/api/survey/responses", {
        method: "POST",
        body: JSON.stringify({
          surveyId: availability?.survey?.id, surveyVersion: SURVEY_VERSION, periodId: availability?.period?.id, evaluatorLevel,
          sex: demographics.sex, age: Number(demographics.age), workExperience: Number(demographics.workExperience), responses: answers, openEndedResponses: openEndedAnswers,
        }),
      });
      localStorage.removeItem(DRAFT_KEY);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(language === "am" ? t.saveFailed : requestError instanceof Error ? requestError.message : t.saveFailed);
      await refreshAvailability();
    } finally { setSubmitting(false); }
  }

  if (checking || questionsLoading) return <div className="center-screen"><div className="spinner" /><p>{t.loading}</p></div>;

  if (!availability?.isOpen || availabilityError || questionsError) return <main className="survey-shell">
    <section className="survey-paused-card">
      <LanguageSwitch language={language} onChange={setLanguage} />
      <p className="eyebrow">{t.ministry}</p>
      <h1>{availabilityError || questionsError ? wt.unavailable : wt.closed}</h1>
      {!availabilityError && availability && <PeriodInformation availability={availability} language={language} />}
      <div className="transition-actions"><button className="primary-button" onClick={() => void refreshAvailability()}>{wt.retry}</button><button className="text-button" onClick={onAdmin}>{t.adminSignIn}</button></div>
    </section>
  </main>;

  if (submitted) {
    return (
      <main className="survey-shell thank-you-shell">
        <section className="thank-you-card">
          <LanguageSwitch language={language} onChange={value => { setLanguage(value); setError(""); }} />
          <div className="success-mark">✓</div>
          <p className="eyebrow">{t.responseRecorded}</p>
          <h1>{t.thankYou}</h1>
          <p>{t.saved}</p>
          {error && <div className="error-banner">{error}</div>}
          <p>{canSubmitAnother ? t.adminRepeatHelp : t.singleSubmission}</p>
          {canSubmitAnother && <button className="primary-button" disabled={restarting} onClick={() => void startAnotherEvaluation()}>{restarting ? t.loading : t.adminAnother}</button>}
          <button className="text-button" onClick={onAdmin}>{t.adminSignIn}</button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">MoA</div>
        <div className="brand-copy"><strong>{t.ministry}</strong><span>{surveyDisplayName}</span></div>
        <div className="topbar-actions"><LanguageSwitch language={language} onChange={value => { setLanguage(value); setError(""); }} /><button className="admin-link" onClick={onAdmin}>{t.admin}</button></div>
      </header>

      {page >= 0 && (
        <div ref={progressBar} className="progress-wrap" aria-label={`${progress}% ${t.complete}`}>
          <div className="progress-meta"><span>{isOpenEndedPage ? t.openSection : section ? levelTitle(section) : t.overallSection}</span><strong>{progress}% {t.complete}</strong></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <main className="survey-shell">
        <SurveyPeriodNotice availability={availability} language={language} />
        {transition ? <section className="section-transition" aria-labelledby="section-completed-heading">
          <div className="success-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">{wt.sectionComplete}</p>
          <h1 id="section-completed-heading" tabIndex={-1}>{transitionHeading}</h1>
          <p>{transitionMessage}</p>
          {transitionTo && <div className="transition-audience">{levelAudience(transitionTo)}</div>}
          <p className="transition-hint">{wt.notSaved}</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="transition-actions"><button className="secondary-button" disabled={submitting} onClick={() => setTransition(null)}>{wt.review}</button><button className="primary-button" disabled={submitting} onClick={() => {
            if (!transition.to) { void submit(); return; }
            setTransition(null); setPage(current => current + 1); window.scrollTo(0, 0);
          }}>{submitting ? t.submitting : transitionButton}</button></div>
        </section> : page === -1 ? (
          <section className="intro-card">
            <aside className="survey-qr-card" aria-label={t.qrTitle}>
              <div className="survey-qr-code"><QRCodeSVG value={surveyAccessUrl} size={118} level="M" bgColor="#ffffff" fgColor="#0b4b35" title={t.qrTitle} /></div>
              <div><strong>{t.qrTitle}</strong><p>{t.qrHelp}</p><small>{surveyAccessUrl}</small></div>
            </aside>
            <p className="eyebrow">{t.finalTool}</p>
            <h1>{surveyDisplayName}</h1>
            <p className="lead">{surveyLead}</p>
            <section className="notice bilingual-answer-guide" aria-labelledby="answer-guide-title">
              <div className="answer-guide-heading"><span className="answer-guide-icon" aria-hidden="true">✓</span><div><h2 id="answer-guide-title" className="notice-title">How to answer <span lang="am">· አሞላል</span></h2><p>Read these short steps before you begin. <span lang="am">ከመጀመርዎ በፊት እነዚህን አጭር መመሪያዎች ያንብቡ።</span></p></div></div>
              <div className="bilingual-instruction-grid">
                <article lang="en" aria-label="Instructions in English"><ol>{surveyInstructionsEn.split("\n\n").filter(Boolean).map((paragraph, index) => <li key={index}>{paragraph}</li>)}</ol></article>
                <article lang="am" aria-label="Instructions in Amharic"><ol>{surveyInstructionsAm.split("\n\n").filter(Boolean).map((paragraph, index) => <li key={index}>{paragraph}</li>)}</ol></article>
              </div>
            </section>
            <fieldset className="level-picker">
              <legend>{t.chooseLevel} <span>*</span></legend>
              {evaluatorLevels.map(item => (
                <label className={`level-card ${evaluatorLevel === item.value ? "selected" : ""}`} key={item.value}>
                  <input type="radio" name="evaluator-level" value={item.value} checked={evaluatorLevel === item.value} onChange={() => { setEvaluatorLevel(item.value); setError(""); }} required />
                  <span className="level-radio" />
                  <span><strong>{language === "am" ? item.titleAm : item.title}</strong><small>{language === "am" ? item.descriptionAm : item.description}</small></span>
                </label>
              ))}
            </fieldset>
            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="intro-footer"><span>{totalItemCount} {t.statements} · {t.estimate}</span><button className="primary-button" disabled={!evaluatorLevel} onClick={beginAssessment}>{t.begin}</button></div>
          </section>
        ) : pageData ? (
          <section className="questionnaire-card">
            <div className="page-heading">
              <div><p className="eyebrow">{t.page} {page + 1} {t.of} {totalPages}</p><h1 ref={pageHeading} tabIndex={-1}>{isOpenEndedPage ? t.openSection : section ? levelTitle(section) : t.overallSection}</h1><p>{isOpenEndedPage ? t.openIntro : section ? levelAudience(section) : t.overallIntro}</p></div>
            </div>

            <p className="assessment-order">{hierarchyOrder}</p>
            {isDemographicsPage ? (
              <div className="demographics-fields">
                <aside className="year-guidance"><strong>{t.roundingTitle}</strong><p>{t.roundingHelp}</p></aside>
                <div className="profile-grid">
                  {(["sex", "age", "workExperience"] as const).map(field => {
                    const issue = (profileAttempted || touched[field]) ? profileIssues[field] : undefined;
                    const id = "profile-" + field;
                    return <div className="survey-field" key={field}>
                      <label htmlFor={id}>{t[field]} <b aria-hidden="true">*</b></label>
                      {field === "sex" ? <select id={id} value={demographics.sex} required aria-invalid={Boolean(issue)} aria-describedby={id + "-error"} onBlur={() => setTouched(current => ({ ...current, [field]: true }))} onChange={event => { setDemographics(current => ({ ...current, sex: event.target.value as Demographics["sex"] })); setError(""); }}>
                        <option value="">{t.selectSex}</option><option value="male">{t.male}</option><option value="female">{t.female}</option>
                      </select> : <>
                        <div className="year-input-wrap">
                          <input id={id} type="text" inputMode="decimal" pattern="[0-9]+" required placeholder={field === "age" ? "46" : "10"} aria-invalid={Boolean(issue)} aria-describedby={id + "-hint " + id + "-error"} value={demographics[field]} onBlur={() => setTouched(current => ({ ...current, [field]: true }))} onChange={event => { const value = event.target.value; setDemographics(current => ({ ...current, [field]: value })); setError(""); }} />
                          <span aria-hidden="true">{t.yearsUnit}</span>
                        </div>
                        <small id={id + "-hint"}>{field === "age" ? t.ageHint : t.experienceHint}</small>
                      </>}
                      <small id={id + "-error"} className="field-warning" aria-live="polite">{issue ? t[issue] : ""}</small>
                    </div>;
                  })}
                </div>
              </div>
            ) : isOpenEndedPage ? <div className="open-question-list">
              {pageQuestions.map((question, index) => {
                const value = openEndedAnswers[question.code] || '';
                const translation = questionTranslation(question);
                return <label id={`question-${question.code}`} className={`open-question-card ${missingQuestion === question.code ? 'needs-answer' : ''}`} key={question.code}>
                  <span className="open-question-heading"><code>{question.code}</code><b>{index + 1}</b></span>
                  <strong>{language === 'am' ? translation : question.text}</strong>
                  {translation && <small lang={language === 'am' ? 'en' : 'am'}>{language === 'am' ? question.text : translation}</small>}
                  <textarea id={`open-${question.code}`} rows={4} maxLength={4000} value={value} onChange={event => { setOpenEndedAnswers(current => ({ ...current, [question.code]: event.target.value })); if (missingQuestion === question.code) setMissingQuestion(null); setError(''); }} required />
                  <em>{value.length}/4000 {t.characters}</em>
                </label>;
              })}
            </div> : <><p className="matrix-swipe-hint">↔ {t.swipeScale}</p><div key={page} ref={matrixRegion} className="matrix-scroll" role="region" aria-label={t.leadershipSection} tabIndex={0}>
              <table className="survey-matrix">
                <thead><tr><th scope="col">{t.statements}</th>{scale.map((option) => <th scope="col" key={option.value}><strong>{option.display}</strong><span>{option.short}</span></th>)}</tr></thead>
                <tbody>
                  {pageQuestions.map((question, index) => {
                    const activeAnswers = answers;
                    const number = pageData.offset + index + 1;
                    const translation = questionTranslation(question);
                    return (
                      <tr className={`${activeAnswers[question.code] ? "answered" : ""} ${missingQuestion === question.code ? "needs-answer" : ""}`} id={`question-${question.code}`} key={question.code}>
                        <th scope="row"><span className="matrix-question-number">{number}.</span><span className="matrix-question-copy"><strong>{language === "am" ? translation : question.text}</strong>{translation && <small>{language === "am" ? question.text : translation}</small>}</span></th>
                        {scale.map((option) => <td key={option.value}><label className={activeAnswers[question.code] === option.value ? "chosen" : ""} title={option.label}><input type="radio" name={question.code} value={option.value} checked={activeAnswers[question.code] === option.value} aria-label={`${option.display} - ${option.label}`} onChange={() => { setAnswers((current) => ({ ...current, [question.code]: option.value })); if (missingQuestion === question.code) setMissingQuestion(null); setError(""); }} /><span className="matrix-radio" /></label></td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div></>}

            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="survey-actions">
              <div className="survey-action-left">
                <button className="secondary-button" disabled={submitting} onClick={() => { setError(""); if (page === 0) setPage(-1); else setPage((current) => current - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t.back}</button>
                {!isDemographicsPage && !isOpenEndedPage && <button className="text-button clear-button" type="button" disabled={submitting || !pageAnsweredCount} onClick={clearPageSelections}>{t.clearSelections}</button>}
              </div>
              <span className="survey-progress-copy">{isDemographicsPage ? `${3 - Object.keys(profileIssues).length}/3 ${t.requiredDetails}` : <><strong>{isOpenEndedPage ? openAnsweredCount : pageAnsweredCount}/{pageQuestions.length} {t.thisPage}</strong><small>✓ {t.savedOnDevice} · {answeredCount}/{totalItemCount} {t.total}</small></>}</span>
              <button className="primary-button" disabled={submitting} onClick={goNext}>{submitting ? t.submitting : isDemographicsPage ? t.continueAssessment : page === totalPages - 1 ? t.submit : t.next}</button>
            </div>
          </section>
        ) : null}
      </main>
      <footer>{t.footer}</footer>
    </div>
  );
}

function Admin({ onExit }: { onExit: () => void }) {
  const [session, setSession] = useState<AdminSession>({ authorized: false });
  const [adminSection, setAdminSection] = useState<"questions" | "survey" | "settings" | "statistics" | "users">("survey");
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [invitationToken] = useState(() => {
    const match = window.location.hash.match(/^#admin\/invite\/([A-Za-z0-9_-]{43})$/);
    return match?.[1] || "";
  });
  const [resetToken] = useState(() => window.location.hash.match(/^#admin\/reset\/([A-Za-z0-9_-]{43})$/)?.[1] || "");
  const [acceptingInvitation, setAcceptingInvitation] = useState(Boolean(invitationToken));
  const [changingForgottenPassword, setChangingForgottenPassword] = useState(Boolean(resetToken));
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [surveys, setSurveys] = useState<SurveyDefinition[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState("");

  useEffect(() => {
    if (invitationToken || resetToken) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#admin`);
  }, [invitationToken, resetToken]);

  useEffect(() => {
    api<AdminSession>("/api/admin/session")
      .then(setSession)
      .catch(() => setError("The administration service is unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const loadSurveys = useCallback(async () => {
    try {
      const payload = await api<{ surveys: SurveyDefinition[] }>("/api/admin/surveys");
      setSurveys(payload.surveys);
      setSelectedSurveyId(current => payload.surveys.some(survey => survey.id === current) ? current : payload.surveys.find(survey => survey.published)?.id || payload.surveys[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load surveys."); }
  }, []);

  useEffect(() => { if (session.authorized) void loadSurveys(); }, [session.authorized, loadSurveys]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const current = await api<AdminSession>("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setSession(current);
      setPassword("");
    } catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Sign in failed."); }
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    setError(""); setRequestingReset(true);
    try {
      await api("/api/admin/forgot-password", { method: "POST", body: JSON.stringify({ username }) });
      setResetRequested(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send the request. Try again later."); }
    finally { setRequestingReset(false); }
  }

  async function acceptInvitation(event: FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmNewPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 8) { setError("Use at least 8 characters."); return; }
    setInvitationBusy(true);
    try {
      const result = await api<{ username: string }>("/api/admin/accept-invitation", { method: "POST", body: JSON.stringify({ token: invitationToken, password: newPassword }) });
      setUsername(result.username); setNewPassword(""); setConfirmNewPassword(""); setAcceptingInvitation(false);
      setResetRequested(false); setLoginNotice("Your password is set. Sign in with your email address.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to activate your account."); }
    finally { setInvitationBusy(false); }
  }

  async function completePasswordReset(event: FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmNewPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 8) { setError("Use at least 8 characters."); return; }
    setInvitationBusy(true);
    try {
      const result = await api<{ username: string }>("/api/admin/reset-password", { method: "POST", body: JSON.stringify({ token: resetToken, password: newPassword }) });
      setUsername(result.username); setNewPassword(""); setConfirmNewPassword(""); setChangingForgottenPassword(false);
      setSession({ authorized: false }); setForgotPassword(false); setLoginNotice("Your password has been changed. Sign in with your new password.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change your password."); }
    finally { setInvitationBusy(false); }
  }

  async function logout() {
    await api("/api/admin/logout", { method: "POST" });
    setSession({ authorized: false });
  }


  if (loading) return <div className="center-screen"><div className="spinner" /><p>Loading administration…</p></div>;
  if (changingForgottenPassword) return <main className="admin-login-shell"><form className="login-card" onSubmit={completePasswordReset}>
    <div className="brand-mark large" aria-hidden="true">MoA</div><p className="eyebrow">Account recovery</p><h1>Choose a new password</h1>
    <p>Enter a new password for your survey administration account. This link can be used once.</p>
    <label>New password<input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={256} required /></label>
    <label>Confirm new password<input type="password" value={confirmNewPassword} onChange={event => setConfirmNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={256} required /></label>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <button className="primary-button" type="submit" disabled={invitationBusy}>{invitationBusy ? "Saving…" : "Change password"}</button>
  </form></main>;
  if (acceptingInvitation) return <main className="admin-login-shell"><form className="login-card" onSubmit={acceptInvitation}>
    <div className="brand-mark large" aria-hidden="true">MoA</div><p className="eyebrow">Account invitation</p><h1>Set your password</h1>
    <p>Welcome. Create your password before your first sign-in. This invitation can be used once.</p>
    <label>New password<input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={256} required /></label>
    <label>Confirm password<input type="password" value={confirmNewPassword} onChange={event => setConfirmNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={256} required /></label>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <button className="primary-button" type="submit" disabled={invitationBusy}>{invitationBusy ? "Saving…" : "Set password and continue"}</button>
  </form></main>;
  if (!session.authorized) {
    return (
      <main className="admin-login-shell">
        <form className="login-card" onSubmit={forgotPassword ? requestPasswordReset : login}>
          <button type="button" className="back-link" onClick={onExit}>← Return to survey</button>
          <div className="brand-mark large" aria-hidden="true">MoA</div>
          <p className="eyebrow">Restricted access</p>
          <h1>{forgotPassword ? "Forgot password" : "Survey administration"}</h1>
          <p>{forgotPassword ? "Enter the email address for your account. We will send a one-time password change link if the account is active." : "Sign in with your email address. Existing accounts may continue using their username."}</p>
          <label>Email or username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          {!forgotPassword && <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>}
          {forgotPassword && resetRequested && <div className="question-success" role="status">If this is an active email account, check your inbox for a password change link. The link expires in one hour. Existing accounts without an email address should contact an administrator.</div>}
          {loginNotice && <div className="question-success" role="status">{loginNotice}</div>}
          {error && <div className="error-banner" role="alert">{error}</div>}
          <button className="primary-button" type="submit" disabled={requestingReset}>{forgotPassword ? requestingReset ? "Sending…" : "Request password reset" : "Sign in"}</button>
          <button className="forgot-password-link" type="button" onClick={() => { setForgotPassword(value => !value); setResetRequested(false); setError(""); setPassword(""); }}>{forgotPassword ? "← Back to sign in" : "Forgot password?"}</button>
          {forgotPassword && <p className="forgot-password-note">If the message does not arrive, check spam. Requests are limited to one email every 15 minutes. Existing accounts without an email address need administrator assistance.</p>}
        </form>
      </main>
    );
  }

  const surveySections = [
    { value: "survey" as const, label: "1. Survey Admin", description: "Create, publish and schedule" },
    { value: "settings" as const, label: "2. Settings", description: "Name, introduction and sections" },
    { value: "questions" as const, label: "3. Questions", description: "Edit the questionnaire" },
  ];
  const adminSections = session.role === "admin" ? [
    ...surveySections,
    { value: "statistics" as const, label: "4. Results", description: "Analyse and export responses" },
    { value: "users" as const, label: "5. Users", description: "Roles and passwords" },
  ] : session.role === "survey_admin" ? surveySections : [{ value: "statistics" as const, label: "Results", description: "Analyse and export responses" }];
  const activeAdminSection = adminSections.some(item => item.value === adminSection) ? adminSection : adminSections[0].value;
  const selectedSurvey = surveys.find(survey => survey.id === selectedSurveyId) || surveys[0];
  const adminHeading = activeAdminSection === "questions" ? "Questionnaire management" : activeAdminSection === "survey" ? "Survey administration" : activeAdminSection === "settings" ? "Survey settings" : activeAdminSection === "users" ? "User management" : "Survey results";
  const canManageSurvey = session.role === "admin" || session.role === "survey_admin";

  return (
    <div className="admin-app">
      <header className="admin-header">
        <div className="admin-title-row"><div className="admin-brand-symbol" aria-hidden="true">MoA</div><div><p className="eyebrow">Ministry of Agriculture</p><h1>{adminHeading}</h1><p className="admin-session"><span aria-hidden="true" /> {session.displayName}</p></div></div>
        <div className="admin-actions"><button className="secondary-button" onClick={onExit}>View public survey</button>{activeAdminSection === "statistics" && selectedSurvey && <a className="primary-button link-button" href={`/api/admin/survey-results.csv?surveyId=${encodeURIComponent(selectedSurvey.id)}`}>Download CSV</a>}<button className="text-button" onClick={logout}>Sign out</button></div>
      </header>
      <main className="admin-main">
        <nav className="admin-navigation" aria-label="Administration sections">
          {adminSections.map(item => <button type="button" className={activeAdminSection === item.value ? "active" : ""} aria-current={activeAdminSection === item.value ? "page" : undefined} key={item.value} onClick={() => setAdminSection(item.value)}><span className="admin-nav-icon"><AdminSectionIcon section={item.value} /></span><span className="admin-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span></button>)}
        </nav>
        {error && <div className="error-banner">{error}</div>}
        {activeAdminSection !== "users" && selectedSurvey && <SurveyCatalog surveys={surveys} selectedId={selectedSurvey.id} canManage={canManageSurvey && activeAdminSection === "survey"} onSelect={setSelectedSurveyId} onChange={(next, selectedId) => { setSurveys(next); if (selectedId) setSelectedSurveyId(selectedId); }} />}
        {activeAdminSection !== "users" && !selectedSurvey && <p className="empty-state">Loading survey catalogue…</p>}
        {canManageSurvey && activeAdminSection === "survey" && selectedSurvey?.published && <SurveyWindowAdmin surveyName={selectedSurvey.nameEn} />}
        {canManageSurvey && activeAdminSection === "survey" && selectedSurvey && !selectedSurvey.published && <section className="admin-panel survey-draft-panel"><span>Draft survey</span><h2>Prepare this survey, then publish it</h2><p>First review its name and instructions, then check its questions. Publishing selects it for the public link but does not open collection.</p><div className="survey-draft-actions"><button className="secondary-button" onClick={() => setAdminSection("settings")}>1. Review settings</button><button className="secondary-button" onClick={() => setAdminSection("questions")}>2. Review questions</button></div></section>}
        {canManageSurvey && activeAdminSection === "questions" && selectedSurvey && <QuestionManager key={selectedSurvey.id} surveyId={selectedSurvey.id} surveyName={selectedSurvey.nameEn} surveySettings={selectedSurvey.settings} />}
        {canManageSurvey && activeAdminSection === "settings" && selectedSurvey && <SurveySettings key={selectedSurvey.id} survey={selectedSurvey} onChange={next => setSurveys(next)} />}
        {activeAdminSection === "statistics" && selectedSurvey && <ResultsDashboard key={selectedSurvey.id} surveyId={selectedSurvey.id} surveyName={selectedSurvey.nameEn} />}
        {session.role === "admin" && activeAdminSection === "users" && <UserManagement currentUsername={session.username || ""} onSelfChange={() => { setSession({ authorized: false }); setError("Your account changed. Sign in again."); }} />}
      </main>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<"survey" | "admin">(window.location.hash.startsWith("#admin") ? "admin" : "survey");
  function changeView(next: "survey" | "admin") { window.location.hash = next === "admin" ? "admin" : ""; setView(next); window.scrollTo(0, 0); }
  return view === "admin" ? <Admin onExit={() => changeView("survey")} /> : <Survey onAdmin={() => changeView("admin")} />;
}
