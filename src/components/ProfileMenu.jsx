import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Mail, ShieldCheck, Clock3, LogOut, Users, X } from 'lucide-react';
export default function ProfileMenu({ user, onSignOut, onManageUsers }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const root = useRef(null),
    trigger = useRef(null);
  const role = user.role === 'super_admin' ? 'Super Admin' : 'Admin';
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div
      className="profile-menu"
      ref={root}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className={`profile-trigger ${open ? 'is-open' : ''}`}
        ref={trigger}
        aria-label="Open profile"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="profile-card"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="profile-icon">
          <span className="profile-emoji" aria-hidden="true">
            👤
          </span>
        </span>
        <span className="profile-trigger-name">
          {user.name.split(' ')[0]}
          <small>{role}</small>
        </span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <section id="profile-card" role="dialog" aria-label="My profile" className="profile-card">
          <div className="profile-card-heading">
            <span>MY PROFILE</span>
            <button
              className="icon-btn"
              aria-label="Close profile"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={15} />
            </button>
          </div>
          <div className="profile-identity">
            <span className="profile-large-icon">
              <span className="profile-emoji" aria-hidden="true">
                👤
              </span>
            </span>
            <div>
              <h3>{user.name}</h3>
              <span className={`user-role ${user.role}`}>{role}</span>
            </div>
          </div>
          <dl>
            <div>
              <dt>
                <Mail size={14} /> Email
              </dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>
                <ShieldCheck size={14} /> Access
              </dt>
              <dd>
                {user.role === 'super_admin'
                  ? 'All modules & user management'
                  : 'Reports, dialers, campaigns & vendors'}
              </dd>
            </div>
            <div>
              <dt>
                <Clock3 size={14} /> Report timezone
              </dt>
              <dd>US Eastern · New York</dd>
            </div>
          </dl>
          <div className="profile-card-actions">
            {onManageUsers && (
              <button
                className="secondary"
                onClick={() => {
                  setOpen(false);
                  onManageUsers();
                }}
              >
                <Users size={14} /> Manage users
              </button>
            )}
            <button
              className="profile-signout"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSignOut();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={14} />
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
