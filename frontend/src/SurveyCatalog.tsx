import { useState, type FormEvent } from 'react';

export interface SurveyCategorySettings { titleEn: string; titleAm: string; audienceEn: string; audienceAm: string }
export interface SurveySettingsDefinition {
  descriptionEn: string; descriptionAm: string; instructionsEn: string; instructionsAm: string;
  categories: Record<'high_level' | 'middle_level' | 'lower_level', SurveyCategorySettings>;
}
export interface SurveyDefinition {
  id: string;
  nameEn: string;
  nameAm?: string;
  slug: string;
  published: boolean;
  archived: boolean;
  questionCount: number;
  responseCount: number;
  settings: SurveySettingsDefinition;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body as T;
}

export default function SurveyCatalog({ surveys, selectedId, canManage, onSelect, onChange }: {
  surveys: SurveyDefinition[];
  selectedId: string;
  canManage: boolean;
  onSelect: (id: string) => void;
  onChange: (surveys: SurveyDefinition[], selectedId?: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [copyQuestions, setCopyQuestions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = surveys.find(survey => survey.id === selectedId) || surveys[0];

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = await request<{ survey: SurveyDefinition; surveys: SurveyDefinition[] }>('/api/admin/surveys', {
        method: 'POST',
        body: JSON.stringify({ nameEn, nameAm, copyQuestionsFromId: copyQuestions ? selected?.id : null }),
      });
      onChange(payload.surveys, payload.survey.id);
      setNameEn(''); setNameAm(''); setCreating(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create the survey.'); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!selected || !window.confirm(`Publish “${selected.nameEn}” as the survey available at the public URL?`)) return;
    setBusy(true); setError('');
    try {
      const payload = await request<{ surveys: SurveyDefinition[] }>(`/api/admin/surveys/${encodeURIComponent(selected.id)}/publish`, { method: 'POST', body: '{}' });
      onChange(payload.surveys, selected.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to publish the survey.'); }
    finally { setBusy(false); }
  }

  return <section className="survey-catalog" aria-labelledby="survey-workspace-title">
    <div className="survey-catalog-main">
      <div className="survey-catalog-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3.5h9l3 3v14H6z" /><path d="M15 3.5v3h3M9 11h6M9 15h6" /></svg></div>
      <label className="survey-catalog-select"><span id="survey-workspace-title">Working on</span><select aria-label="Working survey" value={selected?.id || ''} onChange={event => onSelect(event.target.value)}>{surveys.map(survey => <option key={survey.id} value={survey.id}>{survey.nameEn}{survey.published ? ' · PUBLISHED' : ' · DRAFT'}</option>)}</select>{selected?.nameAm && <small lang="am">{selected.nameAm}</small>}</label>
      {selected && <div className="survey-catalog-metrics"><span><b>{selected.questionCount}</b> questions</span><span><b>{selected.responseCount}</b> responses</span><span className={selected.published ? 'published' : 'draft'}>{selected.published ? 'Published' : 'Draft'}</span></div>}
      {canManage && <div className="survey-catalog-actions">{selected && !selected.published && <button className="secondary-button" type="button" disabled={busy} onClick={publish}>Publish</button>}<button className="primary-button" type="button" onClick={() => { setCreating(value => !value); setError(''); }}>{creating ? 'Cancel' : '+ New survey'}</button></div>}
    </div>
    {creating && <form className="survey-create-form" onSubmit={create}>
      <div><strong>Create a survey</strong><p>Name it, then choose whether to copy the current questionnaire.</p></div>
      <label>Survey name <span>English</span><input value={nameEn} maxLength={160} onChange={event => setNameEn(event.target.value)} placeholder="Example: Employee Satisfaction Survey" required /></label>
      <label lang="am">የዳሰሳ ጥናት ስም <span>አማርኛ · optional</span><input value={nameAm} maxLength={160} onChange={event => setNameAm(event.target.value)} placeholder="የዳሰሳ ጥናቱን ስም ያስገቡ" /></label>
      <label className="survey-copy-option"><input type="checkbox" checked={copyQuestions} onChange={event => setCopyQuestions(event.target.checked)} /><span><b>Copy the current questions</b><small>Recommended. Turn this off to start with no questions.</small></span></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create survey'}</button>
    </form>}
    {error && <div className="error-banner" role="alert">{error}</div>}
  </section>;
}
