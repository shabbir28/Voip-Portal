import { DateTime } from 'luxon';
import {
  AUTO_VOIP_TIMEZONE,
  autoVoipShift,
  autoVoipShiftDate,
  INTERVAL_MS,
} from '../../../shared/autoVoip.js';

export { INTERVAL_MS };
export const AUTO_VOIP_REPORT_SOURCE = 'auto-voip-pakistan-shift-v1';

export function intervalCents(previous, current) {
  const nextDate = DateTime.fromISO(previous.billingDate, { zone: 'UTC' })
    .plus({ days: 1 })
    .toISODate();
  const change = current.totals[previous.billingDate] - previous.totals[previous.billingDate];
  if (!Number.isSafeInteger(change) || change < 0) return null;
  if (current.billingDate === previous.billingDate) return change;
  if (current.billingDate !== nextDate) return null;
  const newDay = current.totals[current.billingDate];
  return Number.isSafeInteger(newDay) && newDay >= 0 ? change + newDay : null;
}

export function autoReportConfig(date, dialer) {
  const { start, end } = autoVoipShift(date);
  const slots = [];
  for (let at = start; at < end; at = at.plus({ minutes: 30 })) {
    const next = at.plus({ minutes: 30 });
    slots.push({
      start: at.toFormat('HH:mm'),
      end: next.toFormat('HH:mm'),
      dayOffset: Number(at.toISODate() !== start.toISODate()),
      utcStart: at.toUTC().toISO(),
      utcEnd: next.toUTC().toISO(),
      zone: at.offsetNameShort,
    });
  }
  return {
    slots,
    dialers: [dialer],
    timezone: AUTO_VOIP_TIMEZONE,
    currency: 'USD',
  };
}

export async function recordConnectivoAttempt(db, config, periodEnd, error = null) {
  let message = error ? String(error.code || error.message || 'Billing sync failed') : null;
  for (const secret of [config.username, config.password])
    if (message && secret) message = message.replaceAll(secret, '[redacted]');
  await db.query(
    `INSERT INTO voip.connectivo_attempts(owner_id,period_end,error) VALUES($1,$2,$3)
     ON CONFLICT(owner_id) DO UPDATE SET period_end=EXCLUDED.period_end,
       attempted_at=now(),error=EXCLUDED.error`,
    [config.ownerId, new Date(periodEnd), message?.slice(0, 300) ?? null],
  );
}

export async function recordConnectivoSnapshot(db, config, periodEnd, snapshot) {
  const date = autoVoipShiftDate(periodEnd);
  const { start, end } = autoVoipShift(date);
  if (periodEnd > +end) return 'outside shift';

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query(
      `SELECT d.id,d.name,c.name AS campaign,c.color FROM voip.dialers d
       JOIN voip.campaigns c ON c.id=d.campaign_id
       JOIN voip.users u ON u.id=$1 AND u.deleted_at IS NULL
       WHERE d.name=$2 AND d.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [config.ownerId, config.dialerName],
    );
    if (!target.rowCount)
      throw new Error('Configured Go Connectivo report owner or dialer is missing');
    const dialer = target.rows[0];
    const source = JSON.stringify([
      AUTO_VOIP_REPORT_SOURCE,
      snapshot.account,
      config.billingName,
      config.ownerId,
      dialer.id,
    ]);
    const boundary = new Date(periodEnd);
    const saved = await client.query(
      `INSERT INTO voip.connectivo_snapshots(source,period_end,billing_date,totals,outcome)
       VALUES($1,$2,$3,$4,'baseline') ON CONFLICT DO NOTHING`,
      [source, boundary, snapshot.billingDate, JSON.stringify(snapshot.totals)],
    );
    if (!saved.rowCount) {
      await client.query('COMMIT');
      return 'already sampled';
    }
    const reportConfig = autoReportConfig(date, dialer);
    const {
      rows: [report],
    } = await client.query(
      `INSERT INTO voip.connectivo_reports(owner_id,dialer_id,source,name,report_date,config)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(owner_id,source,report_date) DO UPDATE SET updated_at=now()
       RETURNING id,config`,
      [
        config.ownerId,
        dialer.id,
        source,
        `Go Connectivo · ${config.billingName}`,
        date,
        JSON.stringify(reportConfig),
      ],
    );
    const {
      rows: [previous],
    } = await client.query(
      `SELECT to_char(billing_date,'YYYY-MM-DD') AS "billingDate",totals
       FROM voip.connectivo_snapshots WHERE source=$1 AND period_end=$2`,
      [source, new Date(periodEnd - INTERVAL_MS)],
    );
    let outcome = 'baseline';
    if (previous && periodEnd > +start) {
      const cents = intervalCents(previous, snapshot);
      const slot = report.config.slots.findIndex(
        (interval) =>
          Date.parse(interval.utcEnd) === periodEnd &&
          Date.parse(interval.utcStart) === periodEnd - INTERVAL_MS,
      );
      if (cents === null || cents > 999999999999) {
        outcome = 'billing counter changed unexpectedly';
      } else if (slot < 0) {
        outcome = 'reading is not at a half-hour boundary';
      } else {
        const inserted = await client.query(
          `INSERT INTO voip.connectivo_entries(report_id,dialer_id,slot,amount,period_end)
           VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [report.id, dialer.id, slot, (cents / 100).toFixed(2), boundary],
        );
        outcome = inserted.rowCount ? 'imported' : 'slot already filled';
      }
    }
    await client.query(
      'UPDATE voip.connectivo_snapshots SET outcome=$3 WHERE source=$1 AND period_end=$2',
      [source, boundary, outcome],
    );
    await client.query('COMMIT');
    return outcome;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
