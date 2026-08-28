import { type FormEvent, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import surveySections from "./levelSurveyQuestions.json";
import { amharicCopy, amharicLevels, amharicQuestions } from "./amharic";
import { evaluatedSectorOptions, overallReformQuestions } from "./reformSurvey";

type LeadershipLevel = "high_level" | "middle_level" | "lower_level";
type Language = "en" | "am";
type Answers = Record<string, number>;

interface SurveySection {
  level: LeadershipLevel;
  title: string;
  audience: string;
  questions: Array<{ code: string; text: string }>;
}

interface MatrixQuestion { code: string; text: string; textAm?: string; dimension?: string }
interface SectorOption { value: string; label: string; labelAm?: string | null }
interface AdminSector { id: number; code: string; nameEn: string; nameAm?: string | null; leadershipLevel: LeadershipLevel; active: boolean; sortOrder: number; createdAt?: string }

interface AdminSession {
  authorized: boolean;
  displayName?: string;
  role?: string;
}

interface SurveyResults {
  summary: {
    totalResponses: number;
    levelCounts: Record<LeadershipLevel, number>;
    averageScore: number | null;
    naRate: number;
    completeRate: number;
  };
  items: Array<{
    code: string;
    text: string;
    leadershipLevel: LeadershipLevel | "overall";
    responses: number;
    average: number | null;
  }>;
  recentResponses: Array<{
    id: number;
    leadershipLevel: LeadershipLevel;
    evaluatedLeadershipPosition: string | null;
    evaluatedSector: string;
    evaluatedSectorName?: string;
    evaluatorName: string | null;
    evaluatorOrganization: string | null;
    evaluatorPosition: string | null;
    evaluatorContact: string | null;
    answeredCount: number;
    naCount: number;
    completedAt: string;
  }>;
}

const sections = surveySections as SurveySection[];
const QUESTIONS_PER_PAGE = 5;
const leadershipPositions: Record<LeadershipLevel, Array<{ value: string; label: string; labelAm: string }>> = {
  high_level: [
    { value: "minister", label: "Minister", labelAm: "ሚኒስትር" },
    { value: "state_minister", label: "State Minister", labelAm: "ሚኒስትር ዴኤታ" },
    { value: "director_general", label: "Director General", labelAm: "ዋና ዳይሬክተር" },
    { value: "commissioner", label: "Commissioner", labelAm: "ኮሚሽነር" },
    { value: "bureau_head", label: "Bureau Head", labelAm: "የቢሮ ኃላፊ" },
    { value: "equivalent_senior_executive", label: "Equivalent Senior Executive", labelAm: "ተመሳሳይ ከፍተኛ ሥራ አስፈጻሚ" },
  ],
  middle_level: [
    { value: "lead_executive", label: "Lead Executive", labelAm: "መሪ ሥራ አስፈጻሚ" },
    { value: "executive", label: "Executive", labelAm: "ሥራ አስፈጻሚ" },
    { value: "advisor", label: "Advisor", labelAm: "አማካሪ" },
    { value: "project_coordinator", label: "Project Coordinator", labelAm: "የፕሮጀክት አስተባባሪ" },
  ],
  lower_level: [
    { value: "team_leader", label: "Team Leader", labelAm: "የቡድን መሪ" },
    { value: "desk_head", label: "Desk Head", labelAm: "የዴስክ ኃላፊ" },
  ],
};
const englishCopy = {
  ministry: "Ministry of Agriculture", surveyName: "Leadership Assessment Survey", admin: "Admin",
  loading: "Loading the assessment…", unavailable: "The survey service is unavailable. Please confirm that the API is running.",
  finalTool: "Final questionnaire · Vf1", title: "Leadership Assessment Questionnaire",
  qrTitle: "Scan to open the survey", qrHelp: "Use a phone camera to access this questionnaire.",
  lead: "Rate an existing Ministry of Agriculture leader based on your direct experience. Your response is anonymous.",
  howTo: "How to answer", instructions: "Choose the leadership level of the person being assessed. Then rate every statement from 1 to 5, or select N/A when it is not applicable or you do not have sufficient information.",
  chooseLevel: "Which leadership level are you assessing?", statements: "statements", estimate: "Estimated time: 6–10 minutes",
  selectSector: "Select a sector or institution", specifyOther: "Specify the other sector or institution",
  evaluatedPosition: "Leadership position being evaluated", selectPosition: "Select a leadership position",
  positionHelp: "Only positions belonging to the selected leadership level are shown.", positionRequired: "Select the leadership position being evaluated.",
  overallSection: "Overall institutional reform assessment", overallIntro: "First, rate these general statements about the institutional reform.",
  leadershipSection: "Leadership assessment",
  evaluatedSector: "Sector / institution being evaluated", evaluatedSectorPlaceholder: "For example: Crop Development Sector or Regional Agriculture Bureau",
  sectorHelp: "Only sectors or institutions registered for the selected leadership level are shown.", sectorRequired: "Select the sector or institution being evaluated.",
  noSectors: "No active sectors are registered for this leadership level. Please contact the survey administrator.",
  evaluatorInfo: "Evaluator information", optional: "Optional", evaluatorPrivacy: "This section is optional. Leave it blank to submit your response anonymously.",
  evaluatorName: "Full name", evaluatorOrganization: "Organization / unit", evaluatorPosition: "Position or job title", evaluatorContact: "Email or phone",
  begin: "Begin assessment", page: "Page", of: "of", complete: "complete",
  stronglyDisagree: "Strongly disagree", disagree: "Disagree", neither: "Neither agree nor disagree", agree: "Agree", stronglyAgree: "Strongly agree",
  na: "N/A", naLong: "Not applicable / I do not have sufficient information",
  requiredPage: "Please answer every statement on this page. Select N/A when you do not have enough information.",
  requiredAll: "Please answer every statement before submitting.", back: "Back", next: "Next", answered: "answered",
  submit: "Submit assessment", submitting: "Submitting…", responseRecorded: "Response recorded",
  thankYou: "Thank you for completing the leadership assessment.", saved: "Your ratings have been saved securely. If you provided evaluator details, they were stored with your response.",
  evaluateAnother: "Evaluate another leader", preparingAnother: "Preparing a new assessment…",
  adminSignIn: "Administrator sign in", footer: "Ministry of Agriculture · Leadership Assessment · Responses are stored in PostgreSQL",
  changeWarning: "Changing the leadership level will clear your current answers. Continue?", saveFailed: "Your response could not be saved.",
  restartFailed: "A new assessment could not be started. Please try again.",
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
      if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
      return payload as T;
    });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatSector(value: string | null | undefined, registeredSectors: Array<AdminSector | SectorOption> = []) {
  if (!value) return "—";
  if (value.startsWith("other:")) return `Other: ${value.slice(6)}`;
  const registered = registeredSectors.find((sector) => ("code" in sector ? sector.code : sector.value) === value);
  if (registered) return "nameEn" in registered ? registered.nameEn : registered.label;
  return evaluatedSectorOptions.find((option) => option.value === value)?.label || value;
}

