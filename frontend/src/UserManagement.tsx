import { useEffect, useState, type FormEvent } from 'react';

type UserRole = 'admin' | 'survey_admin' | 'viewer';
interface ManagedUser { id: number; username: string; email?: string | null; mustChangePassword?: boolean; displayName: string; role: UserRole; active: boolean; createdAt: string; resetRequestedAt?: string | null }
const roles: { value: UserRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrator', description: 'Full access, including users and results' },
  { value: 'survey_admin', label: 'Survey administrator', description: 'Surveys, settings and questions' },
  { value: 'viewer', label: 'Results viewer', description: 'Results and CSV export only' },
];

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body as T;
}

export default function UserManagement({ currentUsername, onSelfChange }: { currentUsername: string; onSelfChange: () => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mailStatus, setMailStatus] = useState<{ configured: boolean; source?: string; message?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('survey_admin');
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function load() {
    try {
      const payload = await request<{ users: ManagedUser[] }>('/api/admin/users');
      setUsers(payload.users);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load users.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    request<{ configured: boolean; source?: string; message?: string }>('/api/admin/invitation-status')
      .then(setMailStatus)
      .catch(() => setMailStatus({ configured: false, message: 'Unable to check invitation email settings. Ask the server administrator to check the API.' }));
  }, []);

  function openCreate() {
    setCreating(true); setEditing(null); setResetting(null); setEmail(''); setDisplayName('');
    setRole('survey_admin'); setActive(true); setPassword(''); setConfirmPassword(''); setError(''); setMessage('');
  }
  function openEdit(user: ManagedUser) {
    setEditing(user); setCreating(false); setResetting(null); setDisplayName(user.displayName);
    setRole(user.role); setActive(user.active); setError(''); setMessage('');
  }
  function openReset(user: ManagedUser) {
    setResetting(user); setCreating(false); setEditing(null); setPassword(''); setConfirmPassword(''); setError(''); setMessage('');
  }
  function closeDialog(force = false) { if (!busy || force) { setCreating(false); setEditing(null); setResetting(null); setPassword(''); setConfirmPassword(''); } }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (resetting && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (resetting && password.length < 8) { setError('Use at least 8 characters for the password.'); return; }
    setBusy(true);
    try {
      if (creating) {
        const payload = await request<{ user: ManagedUser }>('/api/admin/users', { method: 'POST', body: JSON.stringify({ email, displayName, role }) });
        setUsers(previous => [payload.user, ...previous]);
        setMessage(`Invitation sent to ${payload.user.email}. The user must set a password before signing in.`);
      } else if (editing) {
        const payload = await request<{ user: ManagedUser }>(`/api/admin/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ displayName, role, active }) });
        setUsers(previous => previous.map(user => user.id === editing.id ? { ...user, ...payload.user } : user));
        if (editing.username.toLowerCase() === currentUsername.toLowerCase()) { onSelfChange(); return; }
        setMessage(`${payload.user.username} was updated. Existing sign-ins for this user were ended.`);
      } else if (resetting) {
        await request(`/api/admin/users/${resetting.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) });
        if (resetting.username.toLowerCase() === currentUsername.toLowerCase()) { onSelfChange(); return; }
        setUsers(previous => previous.map(user => user.id === resetting.id ? { ...user, resetRequestedAt: null } : user));
        setMessage(`Password reset for ${resetting.username}. Existing sign-ins for this user were ended.`);
      }
      closeDialog(true);
    } catch (cause) { if (creating) await load(); setError(cause instanceof Error ? cause.message : 'Unable to save this user.'); }
    finally { setBusy(false); }
  }

  async function resendInvitation(user: ManagedUser) {
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`/api/admin/users/${user.id}/resend-invitation`, { method: 'POST' });
      setMessage(`A new invitation was sent to ${user.email}. The previous link is no longer valid.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to resend the invitation.'); }
    finally { setBusy(false); }
  }

  const dialogOpen = creating || editing !== null || resetting !== null;
  return <section className="admin-panel user-management">
    <div className="user-management-heading"><div><p className="eyebrow">Account access</p><h2>User management</h2><p>Invite users by email, choose their access role, and manage passwords.</p></div><button className="primary-button" type="button" onClick={openCreate} disabled={mailStatus?.configured === false}>Invite user</button></div>
    {mailStatus?.configured && mailStatus.source === 'ftms' && <p className="user-mail-source">Invitations use the FTMS email service.</p>}
    {mailStatus?.configured === false && <div className="error-banner" role="alert">{mailStatus.message} No account was created. Configure email delivery in the backend .env file, restart the API, then refresh this page.</div>}
    {users.some(user => user.resetRequestedAt) && <p className="user-reset-notice" role="status">{users.filter(user => user.resetRequestedAt).length} password reset {users.filter(user => user.resetRequestedAt).length === 1 ? 'request needs' : 'requests need'} attention. Verify each person’s identity before setting and sharing a new password.</p>}
    <div className="user-role-guide">{roles.map(item => <div key={item.value}><strong>{item.label}</strong><span>{item.description}</span></div>)}</div>
    {message && <p className="question-success" role="status">{message}</p>}
    {!dialogOpen && error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="empty-state">Loading users…</p> : <div className="user-list">{users.map(user => <article key={user.id} className={!user.active ? 'inactive' : ''}>
      <div className="user-list-identity"><strong>{user.displayName}</strong><span>{user.email || `@${user.username}`}</span></div>
      <div className="user-list-status"><span className="user-role-badge">{roles.find(item => item.value === user.role)?.label || user.role}</span><span className={user.active ? 'user-active' : 'user-inactive'}>{user.active ? 'Active' : 'Inactive'}</span>{user.mustChangePassword && <span className="user-reset-badge">Awaiting activation</span>}{user.resetRequestedAt && <span className="user-reset-badge">Reset requested</span>}</div>
      <div className="user-list-actions"><button className="secondary-button" type="button" onClick={() => openEdit(user)}>Edit access</button>{user.mustChangePassword ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void resendInvitation(user)}>Resend invitation</button> : <button className="secondary-button" type="button" onClick={() => openReset(user)}>Reset password</button>}</div>
    </article>)}{users.length === 0 && <p className="empty-state">No users yet.</p>}</div>}
    {dialogOpen && <div className="question-editor-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeDialog(); }}><div className="user-dialog" role="dialog" aria-modal="true" aria-labelledby="user-dialog-title">
      <form onSubmit={save}>
        <div className="user-dialog-header"><div><p className="eyebrow">Account access</p><h3 id="user-dialog-title">{creating ? 'Invite a user' : editing ? `Edit ${editing.email || editing.username}` : `Reset password for ${resetting?.email || resetting?.username}`}</h3><p>{creating ? 'An invitation link will be emailed to this person. They must set a password before signing in.' : resetting ? 'Verify the person’s identity, then choose a new password. The current password cannot be viewed.' : 'Set the account details and access role.'}</p></div><button className="question-editor-close" type="button" aria-label="Close" disabled={busy} onClick={() => closeDialog()}>×</button></div>
        {!resetting && <div className="user-form-grid">{creating && <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} required /></label>}{editing?.email && <p className="user-password-help">Email: {editing.email}</p>}<label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={120} required /></label><label>Role<select value={role} onChange={event => setRole(event.target.value as UserRole)}>{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{editing && <label className="user-active-checkbox"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Active account</label>}</div>}
        {resetting && <div className="user-form-grid"><label>New password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={256} required /></label><label>Confirm password<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={256} required /></label><p className="user-password-help">At least 8 characters. Give the password to the user through a secure channel.</p></div>}
        {editing?.username.toLowerCase() === currentUsername.toLowerCase() && <p className="user-password-help">Changing your own account details will sign you out.</p>}
        {resetting?.username.toLowerCase() === currentUsername.toLowerCase() && <p className="user-password-help">Resetting your own password will sign you out.</p>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="user-dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => closeDialog()}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : resetting ? 'Reset password' : creating ? 'Send invitation' : 'Save access'}</button></div>
      </form>
    </div></div>}
  </section>;
}
