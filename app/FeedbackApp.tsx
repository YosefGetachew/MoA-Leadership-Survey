"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

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
type TrainingOption = {
  id: number;
  title: string;
  trainingDate: string;
  trainerName: string;
  facilitatorName: string;
};
type StaffRole = "admin" | "data_encoder";
type StaffUser = {
  id: number;
  username: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
};
type TrainingSummary = {
  trainingTitle: string;
  trainingDate: string;
  total: number;
  averageRating: number;
  averageTrainer: number;
  averageClarity: number;
  averageRelevance: number;
  averageConfidence: number;
  recommendationRate: number;
};
type Stats = {
  total: number;
  averageRating: number;
  averageTrainer: number;
  averageClarity: number;
  averageRelevance: number;
  averageConfidence: number;
  recommendationRate: number;
  positiveRate: number;
  trainings: TrainingSummary[];
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
  averageTrainer: 0,
  averageClarity: 0,
  averageRelevance: 0,
  averageConfidence: 0,
  recommendationRate: 0,
  positiveRate: 0,
  trainings: [],
  recent: [],
};

export default function FeedbackApp() {
  const [view, setView] = useState<View>("feedback");
  const [rating, setRating] = useState(0);
  const [recommend, setRecommend] = useState<number | null>(null);
  const [trainerKnowledge, setTrainerKnowledge] = useState(0);
  const [clarity, setClarity] = useState(0);
  const [relevance, setRelevance] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [anonymous, setAnonymous] = useState(true);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [submissionError, setSubmissionError] = useState("");
  const [stats, setStats] = useState<Stats>(initialStats);
  const [staffAuthorized, setStaffAuthorized] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole | "">("");
  const [staffDisplayName, setStaffDisplayName] = useState("");
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [staffUsername, setStaffUsername] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selectedTraining, setSelectedTraining] = useState("all");
  const [trainingOptions, setTrainingOptions] = useState<TrainingOption[]>([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [newTrainingTitle, setNewTrainingTitle] = useState("");
  const [newTrainingDate, setNewTrainingDate] = useState("");
  const [newTrainerName, setNewTrainerName] = useState("");
  const [newFacilitatorName, setNewFacilitatorName] = useState("");
  const [trainingError, setTrainingError] = useState("");
  const [editingTraining, setEditingTraining] = useState<TrainingOption | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<StaffRole>("data_encoder");
  const [userError, setUserError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [qrCopied, setQrCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  async function loadTrainingOptions() {
    try {
      const response = await fetch("/api/trainings", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setTrainingOptions(data.trainings || []);
      }
    } catch {
      setTrainingOptions([]);
    }
  }

  async function loadStaffUsers() {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setStaffUsers(data.users || []);
      }
    } catch {
      setStaffUsers([]);
    }
  }

  useEffect(() => {
    loadTrainingOptions();
    setShareUrl(window.location.origin);
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setStaffAuthorized(Boolean(data.authorized));
        setStaffRole(data.role || "");
        setStaffDisplayName(data.displayName || "");
        if (data.role === "admin") loadStaffUsers();
      })
      .catch(() => setStaffAuthorized(false));
  }, []);

  function downloadQrCode() {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "ministry-training-feedback-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setQrCopied(true);
      window.setTimeout(() => setQrCopied(false), 1800);
    } catch {
      setQrCopied(false);
    }
  }

  async function loadStats() {
    try {
      const params = new URLSearchParams();
      if (selectedTraining !== "all") {
        const selected = JSON.parse(selectedTraining) as { trainingTitle: string; trainingDate: string };
        params.set("trainingTitle", selected.trainingTitle);
        params.set("trainingDate", selected.trainingDate);
      }
      const response = await fetch(`/api/feedback${params.size ? `?${params}` : ""}`, { cache: "no-store" });
      if (response.ok) setStats(await response.json());
      if (response.status === 401) {
        setStaffAuthorized(false);
        setView("feedback");
      }
    } catch {
      // The empty state remains useful while a local database is starting.
    }
  }

  async function signInStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: staffUsername, password: staffPassword }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: "Unable to sign in." }));
      setLoginError(result.error || "Unable to sign in.");
      return;
    }
    const result = await response.json();
    setStaffAuthorized(true);
    setStaffRole(result.role || "");
    setStaffDisplayName(result.displayName || "");
    if (result.role === "admin") await loadStaffUsers();
    setShowStaffLogin(false);
    setStaffUsername("");
    setStaffPassword("");
    setView("insights");
  }

  async function signOutStaff() {
    await fetch("/api/admin/logout", { method: "POST" });
    setStaffAuthorized(false);
    setStaffRole("");
    setStaffDisplayName("");
    setStaffUsers([]);
    setView("feedback");
  }

  async function addStaffUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserError("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: newUserUsername, displayName: newUserDisplayName, password: newUserPassword, role: newUserRole }),
    });
    const result = await response.json().catch(() => ({ error: "Unable to add user." }));
    if (!response.ok) {
      setUserError(result.error || "Unable to add user.");
      return;
    }
    setNewUserUsername("");
    setNewUserDisplayName("");
    setNewUserPassword("");
    setNewUserRole("data_encoder");
    setShowUserModal(false);
    await loadStaffUsers();
  }

  async function addTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTrainingError("");
    const response = await fetch("/api/trainings", {
      method: editingTraining ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: editingTraining?.id, title: newTrainingTitle, trainingDate: newTrainingDate, trainerName: newTrainerName, facilitatorName: newFacilitatorName }),
    });
    const result = await response.json().catch(() => ({ error: "Unable to add training." }));
    if (!response.ok) {
      setTrainingError(result.error || "Unable to add training.");
      return;
    }
    setNewTrainingTitle("");
    setNewTrainingDate("");
    setNewTrainerName("");
    setNewFacilitatorName("");
    setEditingTraining(null);
    setShowTrainingModal(false);
    await loadTrainingOptions();
    await loadStats();
  }

  function openAddTraining() {
    setEditingTraining(null);
    setNewTrainingTitle("");
    setNewTrainingDate("");
    setNewTrainerName("");
    setNewFacilitatorName("");
    setTrainingError("");
    setShowTrainingModal(true);
  }

  function openEditTraining(training: TrainingOption) {
    setEditingTraining(training);
    setNewTrainingTitle(training.title);
    setNewTrainingDate(training.trainingDate);
    setNewTrainerName(training.trainerName);
    setNewFacilitatorName(training.facilitatorName);
    setTrainingError("");
    setShowTrainingModal(true);
  }

  useEffect(() => {
    if (view === "insights") loadStats();
  }, [view, selectedTraining]);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSession || !rating || !trainerKnowledge || !clarity || !relevance || !confidence || recommend === null) return;
    setStatus("sending");
    setSubmissionError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const training = JSON.parse(selectedSession) as { trainingTitle: string; trainingDate: string };
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trainingTitle: training.trainingTitle,
          trainingDate: training.trainingDate,
          participantName: anonymous ? "" : form.get("participantName"),
          department: form.get("department"),
          overallRating: rating,
          trainerRating: Number(form.get("trainerRating")),
          clarityRating: Number(form.get("clarityRating")),
          relevanceRating: Number(form.get("relevanceRating")),
          confidenceRating: Number(form.get("confidenceRating")),
          recommendScore: recommend,
          highlight: form.get("highlight"),
          improvement: form.get("improvement"),
          anonymous,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || "We couldn’t save your response. Please try again.");
      }
      setStatus("done");
      formElement.reset();
      setRating(0);
      setSelectedSession("");
      setRecommend(null);
      setTrainerKnowledge(0);
      setClarity(0);
      setRelevance(0);
      setConfidence(0);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "We couldn’t save your response. Please try again.");
      setStatus("error");
    }
  }

  const selectedSessionDetails = selectedSession
    ? JSON.parse(selectedSession) as { trainingTitle: string; trainingDate: string; trainerName: string; facilitatorName: string }
    : null;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Training Pulse home">
          <img className="ministry-logo" src="/ministry-logo.png" alt="Ministry of Agriculture" />
          <span><strong>Training Pulse</strong><small>Ministry of Agriculture · Ethiopia</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <button className={view === "feedback" ? "active" : ""} onClick={() => setView("feedback")}>Give feedback</button>
          {staffAuthorized && <button className={view === "insights" ? "active" : ""} onClick={() => setView("insights")}>View insights</button>}
        </nav>
      </header>

      {view === "feedback" ? (
        <section className="feedback-layout" id="top">
          <aside className="intro-panel">
            <div className="home-qr-card">
              <div className="qr-card-copy">
                <div className="qr-card-brand">
                  <img src="/ministry-logo.png" alt="" />
                  <span><b>Training Pulse</b><small>Quick participant access</small></span>
                </div>
                <strong>Scan to open the feedback form</strong>
                <p>Point your phone camera at the code to begin.</p>
                {shareUrl.includes("localhost") && <small className="qr-notice">Use a network or published address when scanning from a phone.</small>}
                <div className="home-qr-actions">
                  <button type="button" onClick={copyShareUrl}>{qrCopied ? "Link copied" : "Copy link"}</button>
                  <button type="button" onClick={downloadQrCode}>Download QR</button>
                </div>
              </div>
              <div className="home-qr-code">
                {shareUrl && <QRCodeCanvas ref={qrCanvasRef} value={shareUrl} size={160} level="H" marginSize={2} bgColor="#ffffff" fgColor="#023302" />}
              </div>
            </div>
            <span className="eyebrow">Make every session count</span>
            <h1>Your voice shapes better training.</h1>
            <p>Share what worked and what could be improved. Your feedback helps the ministry deliver practical, relevant learning.</p>
            <div className="initiative-note">
              <span>Leadership initiative</span>
              <p>This training initiative was launched under the leadership of His Excellency, the Minister of Agriculture.</p>
            </div>
            <div className="intro-bottom">
              <div className="intro-assurance">
                <div className="promise">
                  <span className="shield">✓</span>
                  <div><strong>Confidential by default</strong><p>Your name is optional. Honest feedback is always welcome.</p></div>
                </div>
                <div className="time-note"><span>◷</span> Takes about 2 minutes</div>
              </div>
            </div>
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
                <label className="training-select-field">Training session *<select value={selectedSession} onChange={(event) => setSelectedSession(event.target.value)} required><option value="">Select your training</option>{trainingOptions.map((training) => <option key={training.id} value={JSON.stringify({ trainingTitle: training.title, trainingDate: training.trainingDate, trainerName: training.trainerName, facilitatorName: training.facilitatorName })}>{training.title} · {new Date(`${training.trainingDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</option>)}</select>{trainingOptions.length === 0 && <small>No training has been added yet. Please contact the administrator.</small>}{selectedSessionDetails && <span className="session-people"><b>Trainer:</b> {selectedSessionDetails.trainerName}<i /><b>Facilitator:</b> {selectedSessionDetails.facilitatorName}</span>}</label>

                <fieldset>
                  <legend>Overall, how would you rate this training? *</legend>
                  <div className="rating-row">
                    {ratings.map((item) => <button type="button" key={item.value} className={rating === item.value ? "selected" : ""} onClick={() => setRating(item.value)} aria-pressed={rating === item.value}><span>{item.value}</span>{item.label}</button>)}
                  </div>
                </fieldset>

                <div className="scale-group">
                  <div className="scale-row">
                    <label>How knowledgeable was the trainer about the subject? *</label>
                    <input type="hidden" name="trainerRating" value={trainerKnowledge} />
                    <div className="scale-buttons" aria-label="Trainer subject knowledge rating">{ratings.map((item) => <button type="button" key={item.value} className={trainerKnowledge === item.value ? "selected" : ""} onClick={() => setTrainerKnowledge(item.value)} aria-pressed={trainerKnowledge === item.value}><span>{item.value}</span><small>{item.label}</small></button>)}</div>
                  </div>
                  <div className="scale-row">
                    <label>How clear was the facilitator?</label>
                    <input type="hidden" name="clarityRating" value={clarity} />
                    <div className="scale-buttons" aria-label="Facilitator clarity rating">{ratings.map((item) => <button type="button" key={item.value} className={clarity === item.value ? "selected" : ""} onClick={() => setClarity(item.value)} aria-pressed={clarity === item.value}><span>{item.value}</span><small>{item.label}</small></button>)}</div>
                  </div>
                  <div className="scale-row">
                    <label>How relevant was the content to your work?</label>
                    <input type="hidden" name="relevanceRating" value={relevance} />
                    <div className="scale-buttons" aria-label="Content relevance rating">{ratings.map((item) => <button type="button" key={item.value} className={relevance === item.value ? "selected" : ""} onClick={() => setRelevance(item.value)} aria-pressed={relevance === item.value}><span>{item.value}</span><small>{item.label}</small></button>)}</div>
                  </div>
                  <div className="scale-row">
                    <label>How confident are you applying what you learned?</label>
                    <input type="hidden" name="confidenceRating" value={confidence} />
                    <div className="scale-buttons" aria-label="Confidence rating">{ratings.map((item) => <button type="button" key={item.value} className={confidence === item.value ? "selected" : ""} onClick={() => setConfidence(item.value)} aria-pressed={confidence === item.value}><span>{item.value}</span><small>{item.label}</small></button>)}</div>
                  </div>
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
                {(!selectedSession || !rating || !trainerKnowledge || !clarity || !relevance || !confidence || recommend === null) && <p className="form-hint">Please select a training and answer every required rating.</p>}
                {status === "error" && <p className="error">{submissionError}</p>}
                <button className="primary-button submit" disabled={status === "sending" || !selectedSession || !rating || !trainerKnowledge || !clarity || !relevance || !confidence || recommend === null}>{status === "sending" ? "Sending…" : "Submit feedback"}<span>→</span></button>
              </form>
            )}
          </div>
        </section>
      ) : (
        <section className="dashboard" id="top">
          <div className="dashboard-heading"><div><span className="eyebrow">Training performance</span><h1>Feedback insights</h1><p>A clear view of participant experience across ministry trainings.</p></div><div className="dashboard-controls"><label>Training<select value={selectedTraining} onChange={(event) => setSelectedTraining(event.target.value)}><option value="all">All trainings</option>{stats.trainings.map((training) => <option key={`${training.trainingTitle}-${training.trainingDate}`} value={JSON.stringify({ trainingTitle: training.trainingTitle, trainingDate: training.trainingDate })}>{training.trainingTitle} · {new Date(`${training.trainingDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</option>)}</select></label><button className="secondary-button add-training-button" onClick={openAddTraining}>+ Add training</button>{staffRole === "admin" && <button className="secondary-button add-user-button" onClick={() => { setUserError(""); setShowUserModal(true); }}>+ Add user</button>}<button className="secondary-button" onClick={loadStats}>Refresh data</button></div></div>
          <article className="training-management-card">
            <div className="card-title"><div><h2>Training profiles</h2><p>Administrators can edit a profile until its training date</p></div><span>{trainingOptions.length} profiles</span></div>
            {trainingOptions.length === 0 ? <div className="training-profile-empty">No training profiles yet.</div> : <div className="training-profile-list">{trainingOptions.map((training) => { const canEdit = training.trainingDate > new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" }); return <div className="training-profile" key={training.id}><div><strong>{training.title}</strong><small>{new Date(`${training.trainingDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</small></div><p><span>Trainer</span>{training.trainerName}<span>Facilitator</span>{training.facilitatorName}</p><button className="profile-edit-button" disabled={!canEdit} onClick={() => openEditTraining(training)}>{canEdit ? "Edit profile" : "Editing closed"}</button></div>})}</div>}
          </article>
          {staffRole === "admin" && <article className="training-management-card user-management-card">
            <div className="card-title"><div><h2>Staff users</h2><p>Administrators manage accounts and access roles</p></div><span>{staffUsers.length} users</span></div>
            {staffUsers.length === 0 ? <div className="training-profile-empty">No staff users found.</div> : <div className="staff-user-list">{staffUsers.map((user) => <div className="staff-user-row" key={user.id}><div className="staff-avatar">{user.displayName.charAt(0).toUpperCase()}</div><div><strong>{user.displayName}</strong><small>@{user.username}</small></div><span className={`role-badge ${user.role}`}>{user.role === "admin" ? "Administrator" : "Data encoder"}</span><em>{user.active ? "Active" : "Inactive"}</em></div>)}</div>}
          </article>}
          <div className="metric-grid">
            <article><span className="metric-icon blue">◎</span><p>Total responses</p><strong>{stats.total}</strong><small>{selectedTraining === "all" ? "Across all trainings" : "For selected training"}</small></article>
            <article><span className="metric-icon gold">★</span><p>Average rating</p><strong>{stats.averageRating || "—"}<em>/ 5</em></strong><small>Overall training quality</small></article>
            <article><span className="metric-icon green">↑</span><p>Would recommend</p><strong>{stats.recommendationRate}%</strong><small>Scores of 9 or 10</small></article>
            <article><span className="metric-icon violet">+</span><p>Positive experience</p><strong>{stats.positiveRate}%</strong><small>Ratings of 4 or 5</small></article>
          </div>
          <div className="dimension-grid">
            <article><div><span>Trainer knowledge</span><strong>{stats.averageTrainer || "—"}<small>/5</small></strong></div><div className="dimension-track"><i style={{ width: `${stats.averageTrainer * 20}%` }} /></div><p>Participants’ assessment of the trainer’s subject expertise</p></article>
            <article><div><span>Facilitator clarity</span><strong>{stats.averageClarity || "—"}<small>/5</small></strong></div><div className="dimension-track"><i style={{ width: `${stats.averageClarity * 20}%` }} /></div><p>How clearly the facilitator presented the material</p></article>
            <article><div><span>Content relevance</span><strong>{stats.averageRelevance || "—"}<small>/5</small></strong></div><div className="dimension-track"><i style={{ width: `${stats.averageRelevance * 20}%` }} /></div><p>How closely the content matched participants’ work</p></article>
            <article><div><span>Application confidence</span><strong>{stats.averageConfidence || "—"}<small>/5</small></strong></div><div className="dimension-track"><i style={{ width: `${stats.averageConfidence * 20}%` }} /></div><p>Confidence in applying the learning after training</p></article>
          </div>
          <article className="comparison-card">
            <div className="card-title"><div><h2>Compare trainings</h2><p>Performance of each completed training session</p></div><span>{stats.trainings.length} trainings</span></div>
            {stats.trainings.length === 0 ? <div className="empty-state compact"><span>✦</span><h3>No training comparisons yet</h3><p>Comparison statistics will appear after feedback is submitted.</p></div> : <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Training</th><th>Responses</th><th>Overall</th><th>Trainer</th><th>Clarity</th><th>Relevance</th><th>Confidence</th><th>Recommend</th></tr></thead><tbody>{stats.trainings.map((training) => <tr key={`${training.trainingTitle}-${training.trainingDate}`}><td><strong>{training.trainingTitle}</strong><small>{new Date(`${training.trainingDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</small></td><td>{training.total}</td><td><div className="table-score"><b>{training.averageRating}</b><span><i style={{ width: `${training.averageRating * 20}%` }} /></span></div></td><td>{training.averageTrainer}</td><td>{training.averageClarity}</td><td>{training.averageRelevance}</td><td>{training.averageConfidence}</td><td>{training.recommendationRate}%</td></tr>)}</tbody></table></div>}
          </article>
          <div className="insight-grid">
            <article className="response-card"><div className="card-title"><div><h2>Recent responses</h2><p>Latest participant comments</p></div><span>{stats.recent.length} shown</span></div>
              {stats.recent.length === 0 ? <div className="empty-state"><span>✦</span><h3>No feedback yet</h3><p>Responses will appear here as participants complete the form.</p><button className="primary-button" onClick={() => setView("feedback")}>Open feedback form</button></div> :
                <div className="response-list">{stats.recent.map((item) => <div className="response-item" key={item.id}><div className="response-top"><strong>{item.trainingTitle}</strong><span>{"★".repeat(item.overallRating)}{"☆".repeat(5-item.overallRating)}</span></div><p>{item.highlight || item.improvement || "No written comment provided."}</p><small>{new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · Recommendation {item.recommendScore}/10</small></div>)}</div>}
            </article>
            <aside className="action-card"><span className="eyebrow">At a glance</span><h2>Turn feedback into action</h2><div className="action-item"><span>1</span><div><strong>Review after every session</strong><p>Check comments while the experience is still fresh.</p></div></div><div className="action-item"><span>2</span><div><strong>Share themes with facilitators</strong><p>Celebrate strengths and agree on one improvement.</p></div></div><div className="action-item"><span>3</span><div><strong>Track progress over time</strong><p>Use consistent questions to compare trainings.</p></div></div></aside>
          </div>
        </section>
      )}
      <footer><span>Ministry of Agriculture · Training Pulse</span><p>{staffAuthorized ? `Signed in as ${staffDisplayName}` : "Building a stronger public service through better learning."}</p><button className="staff-link" onClick={staffAuthorized ? signOutStaff : () => setShowStaffLogin(true)}>{staffAuthorized ? "Staff sign out" : "Staff access"}</button></footer>
      {showStaffLogin && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowStaffLogin(false)}>
          <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowStaffLogin(false)} aria-label="Close staff sign in">×</button>
            <span className="eyebrow">Restricted area</span>
            <h2 id="staff-title">Staff access</h2>
            <p>Sign in with your administrator or data encoder account.</p>
            <form onSubmit={signInStaff}>
              <label>Username<input type="text" value={staffUsername} onChange={(event) => setStaffUsername(event.target.value)} autoComplete="username" autoFocus required /></label>
              <label className="password-field">Password<input type="password" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} autoComplete="current-password" required /></label>
              {loginError && <p className="error">{loginError}</p>}
              <button className="primary-button" type="submit">Open insights</button>
            </form>
          </section>
        </div>
      )}
      {showTrainingModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowTrainingModal(false)}>
          <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="training-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowTrainingModal(false)} aria-label="Close add training">×</button>
            <span className="eyebrow">Training catalogue</span>
            <h2 id="training-modal-title">{editingTraining ? "Edit training profile" : "Add a training"}</h2>
            <p>{editingTraining ? "Update the training details before its scheduled date." : "This title, date and assigned people will become available in the participant feedback form."}</p>
            <form onSubmit={addTraining}>
              <label>Training title<input type="text" value={newTrainingTitle} onChange={(event) => setNewTrainingTitle(event.target.value)} placeholder="e.g. Procurement Management Workshop" autoFocus required /></label>
              <label className="password-field">Training date<input type="date" value={newTrainingDate} onChange={(event) => setNewTrainingDate(event.target.value)} required /></label>
              <label className="password-field">Trainer name<input type="text" value={newTrainerName} onChange={(event) => setNewTrainerName(event.target.value)} placeholder="Full name" required /></label>
              <label className="password-field">Facilitator name<input type="text" value={newFacilitatorName} onChange={(event) => setNewFacilitatorName(event.target.value)} placeholder="Full name" required /></label>
              {trainingError && <p className="error">{trainingError}</p>}
              <button className="primary-button" type="submit">{editingTraining ? "Save changes" : "Add training"}</button>
            </form>
          </section>
        </div>
      )}
      {showUserModal && staffRole === "admin" && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowUserModal(false)}>
          <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowUserModal(false)} aria-label="Close add user">×</button>
            <span className="eyebrow">User management</span>
            <h2 id="user-modal-title">Add staff user</h2>
            <p>Create an administrator or data encoder account. Data encoders can manage training profiles but cannot add users.</p>
            <form onSubmit={addStaffUser}>
              <label>Full name<input type="text" value={newUserDisplayName} onChange={(event) => setNewUserDisplayName(event.target.value)} placeholder="e.g. Hana Bekele" autoFocus required /></label>
              <label className="password-field">Username<input type="text" value={newUserUsername} onChange={(event) => setNewUserUsername(event.target.value)} placeholder="e.g. hana.bekele" autoComplete="off" required /></label>
              <label className="password-field">Role<select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as StaffRole)}><option value="data_encoder">Data encoder</option><option value="admin">Administrator</option></select></label>
              <label className="password-field">Temporary password<input type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
              {userError && <p className="error">{userError}</p>}
              <button className="primary-button" type="submit">Create user</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
