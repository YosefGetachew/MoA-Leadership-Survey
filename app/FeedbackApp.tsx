"use client";

import { FormEvent, useEffect, useState } from "react";

type View = "feedback" | "insights";
type Feedback = {
  id: number;
  trainingTitle: string;
  overallRating: number;
  recommendScore: number;
  highlight: string | null;
  improvement: string | null;
  createdAt: string;
};
type Stats = {
  total: number;
  averageRating: number;
  recommendationRate: number;
  positiveRate: number;
  recent: Feedback[];
};

const ratings = [
  { value: 1, label: "Poor" },
  { value: 2, label: "Fair" },
  { value: 3, label: "Good" },
  { value: 4, label: "Very good" },
  { value: 5, label: "Excellent" },
];

const initialStats: Stats = {
  total: 0,
  averageRating: 0,
  recommendationRate: 0,
  positiveRate: 0,
  recent: [],
};

export default function FeedbackApp() {
  const [view, setView] = useState<View>("feedback");
  const [rating, setRating] = useState(0);
  const [recommend, setRecommend] = useState<number | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [stats, setStats] = useState<Stats>(initialStats);

  async function loadStats() {
    try {
      const response = await fetch("/api/feedback", { cache: "no-store" });
      if (response.ok) setStats(await response.json());
    } catch {
      // The empty state remains useful while a local database is starting.
    }
  }

  useEffect(() => {
    if (view === "insights") loadStats();
  }, [view]);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating || recommend === null) return;
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trainingTitle: form.get("trainingTitle"),
          trainingDate: form.get("trainingDate"),
          participantName: anonymous ? "" : form.get("participantName"),
          department: form.get("department"),
          overallRating: rating,
          clarityRating: Number(form.get("clarityRating")),
          relevanceRating: Number(form.get("relevanceRating")),
          confidenceRating: Number(form.get("confidenceRating")),
          recommendScore: recommend,
          highlight: form.get("highlight"),
          improvement: form.get("improvement"),
          anonymous,
        }),
      });
      if (!response.ok) throw new Error("Submission failed");
      setStatus("done");
      event.currentTarget.reset();
      setRating(0);
      setRecommend(null);
    } catch {
      setStatus("error");
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Training Pulse home">
          <span className="brand-mark">TP</span>
          <span><strong>Training Pulse</strong><small>Ministry learning feedback</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <button className={view === "feedback" ? "active" : ""} onClick={() => setView("feedback")}>Give feedback</button>
          <button className={view === "insights" ? "active" : ""} onClick={() => setView("insights")}>View insights</button>
        </nav>
      </header>

      {view === "feedback" ? (
        <section className="feedback-layout" id="top">
          <aside className="intro-panel">
            <span className="eyebrow">Make every session count</span>
            <h1>Your voice shapes better training.</h1>
            <p>Share what worked and what could be improved. Your feedback helps the ministry deliver practical, relevant learning.</p>
            <div className="promise">
              <span className="shield">✓</span>
              <div><strong>Confidential by default</strong><p>Your name is optional. Honest feedback is always welcome.</p></div>
            </div>
            <div className="time-note"><span>◷</span> Takes about 2 minutes</div>
          </aside>

          <div className="form-card">
            {status === "done" ? (
              <div className="success-state">
                <div className="success-icon">✓</div>
                <span className="eyebrow">Feedback received</span>
                <h2>Thank you for helping us improve.</h2>
                <p>Your response has been recorded and will be included in the training summary.</p>
                <button className="primary-button" onClick={() => setStatus("idle")}>Submit another response</button>
              </div>
            ) : (
              <form onSubmit={submitFeedback}>
                <div className="form-heading"><div><span className="eyebrow">Training evaluation</span><h2>Tell us about your experience</h2></div><span className="required-note">* Required</span></div>
                <div className="field-grid">
                  <label>Training title *<input name="trainingTitle" placeholder="e.g. Records Management Workshop" required /></label>
                  <label>Date attended *<input name="trainingDate" type="date" required /></label>
                </div>

                <fieldset>
                  <legend>Overall, how would you rate this training? *</legend>
                  <div className="rating-row">
                    {ratings.map((item) => <button type="button" key={item.value} className={rating === item.value ? "selected" : ""} onClick={() => setRating(item.value)} aria-pressed={rating === item.value}><span>{item.value}</span>{item.label}</button>)}
                  </div>
                </fieldset>

                <div className="slider-group">
                  <label>How clear was the facilitator?<span><input name="clarityRating" type="range" min="1" max="5" defaultValue="4" /><small>Not clear <b>Very clear</b></small></span></label>
                  <label>How relevant was the content to your work?<span><input name="relevanceRating" type="range" min="1" max="5" defaultValue="4" /><small>Not relevant <b>Highly relevant</b></small></span></label>
                  <label>How confident are you applying what you learned?<span><input name="confidenceRating" type="range" min="1" max="5" defaultValue="4" /><small>Not confident <b>Very confident</b></small></span></label>
                </div>

                <fieldset>
                  <legend>How likely are you to recommend this training? *</legend>
                  <div className="nps-row">{Array.from({ length: 11 }, (_, value) => <button type="button" key={value} className={recommend === value ? "selected" : ""} onClick={() => setRecommend(value)}>{value}</button>)}</div>
                  <div className="nps-labels"><span>Not likely</span><span>Extremely likely</span></div>
                </fieldset>

                <label>What was the most valuable part?<textarea name="highlight" placeholder="Share a key takeaway or moment..." /></label>
                <label>What should we improve next time?<textarea name="improvement" placeholder="Your suggestions help us plan better sessions..." /></label>
                <div className="field-grid participant-fields">
                  <label>Department / unit<input name="department" placeholder="Optional" /></label>
                  {!anonymous && <label>Your name<input name="participantName" placeholder="Optional" /></label>}
                </div>
                <label className="toggle-row"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /><span className="toggle" /><span><strong>Submit anonymously</strong><small>Your identity will not be attached to this response.</small></span></label>
                {(!rating || recommend === null) && <p className="form-hint">Please select an overall rating and recommendation score.</p>}
                {status === "error" && <p className="error">We couldn’t save your response. Please try again.</p>}
                <button className="primary-button submit" disabled={status === "sending" || !rating || recommend === null}>{status === "sending" ? "Sending…" : "Submit feedback"}<span>→</span></button>
              </form>
            )}
          </div>
        </section>
      ) : (
        <section className="dashboard" id="top">
          <div className="dashboard-heading"><div><span className="eyebrow">Training performance</span><h1>Feedback insights</h1><p>A clear view of participant experience across ministry trainings.</p></div><button className="secondary-button" onClick={loadStats}>Refresh data</button></div>
          <div className="metric-grid">
            <article><span className="metric-icon blue">◎</span><p>Total responses</p><strong>{stats.total}</strong><small>All submitted evaluations</small></article>
            <article><span className="metric-icon gold">★</span><p>Average rating</p><strong>{stats.averageRating || "—"}<em>/ 5</em></strong><small>Overall training quality</small></article>
            <article><span className="metric-icon green">↑</span><p>Would recommend</p><strong>{stats.recommendationRate}%</strong><small>Scores of 9 or 10</small></article>
            <article><span className="metric-icon violet">+</span><p>Positive experience</p><strong>{stats.positiveRate}%</strong><small>Ratings of 4 or 5</small></article>
          </div>
          <div className="insight-grid">
            <article className="response-card"><div className="card-title"><div><h2>Recent responses</h2><p>Latest participant comments</p></div><span>{stats.recent.length} shown</span></div>
              {stats.recent.length === 0 ? <div className="empty-state"><span>✦</span><h3>No feedback yet</h3><p>Responses will appear here as participants complete the form.</p><button className="primary-button" onClick={() => setView("feedback")}>Open feedback form</button></div> :
                <div className="response-list">{stats.recent.map((item) => <div className="response-item" key={item.id}><div className="response-top"><strong>{item.trainingTitle}</strong><span>{"★".repeat(item.overallRating)}{"☆".repeat(5-item.overallRating)}</span></div><p>{item.highlight || item.improvement || "No written comment provided."}</p><small>{new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · Recommendation {item.recommendScore}/10</small></div>)}</div>}
            </article>
            <aside className="action-card"><span className="eyebrow">At a glance</span><h2>Turn feedback into action</h2><div className="action-item"><span>1</span><div><strong>Review after every session</strong><p>Check comments while the experience is still fresh.</p></div></div><div className="action-item"><span>2</span><div><strong>Share themes with facilitators</strong><p>Celebrate strengths and agree on one improvement.</p></div></div><div className="action-item"><span>3</span><div><strong>Track progress over time</strong><p>Use consistent questions to compare trainings.</p></div></div></aside>
          </div>
        </section>
      )}
      <footer><span>Training Pulse</span><p>Building a stronger public service through better learning.</p><small>Feedback is handled confidentially.</small></footer>
    </main>
  );
}
