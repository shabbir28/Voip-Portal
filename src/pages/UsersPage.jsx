import React, { useEffect, useState } from 'react';
import {
  Plus,
  Users,
  ShieldCheck,
  Pencil,
  Trash2,
  RotateCcw,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api, send } from '../services/api.js';
import Modal from '../components/Modal.jsx';
import { formatTimestamp } from '../../shared/time.js';
export default function UsersPage({ currentUser, onUserUpdated }) {
  const [users, setUsers] = useState([]),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [showDeleted, setShowDeleted] = useState(false),
    [passwordVisible, setPasswordVisible] = useState(false),
    [error, setError] = useState(''),
    [formError, setFormError] = useState(''),
    [notice, setNotice] = useState('');
  async function load(includeDeleted = showDeleted) {
    setLoading(true);
    try {
      setUsers(await api(`/users?includeDeleted=${includeDeleted}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(showDeleted);
  }, [showDeleted]);
  function open(mode, user) {
    setPasswordVisible(false);
    setFormError('');
    setModal({ mode, user });
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const editing = modal.mode === 'edit',
        deleting = modal.mode === 'delete';
      let result;
      if (deleting)
        result = await send(`/users/${modal.user.id}`, { version: modal.user.version }, 'DELETE');
      else {
        const data = Object.fromEntries(new FormData(e.currentTarget));
        if (editing) {
          data.version = modal.user.version;
          if (!data.password) delete data.password;
        }
        result = await send(
          editing ? `/users/${modal.user.id}` : '/users',
          data,
          editing ? 'PATCH' : 'POST',
        );
      }
      setModal(null);
      setNotice(
        deleting
          ? 'User deleted. Sign-in access has been removed; their report history is preserved.'
          : editing
            ? 'User updated successfully.'
            : 'User created successfully.',
      );
      await load();
      onUserUpdated?.(result);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function restore(user) {
    setBusy(true);
    setError('');
    try {
      await send(`/users/${user.id}/restore`, { version: user.version });
      setNotice('User restored. They can sign in again.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const target = modal?.user,
    editing = modal?.mode === 'edit',
    deleting = modal?.mode === 'delete';
  return (
    <>
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="notice success">
          {notice}
        </div>
      )}
      <div className="vendor-toolbar">
        <span className="users-access">
          <ShieldCheck size={16} /> Super Admin access
        </span>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => setShowDeleted((v) => !v)}
        >
          {showDeleted ? 'Hide deleted' : 'Show deleted'}
        </button>
        <button className="secondary" disabled={busy || loading} onClick={() => load()}>
          <RefreshCw size={14} /> Reload users
        </button>
        <button className="primary" disabled={busy} onClick={() => open('create')}>
          <Plus size={15} /> Create user
        </button>
      </div>
      <div className="users-permissions">
        <div>
          <b>Super Admin</b>
          <p>All modules, user management and activity logs.</p>
        </div>
        <div>
          <b>Admin</b>
          <p>Overview, reports, dialers, campaigns and vendors.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Workspace users</h3>
            <p>
              {users.filter((u) => !u.deleted_at).length} active accounts · Manage access and
              sign-in details
            </p>
          </div>
          <Users size={20} />
        </div>
        <div className="table-scroll">
          <table className="vendor-directory users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created · US Eastern</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === currentUser.id && <small className="user-you">You</small>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`user-role ${u.role}`}>
                      {u.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td>
                    <span className={`vendor-status ${u.deleted_at ? 'archived' : ''}`}>
                      {u.deleted_at ? 'Deleted' : 'Active'}
                    </span>
                  </td>
                  <td>{formatTimestamp(u.created_at)}</td>
                  <td>
                    <div className="user-actions">
                      {u.deleted_at ? (
                        <button
                          className="secondary"
                          disabled={busy}
                          aria-label={`Restore ${u.name}`}
                          onClick={() => restore(u)}
                        >
                          <RotateCcw size={13} /> Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className="secondary"
                            disabled={busy}
                            aria-label={`Edit ${u.name}`}
                            onClick={() => open('edit', u)}
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            className="danger-outline"
                            disabled={busy || u.id === currentUser.id}
                            aria-label={`Delete ${u.name}`}
                            title={
                              u.id === currentUser.id
                                ? 'You cannot delete your own account'
                                : 'Delete user'
                            }
                            onClick={() => open('delete', u)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="vendor-message">Loading users…</p>}
      </section>
      {modal && (
        <Modal
          title={deleting ? 'Delete user' : editing ? 'Edit user' : 'Create user'}
          subtitle={
            deleting
              ? 'Remove sign-in access while preserving report history.'
              : editing
                ? 'Update account details and permissions.'
                : 'Choose their access level and sign-in credentials.'
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <form onSubmit={submit}>
            {formError && (
              <div className="notice error" role="alert">
                {formError}
              </div>
            )}
            {deleting ? (
              <div className="delete-explanation">
                <b>Delete {target.name}?</b>
                <p>
                  Their active sessions will end and they will no longer be able to sign in. Reports
                  and activity history stay intact. You can restore this account from Show deleted.
                </p>
              </div>
            ) : (
              <>
                <label>
                  Full name
                  <input
                    name="name"
                    defaultValue={target?.name || ''}
                    required
                    maxLength={100}
                    autoComplete="off"
                    disabled={busy}
                  />
                </label>
                <label>
                  Login email
                  <input
                    name="email"
                    type="email"
                    defaultValue={target?.email || ''}
                    required
                    maxLength={254}
                    autoComplete="off"
                    disabled={busy}
                  />
                </label>
                <div className="user-password-field">
                  <label htmlFor="user-password">
                    {editing ? 'New password (optional)' : 'Password'}
                  </label>
                  <div className="user-password-control">
                    <input
                      id="user-password"
                      name="password"
                      type={passwordVisible ? 'text' : 'password'}
                      required={!editing}
                      minLength={10}
                      maxLength={128}
                      autoComplete="new-password"
                      placeholder={
                        editing ? 'Leave blank to keep current password' : 'At least 10 characters'
                      }
                      disabled={busy}
                    />
                    <button
                      type="button"
                      aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                      aria-pressed={passwordVisible}
                      aria-controls="user-password"
                      disabled={busy}
                      onClick={() => setPasswordVisible((v) => !v)}
                    >
                      {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {editing && (
                    <small>
                      Changing the email, password or role signs this user out of existing sessions.
                    </small>
                  )}
                </div>
                <label>
                  Role
                  <select name="role" defaultValue={target?.role || 'admin'} disabled={busy}>
                    <option value="admin" disabled={target?.id === currentUser.id}>
                      Admin — operations modules
                    </option>
                    <option value="super_admin">Super Admin — all modules</option>
                  </select>
                  {target?.id === currentUser.id && (
                    <small>Your own Super Admin access must remain enabled.</small>
                  )}
                </label>
              </>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className={deleting ? 'danger' : 'primary'} disabled={busy}>
                {busy
                  ? 'Saving…'
                  : deleting
                    ? 'Confirm delete'
                    : editing
                      ? 'Save changes'
                      : 'Create user'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
