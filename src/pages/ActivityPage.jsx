import { formatTimestamp } from '../../shared/time.js';
import React, { useEffect, useState } from 'react';
import { Check, Clock3 } from 'lucide-react';
import { money, clockLabel } from '../utils/format.js';
export default function ActivityPage({ sheet }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Recent report activity</h3>
          <p>Latest 10 saves for {sheet.name}</p>
        </div>
        <Clock3 size={20} />
      </div>
      {sheet.activity.length ? (
        sheet.activity.map((a, i) => (
          <div className="activity-item" key={i}>
            <span className="activity-icon">
              <Check size={18} />
            </span>
            <div>
              <b>{a.action}</b>
              <p>
                {a.name} ·{' '}
                {a.detail.dialerName
                  ? a.detail.dialerName
                  : `Saved ${a.detail.count} interval entries`}
              </p>
              <details>
                <summary>View changes</summary>
                <div className="audit-changes">
                  {a.detail.previousName && (
                    <div>
                      {a.detail.previousName} → {a.detail.dialerName}
                    </div>
                  )}
                  {a.detail.changes?.map((c, j) => (
                    <div key={j}>
                      {sheet.config.dialers.find((d) => d.id === c.dialer_id)?.name ||
                        a.detail.dialerName ||
                        `Dialer ${c.dialer_id}`}{' '}
                      · {clockLabel(sheet.config.slots[c.slot].start)}:{' '}
                      {c.previous === null ? 'Blank' : money(c.previous)} →{' '}
                      {c.amount === null ? 'Blank' : money(c.amount)}
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <time>{formatTimestamp(a.created_at)}</time>
          </div>
        ))
      ) : (
        <div className="small-empty">No changes yet. Saved interval entries will appear here.</div>
      )}
    </section>
  );
}
