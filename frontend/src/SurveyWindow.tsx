import { useEffect, useRef, useState, type FormEvent } from 'react';
import './survey-window.css';
import { ethiopiaInput, planWindow } from './surveyWindowUi';
import { calendarDates } from './surveyCalendar';
import SurveyDateInput from './SurveyDateInput';

export interface Availability {
  state: 'open' | 'closed' | 'scheduled'; isOpen: boolean; revision: number; serverTime: string;
  period: { id: string; startsAt: string; endsAt: string; closedAt: string | null } | null;
  lastPeriod: { startsAt: string; endsAt: string; durationMinutes: number } | null;
}
export const windowCopy = {
  en: {
    closed: 'There is no survey at this time.', last: 'The last survey was open from', until: 'to',
    noLast: 'No previous survey period has been recorded.', next: 'The next survey is scheduled for',
    timezone: 'All dates and times are in Ethiopia time (UTC+3).', retry: 'Check again',
    unavailable: 'We cannot check survey availability right now. Please try again. Your saved draft has not been deleted.',
    days: 'days', hours: 'hours', minutes: 'minutes', duration: 'Duration',
    sectionComplete: 'Section completed', seniorDone: 'You have completed the Senior Leadership evaluation.',
    middleDone: 'You have completed the Middle Leadership evaluation.', lowerDone: 'You have completed the Lower Leadership evaluation.',
    middleNext: 'You are now about to evaluate Middle Leadership. Base your answers on your experience with leaders at this level.',
    lowerNext: 'You are now about to evaluate Lower Leadership. Base your answers on your experience with leaders at this level.',
    finalNext: 'You have completed all three leadership sections. Submit your assessment to save your responses.',
    middleContinue: 'Continue to Middle Leadership', lowerContinue: 'Continue to Lower Leadership',
    notSaved: 'Your answers are kept in this browser. They will be sent only when you submit the full assessment.', review: 'Review this section',
  },
  am: {
    closed: 'በአሁኑ ጊዜ ክፍት የሆነ ዳሰሳ ጥናት የለም።', last: 'ያለፈው ዳሰሳ ጥናት ክፍት የነበረው ከ', until: 'እስከ',
    noLast: 'ከዚህ በፊት የተመዘገበ የዳሰሳ ጥናት ወቅት የለም።', next: 'የሚቀጥለው ዳሰሳ ጥናት የሚካሄደው',
    timezone: 'ሁሉም ቀናትና ሰዓቶች በኢትዮጵያ ሰዓት (UTC+3) ናቸው።', retry: 'እንደገና ያረጋግጡ',
    unavailable: 'በአሁኑ ጊዜ ዳሰሳው ክፍት መሆኑን ማረጋገጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ። የተቀመጡ ያልተላኩ መልሶችዎ አልተሰረዙም።',
    days: 'ቀናት', hours: 'ሰዓታት', minutes: 'ደቂቃዎች', duration: 'ቆይታ',
    sectionComplete: 'ክፍሉን አጠናቀዋል', seniorDone: 'የከፍተኛ ደረጃ አመራር ግምገማን አጠናቀዋል።',
    middleDone: 'የመካከለኛ ደረጃ አመራር ግምገማን አጠናቀዋል።', lowerDone: 'የታችኛው ደረጃ አመራር ግምገማን አጠናቀዋል።',
    middleNext: 'አሁን የመካከለኛ ደረጃ አመራርን ለመገምገም እየተዘጋጁ ነው። መልሶችዎን በዚህ ደረጃ ካሉ አመራሮች ጋር ባለዎት ተሞክሮ ላይ ይመስርቱ።',
    lowerNext: 'አሁን የታችኛው ደረጃ አመራርን ለመገምገም እየተዘጋጁ ነው። መልሶችዎን በዚህ ደረጃ ካሉ አመራሮች ጋር ባለዎት ተሞክሮ ላይ ይመስርቱ።',
    finalNext: 'ሦስቱንም የአመራር ግምገማ ክፍሎች አጠናቀዋል። መልሶችዎ እንዲቀመጡ ግምገማዎን ያስገቡ።',
    middleContinue: 'ወደ መካከለኛ ደረጃ አመራር ይቀጥሉ', lowerContinue: 'ወደ ታችኛው ደረጃ አመራር ይቀጥሉ',
    notSaved: 'መልሶችዎ በዚህ አሳሽ ውስጥ ተቀምጠዋል። ሙሉ ግምገማውን ሲያስገቡ ብቻ ይላካሉ።', review: 'ይህን ክፍል ይመልከቱ',
  },
};
export function periodDate(value: string, language: 'en' | 'am' = 'en') {
  const dates = calendarDates(value, language);
  return `${dates.ethiopian} E.C. / ${dates.gregorian} G.C. · ${dates.time}`;
}
export function PeriodInformation({ availability, language }: { availability: Availability; language: 'en' | 'am' }) {
  const t = windowCopy[language], last = availability.lastPeriod;
  const minutes = last?.durationMinutes || 0;
  return <div className="period-information">
    {last ? <><p>{t.last}<br /><strong>{periodDate(last.startsAt, language)} {t.until} {periodDate(last.endsAt, language)}</strong></p><p>{t.duration}: {Math.floor(minutes / 1440)} {t.days}, {Math.floor(minutes % 1440 / 60)} {t.hours}, {minutes % 60} {t.minutes}</p></> : <p>{t.noLast}</p>}
    {availability.state === 'scheduled' && availability.period && <p>{t.next}<br /><strong>{periodDate(availability.period.startsAt, language)} {t.until} {periodDate(availability.period.endsAt, language)}</strong></p>}
    <small>{t.timezone}</small>
  </div>;
}
function WindowIcon({ kind = 'calendar' }: { kind?: 'calendar' | 'refresh' | 'shield' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2" /></> : kind === 'refresh' ? <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" /></> : <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>}
  </svg>;
}
function WindowDate({ value, label }: { value: string; label: string }) {
  const dates = calendarDates(value);
  return <div className="window-date"><span>{label}</span><strong>{dates.ethiopian} <small>E.C.</small></strong><span className="window-gregorian-date">{dates.gregorian} G.C.</span><time dateTime={value}>{dates.time}<small>Ethiopia · UTC+3</small></time></div>;
}

