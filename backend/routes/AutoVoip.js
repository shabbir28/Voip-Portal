import { DateTime } from 'luxon';
import { z } from 'zod';
import { connectivoConfig, connectivoEnvironment } from '../integrations/connectivo/config.js';
import { AUTO_VOIP_REPORT_SOURCE } from '../integrations/connectivo/sync.js';
import { date, id } from '../validation/schemas.js';
import { todayInZone } from '../../shared/time.js';
import { summarize } from '../../shared/reporting.js';
import {
  AUTO_VOIP_TIMEZONE,
  INTERVAL_MS,
  nextAutoVoipBoundary,
  SAMPLE_DELAY_MS,
} from '../../shared/autoVoip.js';

function settings(userId) {
  const env = connectivoEnvironment();
  if (Number(env.CONNECTIVO_REPORT_OWNER_ID) !== userId) return { available: false };
  try {
    return {
      available: true,
      config: connectivoConfig(env),
      enabled: env.CONNECTIVO_SYNC_ENABLED === 'true',
    };
  } catch {
    return { available: true, enabled: false };
  }
}

export function registerAutoVoip(app, db) {
  app.get('/api/auto-voip/status', async (req, res) => {
    const { available, config, enabled } = settings(req.user.id);
    if (!available) return res.json({ available: false, configured: false, enabled: false });
    if (!config) return res.json({ available: true, configured: false, enabled: false });
    const latest = (
      await db.query(
        `SELECT s.period_end AS "periodEnd",to_char(s.billing_date,'YYYY-MM-DD') AS "billingDate",
       s.totals,s.outcome FROM voip.connectivo_snapshots s
       WHERE EXISTS(SELECT 1 FROM voip.connectivo_reports r WHERE r.source=s.source AND r.owner_id=$1
       AND r.dialer_id=(SELECT id FROM voip.dialers WHERE name=$2))
       AND s.source::jsonb->>2=$3
       ORDER BY s.period_end DESC LIMIT 1`,
        [req.user.id, config.dialerName, config.billingName],
      )
    ).rows[0];
    const lastAttempt =
      (
        await db.query(
          'SELECT attempted_at AS at,error FROM voip.connectivo_attempts WHERE owner_id=$1',
          [req.user.id],
        )
      ).rows[0] ?? null;
    const now = Date.now();
    const current = Math.floor(now / INTERVAL_MS) * INTERVAL_MS;
    const nextBoundary = nextAutoVoipBoundary(
      now < current + SAMPLE_DELAY_MS ? current : current + INTERVAL_MS,
    );
    const nextCheckAt = new Date(nextBoundary + SAMPLE_DELAY_MS);
    res.json({
      available: true,
      configured: true,
      enabled,
      billingName: config.billingName,
      dialerName: config.dialerName,
      intervalMinutes: 30,
      timezone: AUTO_VOIP_TIMEZONE,
      latestSample: latest
        ? {
            periodEnd: latest.periodEnd,
            billingDate: latest.billingDate,
            billedTotal: latest.totals[latest.billingDate] / 100,
            outcome: latest.outcome,
          }
        : null,
      lastAttempt,
      nextCheckAt: enabled ? nextCheckAt : null,
    });
  });

  app.get('/api/auto-voip/reports', async (req, res) => {
    if (!settings(req.user.id).available)
      return res.status(403).json({ error: 'Auto VoIP is not configured for this account.' });
    const today = todayInZone();
    const range = z.object({ from: date, to: date }).parse({
      from: req.query.from || today,
      to: req.query.to || today,
    });
    const days = DateTime.fromISO(range.to).diff(DateTime.fromISO(range.from), 'days').days;
    if (days < 0 || days > 365)
      return res.status(400).json({ error: 'Choose a date range up to 366 days.' });
    res.json(
      (
        await db.query(
          `SELECT r.id,r.name,to_char(r.report_date,'YYYY-MM-DD') AS report_date,r.updated_at,
       COALESCE(SUM(e.amount),0) AS total FROM voip.connectivo_reports r
       LEFT JOIN voip.connectivo_entries e ON e.report_id=r.id
       WHERE r.owner_id=$1 AND r.report_date BETWEEN $2::date AND $3::date
       AND r.source::jsonb->>0=$4
       GROUP BY r.id ORDER BY r.report_date DESC,r.id DESC`,
          [req.user.id, range.from, range.to, AUTO_VOIP_REPORT_SOURCE],
        )
      ).rows,
    );
  });

  app.get('/api/auto-voip/reports/:id', async (req, res) => {
    if (!settings(req.user.id).available)
      return res.status(404).json({ error: 'Automatic report not found.' });
    const reportId = id.parse(req.params.id);
    const report = (
      await db.query(
        `SELECT id,name,to_char(report_date,'YYYY-MM-DD') AS report_date,config,updated_at
       FROM voip.connectivo_reports WHERE id=$1 AND owner_id=$2 AND source::jsonb->>0=$3`,
        [reportId, req.user.id, AUTO_VOIP_REPORT_SOURCE],
      )
    ).rows[0];
    if (!report) return res.status(404).json({ error: 'Automatic report not found.' });
    const entries = (
      await db.query(
        'SELECT dialer_id,slot,amount,period_end FROM voip.connectivo_entries WHERE report_id=$1 ORDER BY slot',
        [reportId],
      )
    ).rows;
    const { slots } = report.config;
    const { rows: readings } = await db.query(
      `SELECT s.period_end AS "periodEnd",
              (s.totals->>s.billing_date::text)::numeric / 100 AS "billedTotal"
       FROM voip.connectivo_snapshots s
       JOIN voip.connectivo_reports r ON r.source=s.source
       WHERE r.id=$1 AND r.owner_id=$2 AND s.period_end BETWEEN $3 AND $4
         AND MOD(EXTRACT(EPOCH FROM s.period_end),1800)=0
       ORDER BY s.period_end`,
      [reportId, req.user.id, slots[0].utcStart, slots.at(-1).utcEnd],
    );
    res.json({ ...report, entries, readings, summary: summarize(report.config, entries) });
  });
}
