import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { evaluatorLevels, SURVEY_VERSION } from './surveyFlow';
import './results.css';

interface Stats {
  valid: number; na: number; missing: number; invalid: number; counts: number[];
  average: number | null; median: number | null; sd: number | null;
  favorable: number | null; neutral: number | null; unfavorable: number | null; naRate: number | null;
}
interface Item extends Stats { code: string; text: string; title: string; leadershipLevel: string; number: number }
interface Results {
  version: string; generatedAt: string; availableVersions: { version: string; count: number }[];
  summary: { totalResponses: number; averageScore: number | null; naRate: number | null; completeRate: number | null; favorableRate: number | null; validRatings: number };
  levels: (Stats & { level: string; title: string; submissions: number; scoredSubmissions: number; respondentMean: number | null })[];
  items: Item[]; priorities: Item[]; strengths: Item[];
  demographics: { dimension: string; groups: { label: string; submissions: number; scoredSubmissions: number; average: number | null; levels: { level: string; n: number; average: number | null }[] }[] }[];
  correlations: { first: string; second: string; n: number; r: number | null; reason: string | null }[];
  quality: { expectedRatings: number; validRatings: number; naRatings: number; missingRatings: number; invalidRatings: number; completeSubmissions: number; allNaSubmissions: number; straightLineSubmissions: number; missingDemographics: number };
  recentResponses: { id: number; leadershipLevel: string; evaluatorLevel: string; sex: string; age: number | null; workExperience: number | null; answeredCount: number; naCount: number; completedAt: string }[];
}
const versions = [
  { value: SURVEY_VERSION, label: 'Current · evaluator demographics + 69 questions' },
  { value: 'leadership-all-levels-v3', label: 'Earlier · all-level questionnaire' },
  { value: 'leadership-reform-v2-2026-08-28', label: 'Earlier · single-level questionnaire' },
];
const defaults = { version: SURVEY_VERSION, evaluatorLevel: '' };
const number = (value: number | null) => value === null ? '—' : value.toFixed(2);
const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const role = (value: string) => evaluatorLevels.find(item => item.value === value)?.title || value || 'Not collected';
const date = (value: string) => new Date(value).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
function Panel({ title, note, children, id }: { title: string; note?: string; children: ReactNode; id: string }) {
  return <section className="admin-panel" id={id}><div className="panel-heading"><h2>{title}</h2>{note && <p>{note}</p>}</div>{children}</section>;
}
function Distribution({ stats }: { stats: Stats }) {
  const total = stats.valid + stats.na;
  const labels = ['1 · Strongly disagree', '2 · Disagree', '3 · Neither', '4 · Agree', '5 · Strongly agree', 'N/A'];
  return total ? <div className="rating-distribution" role="img" aria-label={labels.map((label, index) => `${label}: ${stats.counts[index]}`).join('; ')}>
    {stats.counts.map((count, index) => count ? <span key={index} className={`rating-${index + 1}`} style={{ width: `${100 * count / total}%` }} title={`${labels[index]}: ${count} (${(100 * count / total).toFixed(1)}%)`} /> : null)}
  </div> : <span>No ratings</span>;
}
function Ranking({ items, empty }: { items: Item[]; empty: string }) {
  return items.length ? <ol className="analysis-ranking">{items.map(item => <li key={item.code}>
    <div><span className="analysis-code">{item.code} · {item.title}</span><p>{item.text}</p>
      <small>{item.valid} valid ratings · {percent(item.unfavorable)} unfavorable · {percent(item.naRate)} N/A</small></div>
    <strong>{number(item.average)}<small> / 5</small></strong>
  </li>)}</ol> : <p className="empty-state">{empty}</p>;
}

