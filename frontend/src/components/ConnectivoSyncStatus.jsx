import React from 'react';
import { money, prettyDate } from '../utils/format.js';
import {
  AUTO_VOIP_TIMEZONE,
  autoVoipShift,
  autoVoipShiftDate,
  INTERVAL_MS,
  MAX_SAMPLE_DELAY_MS,
} from '../../../shared/autoVoip.js';

const timeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: AUTO_VOIP_TIMEZONE,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function syncTime(value) {
  const date = value && new Date(value);
  return date && Number.isFinite(+date) ? `${timeFormat.format(date)} PKT` : '—';
}

const outcomes = {
  baseline: 'Waiting for two consecutive readings to calculate spend',
  imported: 'Latest half-hour saved',
  'already sampled': 'Reading already saved',
  'slot already filled': 'Previous amount kept for this half-hour',
  'reading is not at a half-hour boundary': 'Waiting for two consecutive scheduled readings',
  'billing counter changed unexpectedly':
    'Billed total changed unexpectedly. This interval is blank.',
};

function syncState(status) {
  if (!status.configured)
    return {
      label: 'Setup needed',
      detail: 'Add the Go Connectivo login and report owner on the server',
    };
  if (!status.enabled) return { label: 'Sync paused', detail: 'Saved reports are available below' };
  const now = Date.now();
  const { start, end } = autoVoipShift(autoVoipShiftDate(now));
  if (now > +end + MAX_SAMPLE_DELAY_MS)
    return {
      label: 'Outside shift',
      detail: `Sync resumes at ${start.toFormat('h:mm a')} PKT`,
    };
  if (status.lastAttempt?.error && Date.parse(status.lastAttempt.at) >= +start)
    return { label: 'Sync failed', detail: status.lastAttempt.error, tone: 'warning' };

  const latest = status.latestSample;
  const lastReading = latest ? Date.parse(latest.periodEnd) : 0;
  if (lastReading < +start && now <= +start + MAX_SAMPLE_DELAY_MS)
    return {
      label: 'Awaiting first reading',
      detail: 'Checks run every 30 minutes during the shift',
    };
  if (lastReading < +start || now - lastReading > INTERVAL_MS + MAX_SAMPLE_DELAY_MS)
    return {
      label: 'Reading overdue',
      detail: 'Missed intervals appear blank in the report',
      tone: 'warning',
    };
  if (latest.outcome === 'billing counter changed unexpectedly')
    return { label: 'Billing changed', detail: outcomes[latest.outcome], tone: 'warning' };
  return {
    label: 'Sync active',
    detail: outcomes[latest.outcome] || 'Reading saved',
    tone: 'active',
  };
}

export default function ConnectivoSyncStatus({ status }) {
  if (!status || status.available === false) return null;

  const { latestSample, lastAttempt, nextCheckAt } = status;
  const { label, detail, tone } = syncState(status);

  return (
    <section className="auto-voip-sync" aria-label="Go Connectivo billing and sync status">
      <div className="auto-voip-source">
        <p className="auto-voip-source-name">
          Go Connectivo{status.billingName && <span>{status.billingName}</span>}
        </p>
        <p className="auto-voip-balance">
          {latestSample?.billedTotal == null ? '—' : money(latestSample.billedTotal)}
        </p>
        <p className="auto-voip-meta">
          Vendor billed total
          {latestSample?.billingDate && ` · ${prettyDate(latestSample.billingDate)}`}
        </p>
      </div>
      <div className="auto-voip-sync-detail">
        <div className="auto-voip-sync-message" role="status">
          <div className="auto-voip-state" data-tone={tone}>
            <span aria-hidden="true" />
            {label}
          </div>
          <p>{detail}</p>
        </div>
        <dl className="auto-voip-sync-times">
          <div>
            <dt>Last reading</dt>
            <dd>{syncTime(latestSample?.periodEnd)}</dd>
          </div>
          <div>
            <dt>Last check</dt>
            <dd>{syncTime(lastAttempt?.at)}</dd>
          </div>
          <div>
            <dt>Next check</dt>
            <dd>{syncTime(nextCheckAt)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
