import { useEffect, useState, type FormEvent } from 'react';
import type { SurveyDefinition, SurveySettingsDefinition } from './SurveyCatalog';

const categoryOrder: Array<{ key: keyof SurveySettingsDefinition['categories']; fallback: string }> = [
  { key: 'high_level', fallback: 'First category' },
  { key: 'middle_level', fallback: 'Second category' },
  { key: 'lower_level', fallback: 'Third category' },
];

async function request<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The settings could not be saved.');
  return body as T;
}

export default function SurveySettings({ survey, onChange }: { survey: SurveyDefinition; onChange: (surveys: SurveyDefinition[]) => void }) {
  const [nameEn, setNameEn] = useState(survey.nameEn);
  const [nameAm, setNameAm] = useState(survey.nameAm || '');
  const [settings, setSettings] = useState(survey.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { setNameEn(survey.nameEn); setNameAm(survey.nameAm || ''); setSettings(survey.settings); setError(''); setMessage(''); }, [survey]);

  function category(key: keyof SurveySettingsDefinition['categories'], field: keyof SurveySettingsDefinition['categories']['high_level'], value: string) {
    setSettings(current => ({ ...current, categories: { ...current.categories, [key]: { ...current.categories[key], [field]: value } } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const payload = await request<{ surveys: SurveyDefinition[] }>(`/api/admin/surveys/${encodeURIComponent(survey.id)}`, { method: 'PATCH', body: JSON.stringify({ nameEn, nameAm, settings }) });
      onChange(payload.surveys); setMessage('Survey settings saved. The questionnaire will use these labels and instructions the next time it is loaded.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save survey settings.'); }
    finally { setBusy(false); }
  }

  return <form className="admin-panel survey-settings" onSubmit={save}>
    <div className="survey-settings-heading"><div><p className="eyebrow">Survey settings</p><h2>Edit what evaluators see</h2><p>Update the survey name, welcome text, instructions and section labels.</p></div></div>
    <section className="settings-section"><div className="settings-section-title"><span>01</span><div><h3>Survey identity</h3><p>The name appears in the public questionnaire, administration workspace and exports.</p></div></div><div className="settings-language-grid">
      <label>Survey name <small>English</small><input value={nameEn} maxLength={160} onChange={event => setNameEn(event.target.value)} required /></label>
      <label lang="am">የዳሰሳ ጥናት ስም <small>አማርኛ · optional</small><input value={nameAm} maxLength={160} onChange={event => setNameAm(event.target.value)} /></label>
    </div></section>
    <section className="settings-section"><div className="settings-section-title"><span>02</span><div><h3>Public introduction and instructions</h3><p>Edit the bilingual text evaluators see before they begin the selected survey.</p></div></div><div className="settings-language-grid">
      <label>Introduction <small>English</small><textarea rows={3} value={settings.descriptionEn} onChange={event => setSettings({ ...settings, descriptionEn: event.target.value })} placeholder="Explain the purpose, audience and privacy of this survey." required /></label>
      <label lang="am">መግቢያ <small>አማርኛ</small><textarea rows={3} value={settings.descriptionAm} onChange={event => setSettings({ ...settings, descriptionAm: event.target.value })} placeholder="የዳሰሳውን ዓላማ እና ተሳታፊዎች ያብራሩ።" required /></label>
      <label>How to answer <small>English</small><textarea rows={5} value={settings.instructionsEn} onChange={event => setSettings({ ...settings, instructionsEn: event.target.value })} placeholder="Enter clear step-by-step respondent guidance." required /></label>
      <label lang="am">አሞላል <small>አማርኛ</small><textarea rows={5} value={settings.instructionsAm} onChange={event => setSettings({ ...settings, instructionsAm: event.target.value })} placeholder="ለተሳታፊዎች ግልጽ የአሞላል መመሪያ ያስገቡ።" required /></label>
    </div></section>
    <section className="settings-section"><div className="settings-section-title"><span>03</span><div><h3>Questionnaire hierarchy</h3><p>Rename the three ordered categories and explain who or what belongs in each category. Questions remain linked to their category when labels change.</p></div></div><div className="hierarchy-settings">
      {categoryOrder.map((item, index) => <fieldset key={item.key}><legend><span>{index + 1}</span>{settings.categories[item.key].titleEn || item.fallback}</legend><div className="settings-language-grid">
        <label>Category name <small>English</small><input value={settings.categories[item.key].titleEn} maxLength={120} onChange={event => category(item.key, 'titleEn', event.target.value)} required /></label>
        <label lang="am">የምድብ ስም <small>አማርኛ</small><input value={settings.categories[item.key].titleAm} maxLength={120} onChange={event => category(item.key, 'titleAm', event.target.value)} required /></label>
        <label>Category description <small>English</small><textarea rows={2} value={settings.categories[item.key].audienceEn} onChange={event => category(item.key, 'audienceEn', event.target.value)} required /></label>
        <label lang="am">የምድብ መግለጫ <small>አማርኛ</small><textarea rows={2} value={settings.categories[item.key].audienceAm} onChange={event => category(item.key, 'audienceAm', event.target.value)} required /></label>
      </div></fieldset>)}
    </div></section>
    <div className="survey-settings-footer"><span>{survey.published ? 'Changes appear after evaluators reload the survey.' : 'Review these settings before publishing.'}</span><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    {error && <div className="error-banner" role="alert">{error}</div>}{message && <div className="question-success" role="status">✓ {message}</div>}
  </form>;
}