function formatLeadershipPosition(value: string | null | undefined) {
  if (!value) return "—";
  return Object.values(leadershipPositions).flat().find((position) => position.value === value)?.label || value;
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
  const [level, setLevel] = useState<LeadershipLevel | "">("");
  const [answers, setAnswers] = useState<Answers>({});
  const [overallAnswers, setOverallAnswers] = useState<Answers>({});
  const [evaluatedLeadershipPosition, setEvaluatedLeadershipPosition] = useState("");
  const [evaluatedSector, setEvaluatedSector] = useState("");
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [evaluator, setEvaluator] = useState({ name: "", organization: "", position: "", contact: "" });
  const [page, setPage] = useState(-1);
  const [submitted, setSubmitted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const t = language === "am" ? amharicCopy : englishCopy;
  const surveyAccessUrl = `${window.location.origin}${window.location.pathname}`;
  const scale = surveyScale(language);
  const levelTitle = (item: SurveySection) => language === "am" ? amharicLevels[item.level].title : item.title;
  const levelAudience = (item: SurveySection) => language === "am" ? amharicLevels[item.level].audience : item.audience;
  const questionTranslation = (question: MatrixQuestion) => question.textAm || amharicQuestions[question.code] || "";

  const section = sections.find((item) => item.level === level);
  const leadershipPages = section ? Math.ceil(section.questions.length / QUESTIONS_PER_PAGE) : 0;
  const totalPages = section ? leadershipPages + 1 : 0;
  const isOverallPage = page === 0;
  const pageQuestions: MatrixQuestion[] = page < 0 ? [] : isOverallPage
    ? [...overallReformQuestions]
    : section?.questions.slice((page - 1) * QUESTIONS_PER_PAGE, page * QUESTIONS_PER_PAGE) || [];
  const leadershipAnswered = section ? section.questions.filter((question) => answers[question.code]).length : 0;
  const overallAnswered = overallReformQuestions.filter((question) => overallAnswers[question.code]).length;
  const answeredCount = leadershipAnswered + overallAnswered;
  const totalQuestionCount = section ? section.questions.length + overallReformQuestions.length : overallReformQuestions.length;
  const progress = totalQuestionCount ? Math.round((answeredCount / totalQuestionCount) * 100) : 0;

  useEffect(() => {
    api<{ submitted: boolean }>("/api/survey/status")
      .then((status) => setSubmitted(status.submitted))
      .catch(() => setError(language === "am" ? amharicCopy.unavailable : englishCopy.unavailable))
      .finally(() => setChecking(false));
    try {
      const saved = JSON.parse(localStorage.getItem("leadership-reform-survey-draft-v2") || "null");
      if (saved?.level && sections.some((item) => item.level === saved.level)) {
        setLevel(saved.level);
        setAnswers(saved.answers || {});
        setOverallAnswers(saved.overallAnswers || {});
        setEvaluatedLeadershipPosition(saved.evaluatedLeadershipPosition || "");
        setEvaluatedSector(saved.evaluatedSector || "");
        setEvaluator(saved.evaluator || { name: "", organization: "", position: "", contact: "" });
      }
    } catch { /* Ignore an invalid local draft. */ }
  }, []);

  useEffect(() => {
    if (!level) {
      setSectors([]);
      return;
    }
    let cancelled = false;
    api<{ sectors: SectorOption[] }>(`/api/survey/sectors?leadershipLevel=${encodeURIComponent(level)}`)
      .then((data) => {
        if (cancelled) return;
        setSectors(data.sectors);
        setEvaluatedSector((current) => data.sectors.some((sector) => sector.value === current) ? current : "");
      })
      .catch(() => { if (!cancelled) setError(language === "am" ? amharicCopy.unavailable : englishCopy.unavailable); });
    return () => { cancelled = true; };
  }, [level]);

  useEffect(() => {
    localStorage.setItem("moa-survey-language", language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!submitted && (level || Object.keys(answers).length)) {
      localStorage.setItem("leadership-reform-survey-draft-v2", JSON.stringify({ level, answers, overallAnswers, evaluatedLeadershipPosition, evaluatedSector, evaluator }));
    }
  }, [level, answers, overallAnswers, evaluatedLeadershipPosition, evaluatedSector, evaluator, submitted]);

  function chooseLevel(nextLevel: LeadershipLevel) {
    if (nextLevel !== level && Object.keys(answers).length && !window.confirm(t.changeWarning)) return;
    if (nextLevel !== level) {
      setAnswers({});
      setEvaluatedLeadershipPosition("");
      setEvaluatedSector("");
      setSectors([]);
    }
    setLevel(nextLevel);
    setError("");
  }

  function goNext() {
    const activeAnswers = isOverallPage ? overallAnswers : answers;
    const missing = pageQuestions.find((question) => !activeAnswers[question.code]);
    if (missing) {
      setError(t.requiredPage);
      document.getElementById(`question-${missing.code}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setError("");
    setPage((current) => Math.min(current + 1, totalPages - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginAssessment() {
    if (!evaluatedLeadershipPosition) {
      setError(t.positionRequired);
      document.getElementById("evaluated-position")?.focus();
      return;
    }
    if (!evaluatedSector) {
      setError(t.sectorRequired);
      document.getElementById("evaluated-sector")?.focus();
      return;
    }
    setPage(0);
    setError("");
    window.scrollTo(0, 0);
  }

  async function submit() {
    if (!section || leadershipAnswered !== section.questions.length || overallAnswered !== overallReformQuestions.length) {
      setError(t.requiredAll);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api("/api/survey/responses", {
        method: "POST",
        body: JSON.stringify({
          leadershipLevel: level,
          evaluatedLeadershipPosition,
          evaluatedSector,
          evaluatorName: evaluator.name,
          evaluatorOrganization: evaluator.organization,
          evaluatorPosition: evaluator.position,
          evaluatorContact: evaluator.contact,
          overallResponses: overallAnswers,
          responses: answers,
        }),
      });
      localStorage.removeItem("leadership-reform-survey-draft-v2");
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(language === "am" ? t.saveFailed : requestError instanceof Error ? requestError.message : t.saveFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function evaluateAnother() {
    setSubmitting(true);
    setError("");
    try {
      await api<{ ready: boolean }>("/api/survey/restart", { method: "POST" });
      localStorage.removeItem("leadership-reform-survey-draft-v2");
      setLevel("");
      setAnswers({});
      setOverallAnswers({});
      setEvaluatedLeadershipPosition("");
      setEvaluatedSector("");
      setEvaluator({ name: "", organization: "", position: "", contact: "" });
      setPage(-1);
      setSubmitted(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(language === "am" ? t.restartFailed : requestError instanceof Error ? requestError.message : t.restartFailed);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) return <div className="center-screen"><div className="spinner" /><p>{t.loading}</p></div>;

  if (submitted) {
    return (
      <main className="survey-shell thank-you-shell">
        <section className="thank-you-card">
          <LanguageSwitch language={language} onChange={setLanguage} />
          <div className="success-mark">✓</div>
          <p className="eyebrow">{t.responseRecorded}</p>
          <h1>{t.thankYou}</h1>
          <p>{t.saved}</p>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary-button" onClick={evaluateAnother} disabled={submitting}>
            {submitting ? t.preparingAnother : t.evaluateAnother}
          </button>
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
        <div className="topbar-actions"><LanguageSwitch language={language} onChange={setLanguage} /><button className="admin-link" onClick={onAdmin}>{t.admin}</button></div>
      </header>

      {page >= 0 && section && (
        <div className="progress-wrap" aria-label={`${progress}% ${t.complete}`}>
          <div className="progress-meta"><span>{levelTitle(section)}</span><strong>{progress}% {t.complete}</strong></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <main className="survey-shell">
        {page === -1 ? (
          <section className="intro-card">
            <aside className="survey-qr-card" aria-label={t.qrTitle}>
              <div className="survey-qr-code"><QRCodeSVG value={surveyAccessUrl} size={118} level="M" bgColor="#ffffff" fgColor="#0b4b35" title={t.qrTitle} /></div>
              <div><strong>{t.qrTitle}</strong><p>{t.qrHelp}</p><small>{surveyAccessUrl}</small></div>
            </aside>
            <p className="eyebrow">{t.finalTool}</p>
            <h1>{t.title}</h1>
            <p className="lead">{t.lead}</p>
            <div className="notice"><strong>{t.howTo}</strong><span>{t.instructions}</span></div>
            <fieldset className="level-picker">
              <legend>{t.chooseLevel} <span>*</span></legend>
              {sections.map((item) => (
                <label className={`level-card ${level === item.level ? "selected" : ""}`} key={item.level}>
                  <input type="radio" name="leadership-level" value={item.level} checked={level === item.level} onChange={() => chooseLevel(item.level)} />
                  <span className="level-radio" />
                  <span><strong>{levelTitle(item)}</strong>{level === item.level && <small>{levelAudience(item)}</small>}<em>{item.questions.length} {t.statements}</em></span>
                </label>
              ))}
            </fieldset>
            <section className="respondent-details">
              {level && (
                <label className="survey-field required-field linked-field" htmlFor="evaluated-position">
                  <span>{t.evaluatedPosition} <b>*</b></span>
                  <select id="evaluated-position" value={evaluatedLeadershipPosition} onChange={(event) => { setEvaluatedLeadershipPosition(event.target.value); setError(""); }} required>
                    <option value="">{t.selectPosition}</option>
                    {leadershipPositions[level].map((position) => <option value={position.value} key={position.value}>{language === "am" ? position.labelAm : position.label}</option>)}
                  </select>
                  <small>{t.positionHelp}</small>
                </label>
              )}
              {level && (
                <label className="survey-field required-field linked-field" htmlFor="evaluated-sector">
                  <span>{t.evaluatedSector} <b>*</b></span>
                  <select
                    id="evaluated-sector"
                    value={evaluatedSector}
                    onChange={(event) => { setEvaluatedSector(event.target.value); setError(""); }}
                    disabled={!sectors.length}
                    required
                  >
                    <option value="">{sectors.length ? t.selectSector : t.noSectors}</option>
                    {sectors.map((option) => <option value={option.value} key={option.value}>{language === "am" && option.labelAm ? option.labelAm : option.label}</option>)}
                  </select>
                  <small>{sectors.length ? t.sectorHelp : t.noSectors}</small>
                </label>
              )}

              <fieldset className="optional-profile">
                <legend>{t.evaluatorInfo} <span>{t.optional}</span></legend>
                <p>{t.evaluatorPrivacy}</p>
                <div className="profile-grid">
                  <label className="survey-field"><span>{t.evaluatorName}</span><input value={evaluator.name} onChange={(event) => setEvaluator((current) => ({ ...current, name: event.target.value }))} maxLength={160} /></label>
                  <label className="survey-field"><span>{t.evaluatorOrganization}</span><input value={evaluator.organization} onChange={(event) => setEvaluator((current) => ({ ...current, organization: event.target.value }))} maxLength={180} /></label>
                  <label className="survey-field"><span>{t.evaluatorPosition}</span><input value={evaluator.position} onChange={(event) => setEvaluator((current) => ({ ...current, position: event.target.value }))} maxLength={160} /></label>
                  <label className="survey-field"><span>{t.evaluatorContact}</span><input value={evaluator.contact} onChange={(event) => setEvaluator((current) => ({ ...current, contact: event.target.value }))} maxLength={180} /></label>
                </div>
              </fieldset>
            </section>
            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="intro-footer"><span>{t.estimate}</span><button className="primary-button" disabled={!level || !evaluatedLeadershipPosition || !evaluatedSector || !sectors.length} onClick={beginAssessment}>{t.begin}</button></div>
          </section>
        ) : section ? (
          <section className="questionnaire-card">
            <div className="page-heading">
              <div><p className="eyebrow">{t.page} {page + 1} {t.of} {totalPages}</p><h1>{isOverallPage ? t.overallSection : levelTitle(section)}</h1><p>{isOverallPage ? t.overallIntro : levelAudience(section)}</p></div>
            </div>

            <div className="matrix-scroll" role="region" aria-label={isOverallPage ? t.overallSection : t.leadershipSection} tabIndex={0}>
              <table className="survey-matrix">
                <thead><tr><th scope="col">{t.statements}</th>{scale.map((option) => <th scope="col" key={option.value}><strong>{option.display}</strong><span>{option.short}</span></th>)}</tr></thead>
                <tbody>
                  {pageQuestions.map((question, index) => {
                    const activeAnswers = isOverallPage ? overallAnswers : answers;
                    const number = isOverallPage ? index + 1 : (page - 1) * QUESTIONS_PER_PAGE + index + 1;
                    const translation = questionTranslation(question);
                    return (
                      <tr className={activeAnswers[question.code] ? "answered" : ""} id={`question-${question.code}`} key={question.code}>
                        <th scope="row"><span className="matrix-question-number">{number}.</span><span className="matrix-question-copy"><strong>{language === "am" ? translation : question.text}</strong>{translation && <small>{language === "am" ? question.text : translation}</small>}</span></th>
                        {scale.map((option) => <td key={option.value}><label className={activeAnswers[question.code] === option.value ? "chosen" : ""} title={option.label}><input type="radio" name={question.code} value={option.value} checked={activeAnswers[question.code] === option.value} aria-label={`${option.display} - ${option.label}`} onChange={() => { if (isOverallPage) setOverallAnswers((current) => ({ ...current, [question.code]: option.value })); else setAnswers((current) => ({ ...current, [question.code]: option.value })); setError(""); }} /><span className="matrix-radio" /></label></td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="survey-actions">
              <button className="secondary-button" onClick={() => { setError(""); if (page === 0) setPage(-1); else setPage((current) => current - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t.back}</button>
              <span>{answeredCount} {t.of} {totalQuestionCount} {t.answered}</span>
              {page < totalPages - 1 ? <button className="primary-button" onClick={goNext}>{t.next}</button> : <button className="primary-button submit-button" disabled={submitting} onClick={submit}>{submitting ? t.submitting : t.submit}</button>}
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
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [adminSectors, setAdminSectors] = useState<AdminSector[]>([]);
  const [sectorForm, setSectorForm] = useState<{ id: number | null; nameEn: string; nameAm: string; leadershipLevel: LeadershipLevel; sortOrder: number }>({ id: null, nameEn: "", nameAm: "", leadershipLevel: "high_level", sortOrder: 100 });
  const [savingSector, setSavingSector] = useState(false);
  const [sectorRegistryOpen, setSectorRegistryOpen] = useState(false);
  const [sectorLevelFilter, setSectorLevelFilter] = useState<LeadershipLevel | "all">("all");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function loadResults() {
    const data = await api<SurveyResults>("/api/admin/survey-results");
    setResults(data);
  }

  async function loadAdminSectors() {
    const data = await api<{ sectors: AdminSector[] }>("/api/admin/sectors");
    setAdminSectors(data.sectors);
  }

  useEffect(() => {
    api<AdminSession>("/api/admin/session")
      .then(async (current) => {
        setSession(current);
        if (current.authorized) await Promise.all([loadResults(), current.role === "admin" ? loadAdminSectors() : Promise.resolve()]);
      })
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
      await Promise.all([loadResults(), current.role === "admin" ? loadAdminSectors() : Promise.resolve()]);
    } catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Sign in failed."); }
  }

  async function logout() {
    await api("/api/admin/logout", { method: "POST" });
    setSession({ authorized: false });
    setResults(null);
    setAdminSectors([]);
  }

  function resetSectorForm() {
    setSectorForm({ id: null, nameEn: "", nameAm: "", leadershipLevel: "high_level", sortOrder: 100 });
  }

  async function saveSector(event: FormEvent) {
    event.preventDefault();
    setSavingSector(true);
    setError("");
    try {
      const url = sectorForm.id ? `/api/admin/sectors/${sectorForm.id}` : "/api/admin/sectors";
      await api(url, { method: "POST", body: JSON.stringify(sectorForm) });
      resetSectorForm();
      await loadAdminSectors();
    } catch (sectorError) {
      setError(sectorError instanceof Error ? sectorError.message : "The sector could not be saved.");
    } finally {
      setSavingSector(false);
    }
  }

  async function toggleSector(id: number) {
    setError("");
    try {
      await api(`/api/admin/sectors/${id}/toggle`, { method: "POST" });
      await loadAdminSectors();
    } catch (sectorError) { setError(sectorError instanceof Error ? sectorError.message : "The sector status could not be changed."); }
  }

  const rankedItems = useMemo(() => results?.items.filter((item) => item.responses > 0).sort((a, b) => (a.average ?? 0) - (b.average ?? 0)) || [], [results]);
  const filteredAdminSectors = useMemo(() => sectorLevelFilter === "all" ? adminSectors : adminSectors.filter((sector) => sector.leadershipLevel === sectorLevelFilter), [adminSectors, sectorLevelFilter]);

  if (loading) return <div className="center-screen"><div className="spinner" /><p>Loading administration…</p></div>;
  if (!session.authorized) {
    return (
      <main className="admin-login-shell">
        <form className="login-card" onSubmit={login}>
          <button type="button" className="back-link" onClick={onExit}>← Return to survey</button>
          <div className="brand-mark large">MoA</div>
          <p className="eyebrow">Restricted access</p>
          <h1>Survey administration</h1>
          <p>Sign in to manage level-linked sectors and review the final questionnaire responses.</p>
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
        {session.role === "admin" && (
          <section className={`admin-panel sector-management ${sectorRegistryOpen ? "open" : "collapsed"}`}>
            <div className="panel-heading registry-heading"><div><h2>Sector and institution registry</h2><p>{adminSectors.length} registered entries · organized by leadership level</p></div><button className="secondary-button registry-toggle" type="button" aria-expanded={sectorRegistryOpen} onClick={() => setSectorRegistryOpen((current) => !current)}>{sectorRegistryOpen ? "Hide registry" : "Manage registry"}</button></div>
            {sectorRegistryOpen && (
              <div className="registry-container">
                <div className="sector-level-tabs" role="group" aria-label="Filter registry by leadership level">
                  <button className={sectorLevelFilter === "all" ? "active" : ""} type="button" onClick={() => setSectorLevelFilter("all")}>All <span>{adminSectors.length}</span></button>
                  {sections.map((item) => <button className={sectorLevelFilter === item.level ? "active" : ""} type="button" key={item.level} onClick={() => setSectorLevelFilter(item.level)}>{item.title} <span>{adminSectors.filter((sector) => sector.leadershipLevel === item.level).length}</span></button>)}
                </div>
                <form className="sector-admin-form" onSubmit={saveSector}>
                  <label>Leadership level<select value={sectorForm.leadershipLevel} onChange={(event) => setSectorForm((current) => ({ ...current, leadershipLevel: event.target.value as LeadershipLevel }))}>{sections.map((item) => <option value={item.level} key={item.level}>{item.title}</option>)}</select></label>
                  <label>English name<input value={sectorForm.nameEn} onChange={(event) => setSectorForm((current) => ({ ...current, nameEn: event.target.value }))} maxLength={160} required /></label>
                  <label>Amharic name<input value={sectorForm.nameAm} onChange={(event) => setSectorForm((current) => ({ ...current, nameAm: event.target.value }))} maxLength={160} /></label>
                  <label>Display order<input type="number" min="0" max="9999" value={sectorForm.sortOrder} onChange={(event) => setSectorForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></label>
                  <div className="sector-form-actions"><button className="primary-button" type="submit" disabled={savingSector}>{savingSector ? "Saving…" : sectorForm.id ? "Update entry" : "Register entry"}</button>{sectorForm.id && <button className="secondary-button" type="button" onClick={resetSectorForm}>Cancel</button>}</div>
                </form>
                <div className="registry-table-container"><div className="table-wrap"><table><thead><tr><th>Leadership level</th><th>English</th><th>Amharic</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredAdminSectors.map((sector) => <tr key={sector.id}><td>{sections.find((item) => item.level === sector.leadershipLevel)?.title}</td><td><strong>{sector.nameEn}</strong></td><td>{sector.nameAm || "—"}</td><td>{sector.sortOrder}</td><td><span className={`status-pill ${sector.active ? "active" : "inactive"}`}>{sector.active ? "Active" : "Inactive"}</span></td><td><div className="row-actions"><button type="button" onClick={() => { setSectorLevelFilter(sector.leadershipLevel); setSectorForm({ id: sector.id, nameEn: sector.nameEn, nameAm: sector.nameAm || "", leadershipLevel: sector.leadershipLevel, sortOrder: sector.sortOrder }); }}>Edit</button><button type="button" onClick={() => toggleSector(sector.id)}>{sector.active ? "Deactivate" : "Activate"}</button></div></td></tr>)}</tbody></table></div></div>
              </div>
            )}
          </section>
        )}
        {results && (
          <>
            <section className="metric-grid">
              <article><span>Total responses</span><strong>{results.summary.totalResponses}</strong><small>submitted assessments</small></article>
              <article><span>Average score</span><strong>{results.summary.averageScore ?? "—"}</strong><small>out of 5, excluding N/A</small></article>
              <article><span>Complete responses</span><strong>{results.summary.completeRate}%</strong><small>all required statements answered</small></article>
              <article><span>N/A rate</span><strong>{results.summary.naRate}%</strong><small>insufficient-information selections</small></article>
            </section>
            <section className="admin-panel level-summary"><div className="panel-heading"><div><h2>Responses by leadership level</h2><p>Only the questionnaire’s three assessment groups are included.</p></div></div><div className="level-bars">{sections.map((section) => { const count = results.summary.levelCounts[section.level] || 0; const width = results.summary.totalResponses ? (count / results.summary.totalResponses) * 100 : 0; return <div key={section.level}><div><strong>{section.title}</strong><span>{count}</span></div><div className="bar"><span style={{ width: `${width}%` }} /></div></div>; })}</div></section>
            <section className="admin-panel"><div className="panel-heading"><div><h2>Item analysis</h2><p>Lowest average items appear first. N/A responses are excluded from averages.</p></div></div>{rankedItems.length ? <div className="table-wrap"><table><thead><tr><th>Item</th><th>Statement</th><th>Valid ratings</th><th>Average</th></tr></thead><tbody>{rankedItems.map((item) => <tr key={item.code}><td><code>{item.code}</code></td><td>{item.text}</td><td>{item.responses}</td><td><strong>{item.average ?? "—"}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state">No questionnaire responses have been submitted yet.</div>}</section>
            <section className="admin-panel"><div className="panel-heading"><div><h2>Recent submissions</h2><p>Leadership position and sector are linked to the selected leadership level.</p></div></div>{results.recentResponses.length ? <div className="table-wrap"><table><thead><tr><th>ID</th><th>Leadership level</th><th>Position</th><th>Evaluated sector</th><th>Evaluator</th><th>Answered</th><th>N/A</th><th>Submitted</th></tr></thead><tbody>{results.recentResponses.map((response) => <tr key={response.id}><td>#{response.id}</td><td>{sections.find((section) => section.level === response.leadershipLevel)?.title}</td><td>{formatLeadershipPosition(response.evaluatedLeadershipPosition)}</td><td>{response.evaluatedSectorName || formatSector(response.evaluatedSector, adminSectors)}</td><td>{response.evaluatorName ? <><strong>{response.evaluatorName}</strong>{response.evaluatorOrganization && <small className="table-subtext">{response.evaluatorOrganization}</small>}</> : "Anonymous"}</td><td>{response.answeredCount}</td><td>{response.naCount}</td><td>{formatDate(response.completedAt)}</td></tr>)}</tbody></table></div> : <div className="empty-state">No submissions yet.</div>}</section>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<"survey" | "admin">(window.location.hash === "#admin" ? "admin" : "survey");
  function changeView(next: "survey" | "admin") { window.location.hash = next === "admin" ? "admin" : ""; setView(next); window.scrollTo(0, 0); }
  return view === "admin" ? <Admin onExit={() => changeView("survey")} /> : <Survey onAdmin={() => changeView("admin")} />;
}
