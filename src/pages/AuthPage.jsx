import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight, AudioLines, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import Brand from '../components/Brand.jsx';
import PoweredBy from '../components/PoweredBy.jsx';
import { send } from '../services/api.js';
export default function Auth({ setup, onLogin }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [visible, setVisible] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(
        (await send(setup ? '/setup' : '/login', Object.fromEntries(new FormData(e.currentTarget))))
          .user,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <section className="login-story">
        <Brand light />
        <div className="login-editorial">
          <div className="login-kicker">
            <i /> CONNECTED OPERATIONS
          </div>
          <h1>
            Your voice operations.
            <br />
            <em>Beautifully in sync.</em>
          </h1>
          <p>
            Every campaign, dialer and vendor.
            <br />
            One workspace to see the whole picture.
          </p>
          <div className="login-signal" aria-hidden="true">
            <div>
              <AudioLines size={20} />
              <span>A clearer view. Every day.</span>
              <ArrowUpRight size={18} />
            </div>
            <div className="login-wave">
              {[18, 30, 46, 25, 52, 72, 45, 88, 62, 98, 70, 46, 78, 56, 36, 58, 28, 16].map(
                (h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ),
              )}
            </div>
            <footer>
              <span>CAPTURE</span>
              <span>TRACK</span>
              <span>UNDERSTAND</span>
            </footer>
          </div>
        </div>
        <div className="login-story-footer">
          <span>Built for your daily rhythm.</span>
          <span>US Eastern · EST / EDT</span>
        </div>
      </section>
      <section className="login-main">
        <div className="login-mobile-brand">
          <Brand />
        </div>
        <div className="login-form-card">
          <span className="login-welcome">WELCOME TO VOIP PORTAL</span>
          <h2>{setup ? 'Create your workspace.' : 'Welcome back.'}</h2>
          <p>
            {setup
              ? 'Set up your Super Admin account to get started.'
              : 'Sign in and pick up where you left off.'}
          </p>
          <form onSubmit={submit}>
            {setup && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Your full name"
                  disabled={busy}
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                placeholder="name@company.com"
                disabled={busy}
              />
            </label>
            <label>
              Password
              <div className="login-password">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  required
                  minLength={setup ? 10 : 1}
                  maxLength={128}
                  autoComplete={setup ? 'new-password' : 'current-password'}
                  placeholder={setup ? 'At least 10 characters' : 'Enter your password'}
                  disabled={busy}
                />
                <button
                  type="button"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {error && (
              <div role="alert" className="login-error">
                {error}
              </div>
            )}
            <button className="login-submit" disabled={busy}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  {setup ? 'Create workspace' : 'Sign in to workspace'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <div className="login-access-note">
            {setup
              ? 'Your workspace starts here.'
              : 'Need access? Contact your workspace administrator.'}
          </div>
        </div>
        <footer className="login-footer">
          <PoweredBy />
        </footer>
      </section>
    </div>
  );
}