export default function SurveyWindowAdmin() {
  const [status, setStatus] = useState<Availability | null>(null);
  const [startMode, setStartMode] = useState<'now' | 'later'>('now');
  const [startsAt, setStartsAt] = useState(() => ethiopiaInput(new Date()));
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [fieldError, setFieldError] = useState<{ field: 'start' | 'end'; error: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ action: 'on' | 'off'; revision: number; startsAt?: string; endsAt?: string } | null>(null);
  const confirmationTitle = useRef<HTMLHeadingElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const requestId = useRef(0);

  async function request(options?: RequestInit) {
    const id = ++requestId.current;
    const response = await fetch('/api/admin/survey-window', { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update the survey window.');
    if (id === requestId.current) setStatus(data as Availability);
    return data as Availability;
  }
  async function refresh() {
    setBusy(true); setError(''); setNotice(''); setConfirmation(null);
    try { await request(); } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load survey controls.'); setStatus(null); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (confirmation) confirmationTitle.current?.focus();
  }, [confirmation]);
  useEffect(() => {
    if (!status?.period || status.state === 'closed') return;
    const boundary = status.state === 'scheduled' ? status.period.startsAt : status.period.endsAt;
    const timer = window.setTimeout(() => { void refresh(); }, Math.max(100, Math.min(2147483647, Date.parse(boundary) - Date.parse(status.serverTime) + 100)));
    return () => window.clearTimeout(timer);
  }, [status]);

  function prepare(event: FormEvent) {
    event.preventDefault();
    if (!status || busy) return;
    const plan = planWindow(startMode, startsAt, endsAt);
    if (plan.error && plan.field) {
      setFieldError({ field: plan.field, error: plan.error });
      document.getElementById(plan.field === 'start' ? 'window-start' : 'window-end')?.focus();
      return;
    }
    setError(''); setFieldError(null); setNotice('');
    setConfirmation({ action: 'on', revision: status.revision, startsAt: plan.startsAt, endsAt: plan.endsAt });
  }
  function chooseDuration(days: number) {
    const start = startMode === 'later' ? new Date(startsAt + ':00+03:00') : new Date();
    if (!Number.isFinite(start.getTime())) {
      setFieldError({ field: 'start', error: 'Choose an opening date before selecting a duration.' });
      document.getElementById('window-start')?.focus();
      return;
    }
    setEndsAt(ethiopiaInput(new Date(start.getTime() + days * 86400000))); setFieldError(null);
  }
  async function confirmChange() {
    if (!confirmation || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await request({ method: 'POST', body: JSON.stringify(confirmation) });
      setConfirmation(null);
      setNotice(updated.state === 'open' ? 'Survey opened successfully. Evaluators can now submit their responses.' : updated.state === 'scheduled' ? 'Schedule saved. The survey will open and close automatically.' : 'Survey closed. All submitted responses are safely retained.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to change survey availability.'); }
    finally { setBusy(false); }
  }
  const live = status?.state === 'open', scheduled = status?.state === 'scheduled';
  const enabled = live || scheduled;
  const badge = live ? 'ON · Survey open' : scheduled ? 'Scheduled' : status ? 'OFF · Survey closed' : 'Checking availability';
  const headline = live ? 'Your survey is accepting responses' : scheduled ? 'Your next survey is scheduled' : status ? 'Ready when you are' : 'Checking the survey status';
  const description = live ? 'Evaluators can submit until the closing time below.' : scheduled ? 'No action needed. Collection will start automatically at the opening time.' : status ? 'Open a new collection period now, or choose a future start.' : 'Please wait while we load your collection settings.';

  return <section className="admin-panel survey-window-admin" aria-labelledby="survey-availability-title" aria-busy={busy}>
    <div className="window-heading">
      <div className="window-heading-main"><span className="window-calendar-icon"><WindowIcon /></span><div><h2 id="survey-availability-title">Survey availability</h2><p>Manage when evaluators can take the survey.</p></div></div>
      <span className="window-timezone">E.C. + G.C. · UTC+3 · AM/PM</span>
    </div>
    <div className="window-controls">
      <div className={`window-status-banner ${live ? 'is-open' : scheduled ? 'is-scheduled' : 'is-closed'}`}>
        <div><span className="window-status-badge"><i aria-hidden="true" />{badge}</span><h3>{headline}</h3><p>{description}</p></div>
        <button type="button" className="window-refresh" disabled={busy} onClick={refresh}><WindowIcon kind="refresh" />{busy ? 'Please wait…' : 'Refresh status'}</button>
      </div>

      {enabled && status?.period && <>
        <div className="window-dates"><WindowDate value={status.period.startsAt} label={live ? 'Opened' : 'Opens automatically'} /><span className="window-date-arrow" aria-hidden="true">→</span><WindowDate value={status.period.endsAt} label="Closes automatically" /></div>
        {!confirmation && <div className="window-close-row"><div><strong>{scheduled ? 'Need to change the schedule?' : 'Need to finish collection early?'}</strong><p>{scheduled ? 'Cancel this schedule, then create a new collection period.' : 'Close the survey now. Unsubmitted assessments will no longer be accepted.'}</p></div><button ref={submitButton} type="button" className="window-close-button" disabled={busy} onClick={() => { setError(''); setNotice(''); setConfirmation({ action: 'off', revision: status.revision }); }}>{scheduled ? 'Cancel scheduled survey' : 'Close survey'}</button></div>}
      </>}

      {status?.state === 'closed' && !confirmation && <form onSubmit={prepare} className="window-setup-form" noValidate>
        <fieldset disabled={busy}><legend>When should the survey open?</legend><div className="window-start-options"><label className={startMode === 'now' ? 'selected' : ''}><input type="radio" name="window-start-mode" checked={startMode === 'now'} onChange={() => { setStartMode('now'); setFieldError(null); }} /><span><strong>Open now</strong><small>Start accepting responses once you confirm.</small></span></label><label className={startMode === 'later' ? 'selected' : ''}><input type="radio" name="window-start-mode" checked={startMode === 'later'} onChange={() => { setStartMode('later'); if (new Date(startsAt + ':00+03:00').getTime() <= Date.now()) setStartsAt(ethiopiaInput(new Date(Date.now() + 3600000))); setFieldError(null); }} /><span><strong>Schedule for later</strong><small>Choose a future opening date and time.</small></span></label></div></fieldset>
        <div className="window-form-fields">
          {startMode === 'later' && <SurveyDateInput id="window-start" label="Opening date & time" value={startsAt} onChange={value => { setStartsAt(value); setFieldError(null); }} disabled={busy} error={fieldError?.field === 'start' ? fieldError.error : undefined} />}
          <SurveyDateInput id="window-end" label="Closing date & time" value={endsAt} onChange={value => { setEndsAt(value); setFieldError(null); }} disabled={busy} error={fieldError?.field === 'end' ? fieldError.error : undefined} />
        </div>
        <p id="window-date-help" className="window-date-help">Choose Ethiopian (E.C.) or Gregorian (G.C.) dates. Times use the 12-hour AM/PM clock in Ethiopia (UTC+3), not the traditional Ethiopian clock. Both calendars represent the same opening and closing times.</p>
        <div className="window-duration-options"><span>Set collection duration:</span>{[1, 3, 7].map(days => <button type="button" disabled={busy} key={days} onClick={() => chooseDuration(days)}>{days} {days === 1 ? 'day' : 'days'}</button>)}</div>
        <div className="window-form-footer"><p>Review the dates before making the survey available.</p><button ref={submitButton} type="submit" className="primary-button" disabled={busy}>{startMode === 'now' ? 'Review & open survey' : 'Review schedule'}<span aria-hidden="true"> →</span></button></div>
      </form>}

      {confirmation && <section className="window-confirmation" aria-labelledby="window-confirm-title">
        <h3 id="window-confirm-title" ref={confirmationTitle} tabIndex={-1}>{confirmation.action === 'off' ? scheduled ? 'Cancel this scheduled survey?' : 'Close this survey now?' : startMode === 'now' ? 'Open the survey now?' : 'Confirm the survey schedule'}</h3>
        {confirmation.action === 'on' ? <><div className="window-dates"><WindowDate value={confirmation.startsAt!} label={startMode === 'now' ? 'Opens when confirmed' : 'Opening time'} /><span className="window-date-arrow" aria-hidden="true">→</span><WindowDate value={confirmation.endsAt!} label="Automatic closing time" /></div><p>This creates a new collection period. Earlier responses remain saved; drafts from an earlier period will not carry over.</p></> : <p>{scheduled ? 'The survey will not open at the scheduled time.' : 'Evaluators will no longer be able to submit, including those with the form already open.'} All submitted responses will remain saved.</p>}
        <div className="window-confirm-actions"><button type="button" disabled={busy} className={confirmation.action === 'off' ? 'window-close-button' : 'primary-button'} onClick={() => void confirmChange()}>{busy ? 'Saving changes…' : confirmation.action === 'off' ? scheduled ? 'Yes, cancel schedule' : 'Yes, close survey' : startMode === 'now' ? 'Confirm & open survey' : 'Confirm schedule'}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setConfirmation(null); setError(''); window.requestAnimationFrame(() => submitButton.current?.focus()); }}>{confirmation.action === 'on' ? 'Back to edit' : 'Keep current survey'}</button></div>
      </section>}

      {status?.lastPeriod && status.state === 'closed' && <details className="window-history"><summary>Last survey period <span>{periodDate(status.lastPeriod.endsAt)} · ended</span></summary><PeriodInformation availability={status} language="en" /></details>}
      {error && <div className="error-banner" role="alert">{error} Use Refresh status if the survey was changed by another administrator.</div>}
      {notice && <p className="window-success" role="status"><span aria-hidden="true">✓</span>{notice}</p>}
      <div className="window-assurance"><WindowIcon kind="shield" /><span>Admin-only controls. Closing a survey never deletes submitted responses.</span></div>
    </div>
  </section>;
}