export default function ResultsDashboard() {
  const [filters, setFilters] = useState(defaults);
  const [applied, setApplied] = useState(new URLSearchParams(defaults).toString());
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ data: Results | null; query: string; revision: number }>({ data: null, query: '', revision: -1 });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);
  const [dimension, setDimension] = useState('Evaluator category');
  const [itemLevel, setItemLevel] = useState('');
  const [itemOrder, setItemOrder] = useState('lowest');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setPending(true); setError('');
    fetch(`/api/admin/survey-results?${applied}`, { credentials: 'include', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load assessment results.');
        setState({ data: body, query: applied, revision });
      })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load results.'); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [applied, revision]);
  function apply(event: FormEvent) { event.preventDefault(); setApplied(new URLSearchParams(filters).toString()); setRevision(value => value + 1); }
  const results = state.query === applied && state.revision === revision ? state.data : null;
  const items = (results?.items || []).filter(item => (!itemLevel || item.leadershipLevel === itemLevel) && `${item.code} ${item.text}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    if (itemOrder === 'code') return a.code.localeCompare(b.code);
    if (itemOrder === 'na') return (b.naRate ?? -1) - (a.naRate ?? -1) || a.code.localeCompare(b.code);
    if (a.average === null) return b.average === null ? a.code.localeCompare(b.code) : 1;
    if (b.average === null) return -1;
    return (itemOrder === 'highest' ? b.average - a.average : a.average - b.average) || a.code.localeCompare(b.code);
  });
  const groups = results?.demographics.find(item => item.dimension === dimension)?.groups || [];
  const appliedFilters = new URLSearchParams(applied);
  return <div className="results-dashboard">
    <form className="analysis-filters" onSubmit={apply}>
      <label>Questionnaire version<select value={filters.version} onChange={event => setFilters({ ...filters, version: event.target.value })}>{versions.map(version => <option key={version.value} value={version.value}>{version.label}</option>)}</select></label>
      <label>Evaluator category<select value={filters.evaluatorLevel} onChange={event => setFilters({ ...filters, evaluatorLevel: event.target.value })}><option value="">All categories</option>{evaluatorLevels.map(level => <option key={level.value} value={level.value}>{level.title}</option>)}</select></label>
      <button className="primary-button" disabled={pending}>Apply / refresh</button>
      <button type="button" className="text-button" onClick={() => { setFilters(defaults); setApplied(new URLSearchParams(defaults).toString()); setRevision(value => value + 1); }}>Reset filters</button>
    </form>
    {error && <div className="error-banner" role="alert">{error} Use Apply / refresh to retry.</div>}
    {pending && <p role="status">Loading analysis…</p>}
    {results && !pending && <>
      <p className="analysis-scope">Showing {versions.find(version => version.value === results.version)?.label}. Category: {role(appliedFilters.get('evaluatorLevel') || 'All categories')}. Updated {new Date(results.generatedAt).toLocaleString()}.</p>
      <div className="analysis-notice">Repeat submissions are blocked for the same browser within a survey period, but anonymous browser checks cannot verify unique people across devices. These are descriptive results from participating evaluators, not estimates of the whole ministry. CSV exports all retained versions and is not restricted by these filters.</div>
      <section className="metric-grid">
        <article><span>Submitted assessments</span><strong>{results.summary.totalResponses}</strong><small>selected version and filters</small></article>
        <article title="Sum of valid leadership ratings divided by their count. Each rating has equal weight; N/A is excluded."><span>Average leadership rating</span><strong>{number(results.summary.averageScore)}</strong><small>/ 5 · {results.summary.validRatings} valid ratings</small></article>
        <article title="Ratings of 4 or 5 divided by all ratings of 1–5."><span>Favorable ratings</span><strong>{percent(results.summary.favorableRate)}</strong><small>Agree + Strongly agree · excludes N/A</small></article>
        <article title="N/A selections divided by valid ratings plus N/A selections."><span>N/A selections</span><strong>{percent(results.summary.naRate)}</strong><small>not scored as 6 or zero</small></article>
      </section>
      {results.summary.totalResponses === 0 && <div className="empty-state">No submissions match these filters. Change the evaluator category or questionnaire version.</div>}
      <Panel id="leadership-comparison" title="Leadership-level comparison" note="The respondent mean gives each qualifying submission equal weight. A section needs at least half its questions rated 1–5; N/A is excluded. Different sections measure different statements.">
        <div className="analysis-level-grid">{results.levels.map(level => <article key={level.level}>
          <h3>{level.title}</h3><strong className="level-score">{number(level.respondentMean)} <small>/ 5</small></strong><p>{level.scoredSubmissions} scored / {level.submissions} submitted</p>
          {level.scoredSubmissions < 5 && <p className="sample-warning">Small sample — interpret cautiously</p>}
          <Distribution stats={level} /><dl><div><dt>Favorable (4–5)</dt><dd>{percent(level.favorable)}</dd></div><div><dt>Neutral (3)</dt><dd>{percent(level.neutral)}</dd></div><div><dt>Unfavorable (1–2)</dt><dd>{percent(level.unfavorable)}</dd></div><div><dt>N/A</dt><dd>{level.na} · {percent(level.naRate)}</dd></div><div><dt>Valid rating count</dt><dd>{level.valid}</dd></div><div><dt>Rating median / SD</dt><dd>{number(level.median)} / {number(level.sd)}</dd></div></dl>
        </article>)}</div>
        <div className="distribution-legend">{['1 Strongly disagree', '2 Disagree', '3 Neither', '4 Agree', '5 Strongly agree', 'N/A'].map((label, index) => <span key={label}><i className={`rating-${index + 1}`} />{label}</span>)}</div>
      </Panel>
      <div className="analysis-two-column">
        <Panel id="lower-scoring-items" title="Lower-scoring statements" note="Up to five lowest means with at least five valid ratings each. Relative ranking is not a pass/fail classification; ties are ordered by code."><Ranking items={results.priorities} empty="At least five valid ratings per statement are needed for ranking." /></Panel>
        <Panel id="higher-scoring-items" title="Higher-scoring statements" note="Up to five highest means under the same filters and sample rule. Small differences are not evidence of a statistically significant gap."><Ranking items={results.strengths} empty="Higher-scoring statements will appear as sufficient ratings are collected." /></Panel>
      </div>
      <Panel id="evaluator-comparisons" title="Scores by evaluator group" note="Means are withheld for fewer than five scored submissions (—). Group differences are descriptive associations, not determinant factors or causal effects.">
        <div className="analysis-local-controls"><label>Compare by<select value={dimension} onChange={event => setDimension(event.target.value)}>{results.demographics.map(group => <option key={group.dimension}>{group.dimension}</option>)}</select></label></div>
        <div className="table-wrap"><table><thead><tr><th>Evaluator group</th><th className="numeric">Submissions</th>{results.levels.map(level => <th key={level.level} className="numeric">{level.title}</th>)}<th className="numeric">Equal-level composite</th></tr></thead><tbody>{groups.map(group => <tr key={group.label}><td>{role(group.label)}</td><td className="numeric">{group.submissions}</td>{group.levels.map(level => <td key={level.level} className="numeric">{number(level.average)}<small className="table-subtext">n = {level.n}</small></td>)}<td className="numeric">{number(group.average)}<small className="table-subtext">n = {group.scoredSubmissions}</small></td></tr>)}</tbody></table></div>
        <p className="analysis-footnote">Composite = average of the three section means within each submission, then average across submissions. All three sections must qualify. No composite is calculated for earlier single-level submissions. Counts refer to submissions, not independent people.</p>
      </Panel>
      <Panel id="score-correlations" title="Correlation between leadership scores" note="Pearson r compares paired section means from the same submissions. At least 10 pairs and variation in both scores are required.">
        <div className="table-wrap"><table><thead><tr><th>Paired levels</th><th className="numeric">Pairs</th><th className="numeric">r</th></tr></thead><tbody>{results.correlations.map(pair => <tr key={pair.first + pair.second}><td>{pair.first} / {pair.second}{pair.reason && <small className="table-subtext">{pair.reason}</small>}</td><td className="numeric">{pair.n}</td><td className="numeric">{number(pair.r)}</td></tr>)}</tbody></table></div>
        <p className="analysis-footnote">r ranges from −1 to +1. Positive values mean scores tend to move together; negative values mean opposite movement. Correlation is not causation, reliability, or proof of reform impact. No significance tests are reported; repeated submissions may not be independent.</p>
      </Panel>
      <Panel id="response-quality" title="Coverage and response quality" note="Quality flags identify records for review; they do not prove that responses are invalid and no records are automatically removed.">
        <dl className="quality-grid"><div><dt>Question completeness</dt><dd>{percent(results.summary.completeRate)}</dd><small>{results.quality.completeSubmissions} / {results.summary.totalResponses} submissions answer every expected leadership question, including N/A</small></div><div><dt>Missing / invalid ratings</dt><dd>{results.quality.missingRatings} / {results.quality.invalidRatings}</dd><small>Out of {results.quality.expectedRatings} expected question slots for this version and coverage</small></div><div><dt>All N/A submissions</dt><dd>{results.quality.allNaSubmissions}</dd><small>Complete answers, but no scored evidence</small></div><div><dt>Uniform rating flags</dt><dd>{results.quality.straightLineSubmissions}</dd><small>At least 10 valid ratings, all identical; N/A excluded. May reflect genuine views.</small></div><div><dt>Missing / invalid demographics</dt><dd>{results.quality.missingDemographics}</dd><small>Sex, age or experience missing or outside survey rules; expected in earlier versions</small></div><div><dt>Response / non-response rate</dt><dd>Not available</dd><small>Requires unique eligible/invited staff and response tracking. Submission count alone is not a response rate.</small></div></dl>
      </Panel>
      <Panel id="statement-detail" title="Question-level analysis" note="Means, medians, SD and agreement percentages use only ratings 1–5. N/A rate uses valid + N/A answers. Counts below five are marked as small samples.">
        <div className="analysis-local-controls"><label>Leadership section<select value={itemLevel} onChange={event => setItemLevel(event.target.value)}><option value="">All sections</option>{results.levels.map(level => <option key={level.level} value={level.level}>{level.title}</option>)}</select></label><label>Sort<select value={itemOrder} onChange={event => setItemOrder(event.target.value)}><option value="lowest">Lowest mean first</option><option value="highest">Highest mean first</option><option value="na">Highest N/A rate</option><option value="code">Question code</option></select></label><label>Find a statement<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Question code or wording" /></label></div>
        <div className="table-wrap analysis-scroll"><table><thead><tr><th>Statement</th><th className="numeric">Valid n</th><th className="numeric">Mean</th><th className="numeric">Median</th><th className="numeric">SD</th><th className="numeric">Favorable</th><th className="numeric">Unfavorable</th><th className="numeric">N/A n (%)</th><th className="numeric">Missing / invalid</th></tr></thead><tbody>{items.map(item => <tr key={item.code}><td className="statement-cell"><code>{item.code}</code> · {item.title} · Q{item.number}<p>{item.text}</p>{item.valid < 5 && <small className="sample-warning">Small sample</small>}</td><td className="numeric">{item.valid}</td><td className="numeric">{number(item.average)}</td><td className="numeric">{number(item.median)}</td><td className="numeric">{number(item.sd)}</td><td className="numeric">{percent(item.favorable)}</td><td className="numeric">{percent(item.unfavorable)}</td><td className="numeric">{item.na} ({percent(item.naRate)})</td><td className="numeric">{item.missing} / {item.invalid}</td></tr>)}</tbody></table>{!items.length && <p className="empty-state">No statements match your search.</p>}</div>
      </Panel>
      <details className="admin-panel analysis-methods"><summary>Definitions and limitations</summary><div>
        <p>Source: saved leadership_assessment_responses records. Every panel uses the selected questionnaire version, evaluator category; section-specific controls affect only their own table. Historical reform questions and registry fields are excluded.</p>
        <p>Item and headline averages weight valid question ratings equally, so sections with more questions contribute more. Leadership comparison and demographic section means weight qualifying submissions equally. Qualifying section coverage is at least 12/23 Senior, 14/28 Middle, or 9/18 Lower ratings of 1–5.</p>
        <p>Favorable = (4 + 5) / valid ratings; unfavorable = (1 + 2) / valid ratings; neutral = 3 / valid ratings. N/A = N/A / (valid + N/A). Distribution bars include N/A, so their segment widths have a different denominator from agreement percentages. SD is the sample standard deviation of valid ratings; it is not a confidence interval.</p>
        <p>Likert responses are ordinal. Means assume equal spacing and are descriptive summaries, shown alongside distributions and medians. No approved targets, sampling weights, invitation denominator, independent-person identifier or causal design are available. Five- and ten-submission display rules are safeguards, not guarantees of statistical reliability. Small differences and rankings should not be used alone for personnel decisions.</p>
        <p>All-time records by version (not affected by category filters): {results.availableVersions.map(version => `${versions.find(item => item.value === version.version)?.label}: ${version.count}`).join('; ')}.</p>
      </div></details>
      <Panel id="recent-submissions" title="Recent submissions" note="Up to 100 submissions within the applied filters. Earlier records remain available through the version selector and CSV.">
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Coverage</th><th>Evaluator category</th><th>Sex</th><th className="numeric">Age</th><th className="numeric">Experience</th><th className="numeric">Answered / N/A</th><th>Submitted (UTC)</th></tr></thead><tbody>{results.recentResponses.map(row => <tr key={row.id}><td>#{row.id}</td><td>{row.leadershipLevel === 'all_levels' ? 'All three levels' : results.levels.find(level => level.level === row.leadershipLevel)?.title}</td><td>{role(row.evaluatorLevel)}</td><td>{row.sex === 'male' ? 'Male' : row.sex === 'female' ? 'Female' : '—'}</td><td className="numeric">{row.age ?? '—'}</td><td className="numeric">{row.workExperience ?? '—'}</td><td className="numeric">{row.answeredCount} / {row.naCount}</td><td>{date(row.completedAt)}</td></tr>)}</tbody></table>{!results.recentResponses.length && <p className="empty-state">No submissions.</p>}</div>
      </Panel>
    </>}
  </div>;
}
