import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { formatTimestamp } from '../../shared/time.js';
export default function WorkspaceActivityPage({ range }) {
  const [events, setEvents] = useState([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    api(`/activity?from=${range.from}&to=${range.to}`)
      .then((r) => {
        if (live) setEvents(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [range.from, range.to]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Workspace activity</h3>
          <p>Latest 200 events in selected dates · US Eastern · Super Admin only</p>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p className="vendor-message">Loading activity…</p>
      ) : events.length ? (
        events.map((a) => (
          <div className="workspace-event" key={a.id}>
            <div>
              <b>{a.action}</b>
              <p>
                {a.module}
                {a.report ? ` · ${a.report}` : ''} · {a.actor}
              </p>
              <small>
                {a.detail.name || a.detail.dialerName || ''}
                {a.detail.count ? ` · ${a.detail.count} entries` : ''}
              </small>
            </div>
            <time>{formatTimestamp(a.created_at)}</time>
          </div>
        ))
      ) : (
        <p className="vendor-message">No activity in these dates.</p>
      )}
    </section>
  );
}
