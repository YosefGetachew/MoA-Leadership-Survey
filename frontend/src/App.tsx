import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ResultsDashboard from "./ResultsDashboard";
import SurveyWindowAdmin, { PeriodInformation, windowCopy, type Availability } from "./SurveyWindow";
import SurveyPeriodNotice from "./SurveyPeriodNotice";
import { QRCodeSVG } from "qrcode.react";
import surveySections from "./levelSurveyQuestions.json";
import { amharicCopy, amharicLevels, amharicQuestions } from "./amharic";
import { buildSurveyPages, sectionTransition, DRAFT_KEY, emptyDemographics, demographicIssues, validDemographics, evaluatorLevels, sanitizeDraft, SURVEY_VERSION, type Answers, type Demographics, type EvaluatorLevel, type LeadershipLevel, type MatrixQuestion, type SurveySection } from "./surveyFlow";
type Language = "en" | "am";

interface AdminSession {
  authorized: boolean;
  displayName?: string;
  role?: string;
}

const sections = surveySections as SurveySection[];
const QUESTIONS_PER_PAGE = 5;
const surveyPages = buildSurveyPages(sections, QUESTIONS_PER_PAGE);
const englishCopy = {
  ministry: "Ministry of Agriculture", surveyName: "Leadership Assessment Survey", admin: "Admin",
  loading: "Loading the assessment…", unavailable: "The survey service is unavailable. Please confirm that the API is running.",
  finalTool: "Final questionnaire · Vf1", title: "Leadership Assessment Questionnaire",
  qrTitle: "Scan to open the survey", qrHelp: "Use a phone camera to access this questionnaire.",
  lead: "Assess Senior, Middle and Lower Leadership in the Ministry of Agriculture based on your direct experience. We do not collect your name, email or phone number.",
  howTo: "How to answer", instructions: "All evaluators, from Senior Leadership to Expert level will complete the same assessment.\n\nSelect your own leadership level and enter your sex, age and work experience.\n\nYour evaluation starts with Senior Leadership, continues to Middle Level Leadership, and Lower Level Leadershipends finally ends with Lower Level Leadership. Complete each section before moving to the next.\n\nRate every statement from 1 to 5, or select N/A when you do not have sufficient information.",
  chooseLevel: "What is your leadership level in the ministry?", statements: "statements", estimate: "69 statements · All three leadership levels",
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
  requiredAll: "Please answer every statement before submitting.", back: "Back", next: "Next", answered: "answered",
  clearSelections: "Clear choices", clearWarning: "Clear every choice selected on this page?",
  submit: "Submit assessment", submitting: "Submitting…", responseRecorded: "Response recorded",
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
  const [draft] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      return { ...sanitizeDraft(raw, sections), periodId: typeof raw?.periodId === "string" ? raw.periodId : null };
    } catch { return { ...sanitizeDraft(null, sections), periodId: null }; }
  });
  const [evaluatorLevel, setEvaluatorLevel] = useState<EvaluatorLevel | "">(draft.evaluatorLevel);
  const [answers, setAnswers] = useState<Answers>(draft.answers);
  const [demographics, setDemographics] = useState(draft.demographics);
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
  const activePeriod = useRef<string | null>(draft.periodId);
  const initialized = useRef(false);
  const statusRequest = useRef(0);
  const matrixRegion = useRef<HTMLDivElement>(null);
  const progressBar = useRef<HTMLDivElement>(null);
  const t = language === "am" ? amharicCopy : englishCopy;
  const wt = windowCopy[language];
  const surveyAccessUrl = `${window.location.origin}${window.location.pathname}`;
  const scale = surveyScale(language);
  const levelTitle = (item: SurveySection) => language === "am" ? amharicLevels[item.level].title : item.title;
  const levelAudience = (item: SurveySection) => language === "am" ? amharicLevels[item.level].audience : item.audience;
  const questionTranslation = (question: MatrixQuestion) => question.textAm || amharicQuestions[question.code] || "";
  const pageData = surveyPages[page];
  const section = sections.find(item => item.level === pageData?.level);
  const totalPages = surveyPages.length;
  const isDemographicsPage = pageData?.level === "demographics";
  const pageQuestions = pageData?.questions || [];
  const leadershipAnswered = sections.flatMap(item => item.questions).filter(question => answers[question.code]).length;
  const answeredCount = leadershipAnswered;
  const pageAnsweredCount = pageQuestions.filter(question => answers[question.code]).length;
  const totalQuestionCount = sections.reduce<number>((sum, item) => sum + item.questions.length, 0);
  const progress = Math.round((answeredCount / totalQuestionCount) * 100);

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
        setEvaluatorLevel(""); setAnswers({}); setDemographics(emptyDemographics());
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
    localStorage.setItem("moa-survey-language", language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (availability?.period && !submitted && (evaluatorLevel || Object.keys(answers).length)) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ periodId: availability.period.id, evaluatorLevel, answers, demographics }));
    }
  }, [evaluatorLevel, answers, demographics, submitted, availability]);

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
    const activeAnswers = answers;
    const missing = pageQuestions.find(question => !activeAnswers[question.code]);
    if (missing) {
      setError(t.requiredPage);
      document.getElementById(`question-${missing.code}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  function goNext() {
    if (!pageIsComplete()) return;
    setError("");
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
      setAnswers({}); setDemographics(emptyDemographics()); setEvaluatorLevel('');
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
    if (!evaluatorLevel || !validDemographics(demographics) || answeredCount !== totalQuestionCount) {
      setError(t.requiredAll);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api("/api/survey/responses", {
        method: "POST",
        body: JSON.stringify({
          surveyVersion: SURVEY_VERSION, periodId: availability?.period?.id, evaluatorLevel,
          sex: demographics.sex, age: Number(demographics.age), workExperience: Number(demographics.workExperience), responses: answers,
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

  if (checking) return <div className="center-screen"><div className="spinner" /><p>{t.loading}</p></div>;

  if (!availability?.isOpen || availabilityError) return <main className="survey-shell">
    <section className="survey-paused-card">
      <LanguageSwitch language={language} onChange={setLanguage} />
      <p className="eyebrow">{t.ministry}</p>
      <h1>{availabilityError ? wt.unavailable : wt.closed}</h1>
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
        <div className="brand-copy"><strong>{t.ministry}</strong><span>{t.surveyName}</span></div>
        <div className="topbar-actions"><LanguageSwitch language={language} onChange={value => { setLanguage(value); setError(""); }} /><button className="admin-link" onClick={onAdmin}>{t.admin}</button></div>
      </header>

      {page >= 0 && (
        <div ref={progressBar} className="progress-wrap" aria-label={`${progress}% ${t.complete}`}>
          <div className="progress-meta"><span>{section ? levelTitle(section) : t.overallSection}</span><strong>{progress}% {t.complete}</strong></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <main className="survey-shell">
        <SurveyPeriodNotice availability={availability} language={language} />
        {transition ? <section className="section-transition" aria-labelledby="section-completed-heading">
          <div className="success-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">{wt.sectionComplete}</p>
          <h1 id="section-completed-heading" tabIndex={-1}>{transition.from === "high_level" ? wt.seniorDone : transition.from === "middle_level" ? wt.middleDone : wt.lowerDone}</h1>
          <p>{transition.to === "middle_level" ? wt.middleNext : transition.to === "lower_level" ? wt.lowerNext : wt.finalNext}</p>
          {transition.to && <div className="transition-audience">{levelAudience(sections.find(item => item.level === transition.to)!)}</div>}
          <p className="transition-hint">{wt.notSaved}</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="transition-actions"><button className="secondary-button" disabled={submitting} onClick={() => setTransition(null)}>{wt.review}</button><button className="primary-button" disabled={submitting} onClick={() => {
            if (!transition.to) { void submit(); return; }
            setTransition(null); setPage(current => current + 1); window.scrollTo(0, 0);
          }}>{submitting ? t.submitting : transition.to === "middle_level" ? wt.middleContinue : transition.to === "lower_level" ? wt.lowerContinue : t.submit}</button></div>
        </section> : page === -1 ? (
          <section className="intro-card">
            <aside className="survey-qr-card" aria-label={t.qrTitle}>
              <div className="survey-qr-code"><QRCodeSVG value={surveyAccessUrl} size={118} level="M" bgColor="#ffffff" fgColor="#0b4b35" title={t.qrTitle} /></div>
              <div><strong>{t.qrTitle}</strong><p>{t.qrHelp}</p><small>{surveyAccessUrl}</small></div>
            </aside>
            <p className="eyebrow">{t.finalTool}</p>
            <h1>{t.title}</h1>
            <p className="lead">{t.lead}</p>
            <section className="notice" aria-labelledby="answer-guide-title">
              <h2 id="answer-guide-title" className="notice-title">{t.howTo}</h2>
              <div className="instruction-paragraphs">{t.instructions.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
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
            <div className="intro-footer"><span>{t.estimate}</span><button className="primary-button" disabled={!evaluatorLevel} onClick={beginAssessment}>{t.begin}</button></div>
          </section>
        ) : pageData ? (
          <section className="questionnaire-card">
            <div className="page-heading">
              <div><p className="eyebrow">{t.page} {page + 1} {t.of} {totalPages}</p><h1>{section ? levelTitle(section) : t.overallSection}</h1><p>{section ? levelAudience(section) : t.overallIntro}</p></div>
            </div>

            <p className="assessment-order">{t.assessmentOrder}</p>
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
            ) : <div key={page} ref={matrixRegion} className="matrix-scroll" role="region" aria-label={t.leadershipSection} tabIndex={0}>
              <table className="survey-matrix">
                <thead><tr><th scope="col">{t.statements}</th>{scale.map((option) => <th scope="col" key={option.value}><strong>{option.display}</strong><span>{option.short}</span></th>)}</tr></thead>
                <tbody>
                  {pageQuestions.map((question, index) => {
                    const activeAnswers = answers;
                    const number = pageData.offset + index + 1;
                    const translation = questionTranslation(question);
                    return (
                      <tr className={activeAnswers[question.code] ? "answered" : ""} id={`question-${question.code}`} key={question.code}>
                        <th scope="row"><span className="matrix-question-number">{number}.</span><span className="matrix-question-copy"><strong>{language === "am" ? translation : question.text}</strong>{translation && <small>{language === "am" ? question.text : translation}</small>}</span></th>
                        {scale.map((option) => <td key={option.value}><label className={activeAnswers[question.code] === option.value ? "chosen" : ""} title={option.label}><input type="radio" name={question.code} value={option.value} checked={activeAnswers[question.code] === option.value} aria-label={`${option.display} - ${option.label}`} onChange={() => { setAnswers((current) => ({ ...current, [question.code]: option.value })); setError(""); }} /><span className="matrix-radio" /></label></td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}

            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="survey-actions">
              <div className="survey-action-left">
                <button className="secondary-button" disabled={submitting} onClick={() => { setError(""); if (page === 0) setPage(-1); else setPage((current) => current - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t.back}</button>
                {!isDemographicsPage && <button className="text-button clear-button" type="button" disabled={submitting || !pageAnsweredCount} onClick={clearPageSelections}>{t.clearSelections}</button>}
              </div>
              <span>{isDemographicsPage ? `${3 - Object.keys(profileIssues).length}/3 ${t.requiredDetails}` : `${answeredCount} ${t.of} ${totalQuestionCount} ${t.answered}`}</span>
              <button className="primary-button" disabled={submitting} onClick={goNext}>{isDemographicsPage ? t.continueAssessment : t.next}</button>
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
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<AdminSession>("/api/admin/session")
      .then(setSession)
      .catch(() => setError("The administration service is unavailable."))
      .finally(() => setLoading(false));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const current = await api<AdminSession>("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setSession(current);
      setPassword("");
    } catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Sign in failed."); }
  }

  async function logout() {
    await api("/api/admin/logout", { method: "POST" });
    setSession({ authorized: false });
  }


  if (loading) return <div className="center-screen"><div className="spinner" /><p>Loading administration…</p></div>;
  if (!session.authorized) {
    return (
      <main className="admin-login-shell">
        <form className="login-card" onSubmit={login}>
          <button type="button" className="back-link" onClick={onExit}>← Return to survey</button>
          <div className="brand-mark large">MoA</div>
          <p className="eyebrow">Restricted access</p>
          <h1>Survey administration</h1>
          <p>Sign in to review leadership questionnaire responses and evaluator information.</p>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <button className="primary-button" type="submit">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <div className="admin-app">
      <header className="admin-header"><div><p className="eyebrow">Final questionnaire · Vf1</p><h1>Leadership assessment results</h1><p>Signed in as {session.displayName}</p></div><div className="admin-actions"><button className="secondary-button" onClick={onExit}>Open survey</button><a className="primary-button link-button" href="/api/admin/survey-results.csv">Export CSV</a><button className="text-button" onClick={logout}>Sign out</button></div></header>
      <main className="admin-main">
        {error && <div className="error-banner">{error}</div>}
        {session.role === "admin" && <SurveyWindowAdmin />}
        <ResultsDashboard />
      </main>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<"survey" | "admin">(window.location.hash === "#admin" ? "admin" : "survey");
  function changeView(next: "survey" | "admin") { window.location.hash = next === "admin" ? "admin" : ""; setView(next); window.scrollTo(0, 0); }
  return view === "admin" ? <Admin onExit={() => changeView("survey")} /> : <Survey onAdmin={() => changeView("admin")} />;
}
