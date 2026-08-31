import { useEffect, useRef, useState } from 'react';
import { calendarDates, clock24, ethiopianMonths, ethiopianParts, ethiopianToGregorian } from './surveyCalendar';
import { ethiopiaInput } from './surveyWindowUi';

function inputParts(value: string) {
  const date = value.slice(0, 10);
  const ec = ethiopianParts(new Date((date || ethiopiaInput(new Date()).slice(0, 10)) + 'T12:00:00Z'));
  const h = value ? Number(value.slice(11, 13)) : 9;
  return { date, year: String(ec.year), month: String(ec.month), day: value ? String(ec.day) : '', hour: String(h % 12 || 12), minute: value ? value.slice(14, 16) : '00', meridiem: h >= 12 ? 'PM' : 'AM' };
}

export default function SurveyDateInput({ id, label, value, onChange, disabled, error }: {
  id: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean; error?: string;
}) {
  const [calendar, setCalendar] = useState<'ethiopic' | 'gregory'>('ethiopic');
  const [parts, setParts] = useState(() => inputParts(value));
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) { setParts(inputParts(value)); lastEmitted.current = value; }
  }, [value]);
  function update(next: typeof parts) {
    setParts(next);
    const date = calendar === 'gregory' ? next.date : ethiopianToGregorian(Number(next.year), Number(next.month), Number(next.day));
    const time = clock24(next.hour, next.minute, next.meridiem);
    const result = date && time ? `${date}T${time}` : '';
    lastEmitted.current = result;
    onChange(result);
  }
  const invalidEthiopian = calendar === 'ethiopic' && Boolean(parts.day && parts.year) && !ethiopianToGregorian(Number(parts.year), Number(parts.month), Number(parts.day));
  const dates = value ? calendarDates(value + ':00+03:00') : null;
  return <fieldset className="window-field window-date-input" disabled={disabled}>
    <legend>{label} <span>Required</span></legend>
    <label htmlFor={id + '-calendar'}>Calendar</label>
    <select id={id + '-calendar'} value={calendar} onChange={event => { setCalendar(event.target.value as typeof calendar); setParts(inputParts(value)); }}>
      <option value="ethiopic">Ethiopian (E.C.)</option><option value="gregory">Gregorian (G.C.)</option>
    </select>
    {calendar === 'gregory' ? <><label htmlFor={id}>Date (G.C.)</label><input id={id} type="date" value={parts.date} onInput={event => update({ ...parts, date: event.currentTarget.value })} required aria-invalid={Boolean(error)} aria-describedby={id + '-error'} /></> : <div className="window-ec-fields">
      <div><label htmlFor={id}>Day</label><input id={id} type="number" min="1" max="30" step="1" value={parts.day} onChange={event => update({ ...parts, day: event.target.value })} required aria-invalid={Boolean(error) || invalidEthiopian} aria-describedby={id + '-error'} /></div>
      <div><label htmlFor={id + '-month'}>Month</label><select id={id + '-month'} value={parts.month} onChange={event => update({ ...parts, month: event.target.value })}>{ethiopianMonths.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></div>
      <div><label htmlFor={id + '-year'}>Year (E.C.)</label><input id={id + '-year'} type="number" min="1900" max="2200" step="1" value={parts.year} onChange={event => update({ ...parts, year: event.target.value })} required aria-describedby={id + '-error'} /></div>
    </div>}
    <div className="window-time-fields">
      <div><label htmlFor={id + '-hour'}>Hour</label><select id={id + '-hour'} value={parts.hour} onChange={event => update({ ...parts, hour: event.target.value })}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></div>
      <div><label htmlFor={id + '-minute'}>Minute</label><select id={id + '-minute'} value={parts.minute} onChange={event => update({ ...parts, minute: event.target.value })}>{Array.from({ length: 60 }, (_, i) => <option key={i}>{String(i).padStart(2, '0')}</option>)}</select></div>
      <div><label htmlFor={id + '-period'}>AM / PM</label><select id={id + '-period'} value={parts.meridiem} onChange={event => update({ ...parts, meridiem: event.target.value })}><option>AM</option><option>PM</option></select></div>
    </div>
    {dates && <small className="window-date-preview">{dates.ethiopian} E.C. · {dates.gregorian} G.C.<br />{dates.time} · UTC+3</small>}
    <small id={id + '-error'} className="window-field-error" role="status">{error || (invalidEthiopian ? 'Enter a valid Ethiopian date (year 1900–2200 E.C.). Pagume has only 5 or 6 days.' : '')}</small>
  </fieldset>;
}
