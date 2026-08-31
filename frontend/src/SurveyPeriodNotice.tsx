import { useEffect, useState } from 'react';
import type { Availability } from './SurveyWindow';
import { calendarDates } from './surveyCalendar';
import { remainingSurveyLabel, surveyTimeRemaining } from './surveyCountdown';

export default function SurveyPeriodNotice({ availability, language }: { availability: Availability; language: 'en' | 'am' }) {
  const [now, setNow] = useState(() => Date.parse(availability.serverTime));
  useEffect(() => {
    // Anchor to the API clock, not the evaluator's potentially incorrect device clock.
    const serverTime = Date.parse(availability.serverTime);
    const receivedAt = performance.now();
    const tick = () => setNow(serverTime + performance.now() - receivedAt);
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [availability.serverTime]);
  if (!availability.period || !availability.isOpen) return null;
  const { startsAt, endsAt } = availability.period;
  const remaining = surveyTimeRemaining(endsAt, now);
  const amharic = language === 'am';
  return <aside className={`survey-period-notice ${remaining.days === 0 && remaining.hours === 0 ? 'is-ending' : ''}`} aria-label={amharic ? 'የዳሰሳ ጥናቱ ጊዜ' : 'Survey collection period'}>
    <details key={availability.period.id} className="survey-period-details">
    <summary className="survey-period-title">
      <svg className="survey-period-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      <span className="survey-period-summary"><strong>{remaining.expired ? (amharic ? 'ዳሰሳው ተዘግቷል' : 'Survey ended') : (amharic ? 'ዳሰሳው ክፍት ነው' : 'Survey open')}</strong><span className="survey-time-left" role="status" aria-live="polite" aria-atomic="true">{remainingSurveyLabel(endsAt, now, language)}</span></span>
      <span className="survey-period-toggle"><span className="when-collapsed">{amharic ? 'ቀናቱን ይመልከቱ' : 'View dates'}</span><span className="when-expanded">{amharic ? 'ቀናቱን ደብቅ' : 'Hide dates'}</span><span className="survey-period-chevron" aria-hidden="true">⌄</span></span>
    </summary>
    <div className="survey-period-expanded">
    <div className="survey-period-dates">{([{ value: startsAt, label: amharic ? 'ከ' : 'From' }, { value: endsAt, label: amharic ? 'እስከ' : 'Until' }]).map(({ value, label }) => {
      const date = calendarDates(value, language);
      return <div key={label}><span>{label}</span><time dateTime={value}><strong>{date.ethiopian} {amharic ? 'ዓ.ም.' : 'E.C.'} · {date.time}</strong><small>{date.gregorian} G.C.</small></time></div>;
    })}</div>
    <p>{amharic ? 'ሰዓቶች በኢትዮጵያ ሰዓት (UTC+3) ናቸው። እባክዎ ከመዝጊያ ሰዓቱ በፊት ግምገማዎን ያስገቡ።' : 'Times are in Ethiopia (UTC+3). Please submit your evaluation before the closing time.'}</p>
    </div>
    </details>
  </aside>;
}
