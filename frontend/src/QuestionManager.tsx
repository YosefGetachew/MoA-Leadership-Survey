import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LeadershipLevel, SurveySection } from './surveyFlow';
import type { SurveySettingsDefinition } from './SurveyCatalog';

type QuestionCategory = LeadershipLevel | 'open_ended';

interface ManagedQuestion {
  code: string;
  text: string;
  textAm: string;
  dimension?: string;
  sortOrder: number;
  active: boolean;
  leadershipLevel: QuestionCategory;
}

const defaultCategories: Array<{ value: QuestionCategory; label: string }> = [
  { value: 'high_level', label: 'Senior Leadership' },
  { value: 'middle_level', label: 'Middle Leadership' },
  { value: 'lower_level', label: 'Lower Leadership' },
  { value: 'open_ended', label: 'Open-ended questions' },
];
const emptyForm = (leadershipLevel: QuestionCategory, sortOrder = 10) => ({ code: '', leadershipLevel, textEn: '', textAm: '', dimension: '', sortOrder, active: true });

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body as T;
}

export default function QuestionManager({ surveyId, surveyName, surveySettings }: { surveyId: string; surveyName: string; surveySettings: SurveySettingsDefinition }) {
  const categories = defaultCategories.map(item => ({ ...item, label: item.value === 'open_ended' ? item.label : surveySettings.categories[item.value]?.titleEn || item.label }));
  const [questions, setQuestions] = useState<ManagedQuestion[]>([]);
  const [category, setCategory] = useState<QuestionCategory>('high_level');
  const [search, setSearch] = useState('');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm('high_level'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const editorDialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const payload = await request<{ sections: SurveySection[]; openQuestions?: Array<Omit<ManagedQuestion, 'leadershipLevel'>> }>(`/api/admin/questions?surveyId=${encodeURIComponent(surveyId)}`);
      setQuestions([...payload.sections.flatMap(section => section.questions.map(question => ({
        ...question,
        textAm: question.textAm || '',
        sortOrder: question.sortOrder || 0,
        active: question.active !== false,
        leadershipLevel: section.level,
      }))), ...(payload.openQuestions || []).map(question => ({ ...question, textAm: question.textAm || '', sortOrder: question.sortOrder || 0, active: question.active !== false, leadershipLevel: 'open_ended' as const }))]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load questions.'); }
    finally { setLoading(false); }
  }, [surveyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => editorDialog.current?.querySelector<HTMLElement>(editingCode ? 'textarea' : 'input:not(:disabled)')?.focus());
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) closeEditor(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [editorOpen, editingCode, saving]);

  const visible = useMemo(() => questions
    .filter(question => question.leadershipLevel === category)
    .filter(question => `${question.code} ${question.text} ${question.textAm} ${question.dimension || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)), [questions, category, search]);

  function addNew() {
    const nextOrder = Math.max(0, ...questions.filter(question => question.leadershipLevel === category).map(question => question.sortOrder)) + 10;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingCode(null); setForm(emptyForm(category, nextOrder)); setError(''); setMessage('');
    setEditorOpen(true);
  }

  function edit(question: ManagedQuestion) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingCode(question.code);
    setForm({ code: question.code, leadershipLevel: question.leadershipLevel, textEn: question.text, textAm: question.textAm, dimension: question.dimension || '', sortOrder: question.sortOrder, active: question.active });
    setError(''); setMessage('');
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false); setEditingCode(null); setError('');
    window.requestAnimationFrame(() => returnFocus.current?.focus());
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const url = editingCode ? `/api/admin/questions/${encodeURIComponent(editingCode)}` : '/api/admin/questions';
      await request(url, { method: editingCode ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, surveyId }) });
      setMessage(editingCode ? `${editingCode} was updated. The public questionnaire will use the new wording when it is next loaded.` : `${form.code.toUpperCase()} was added to the questionnaire.`);
      setCategory(form.leadershipLevel);
      setEditingCode(null);
      setForm(emptyForm(form.leadershipLevel, Number(form.sortOrder) + 10));
      setEditorOpen(false);
      await load();
      window.requestAnimationFrame(() => returnFocus.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the question.'); }
    finally { setSaving(false); }
  }

  return <section className="admin-panel question-manager">
    <div className="question-manager-heading">
      <div><p className="eyebrow">PostgreSQL question bank</p><h2>{surveyName}</h2><p>Edit the English and Amharic wording used by this survey. Questions are grouped by leadership category. Make structural changes while collection is closed so every evaluator receives the same tool.</p></div>
      <button className="primary-button" type="button" onClick={addNew}>+ Add question</button>
    </div>

    <div className="question-browser question-browser-top">
      <div className="question-browser-heading"><div><p className="eyebrow">Questionnaire</p><h3>Question library</h3><p>Select a leadership category to review, search or edit its questions.</p></div><span>{questions.length} questions</span></div>
      <div className="question-tabs" role="tablist" aria-label="Question categories">{categories.map(item => <button type="button" role="tab" aria-selected={category === item.value} className={category === item.value ? 'active' : ''} key={item.value} onClick={() => setCategory(item.value)}>{item.label}<span>{questions.filter(question => question.leadershipLevel === item.value).length}</span></button>)}</div>
    </div>

    {editorOpen && <div className="question-editor-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeEditor(); }}>
      <div ref={editorDialog} className="question-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="question-editor-title">
        <form id="question-editor" className="question-editor question-editor-modal" onSubmit={save}>
          <div className="question-editor-title"><div><p className="eyebrow">Question editor</p><h3 id="question-editor-title">{editingCode ? `Edit ${editingCode}` : 'Add a new question'}</h3><p>{editingCode ? 'Update the bilingual wording or question details below.' : 'The questionnaire code becomes the database primary key and cannot be changed later.'}</p></div><button className="question-editor-close" type="button" aria-label="Close question editor" disabled={saving} onClick={closeEditor}>×</button></div>
          {!editingCode && <div className="question-editor-meta">
            <label>Questionnaire code<input value={form.code} maxLength={20} placeholder="Example: HL24" onChange={event => setForm({ ...form, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} required /></label>
            <label>Questionnaire category<select value={form.leadershipLevel} onChange={event => setForm({ ...form, leadershipLevel: event.target.value as QuestionCategory })}>{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>Display order<input type="number" min="0" max="9999" step="1" value={form.sortOrder} onChange={event => setForm({ ...form, sortOrder: Number(event.target.value) })} required /></label>
            <label>Analysis dimension <span>optional</span><input value={form.dimension} maxLength={120} placeholder="Example: Accountability" onChange={event => setForm({ ...form, dimension: event.target.value })} /></label>
          </div>}
          {editingCode && <div className="question-fixed-details" aria-label="Question details">
            <div><span>Questionnaire code</span><strong><code>{form.code}</code></strong></div>
            <div><span>Category</span><strong>{categories.find(item => item.value === form.leadershipLevel)?.label || form.leadershipLevel}</strong></div>
          </div>}
          <div className="question-language-grid">
            <label className="question-language-card" data-language="EN"><span><b>English question</b><small>Shown first in English mode</small></span><textarea value={form.textEn} maxLength={4000} rows={3} onChange={event => setForm({ ...form, textEn: event.target.value })} required /></label>
            <label className="question-language-card" data-language="አማ" lang="am"><span><b>የአማርኛ ጥያቄ</b><small>በአማርኛ ሁኔታ መጀመሪያ ይታያል</small></span><textarea value={form.textAm} maxLength={4000} rows={3} onChange={event => setForm({ ...form, textAm: event.target.value })} required /></label>
          </div>
          <div className={`question-editor-footer ${editingCode ? 'edit-only' : ''}`}>{!editingCode && <label className="question-active"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} /><span><b>Active in questionnaire</b><small>Inactive questions remain saved but are hidden from evaluators.</small></span></label>}<div className="question-editor-actions"><button className="secondary-button" type="button" disabled={saving} onClick={closeEditor}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : editingCode ? 'Save question text' : 'Add question'}</button></div></div>
          {error && <div className="error-banner" role="alert">{error}</div>}
        </form>
      </div>
    </div>}

    <div className="question-browser">
      {message && <div className="question-success" role="status">✓ {message}</div>}
      <label className="question-search">Find a question<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search code, English or Amharic text" /></label>
      {loading ? <p className="empty-state">Loading questionnaire…</p> : <div className="managed-question-list">{visible.map((question, index) => <article className={question.active ? '' : 'inactive'} key={question.code}>
        <div className="managed-question-code"><code>{question.code}</code><span>#{index + 1}</span></div>
        <div className="managed-question-copy"><strong>{question.text}</strong><p lang="am">{question.textAm}</p>{question.dimension && <small>{question.dimension}</small>}</div>
        <div className="managed-question-actions"><span className={`status-pill ${question.active ? 'active' : 'inactive'}`}>{question.active ? 'Active' : 'Inactive'}</span><button className="secondary-button" type="button" onClick={() => edit(question)}>Edit</button></div>
      </article>)}{!visible.length && <p className="empty-state">No questions match this category and search.</p>}</div>}
    </div>
  </section>;
}
