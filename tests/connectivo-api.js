import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/app.js';
import {
  recordConnectivoAttempt,
  recordConnectivoSnapshot,
} from '../backend/integrations/connectivo/sync.js';

export async function verifyConnectivoApi(t, db) {
  const ownerId = (await db.query("SELECT id FROM voip.users WHERE email='test@example.com'"))
    .rows[0].id;
  const dialer = (await db.query("SELECT id,name FROM voip.dialers WHERE name='MED_MAIN_BTrev1'"))
    .rows[0];
  const config = { ownerId, billingName: 'BT-rev1', dialerName: dialer.name };
  const environment = {
    CONNECTIVO_REPORT_OWNER_ID: String(ownerId),
    CONNECTIVO_USERNAME: 'auto-voip-fixture-user',
    CONNECTIVO_PASSWORD: 'auto-voip-fixture-password',
    CONNECTIVO_SYNC_ENABLED: 'true',
    CONNECTIVO_BILLING_NAME: config.billingName,
    CONNECTIVO_REPORT_DIALER: config.dialerName,
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);
  try {
    const app = createApp(db);
    const owner = request.agent(app);
    const other = request.agent(app);
    const login = (agent, email, password) =>
      agent.post('/api/login').set('X-Voip-Request', '1').send({ email, password });
    assert.equal((await login(owner, 'test@example.com', 'Testing-only-4829')).status, 200);
    assert.equal((await login(other, 'isolated@example.test', 'Isolation-test-4829')).status, 200);
    const sample = (time, billingDate, totals, utcDate = '2026-11-24') =>
      recordConnectivoSnapshot(db, config, Date.parse(`${utcDate}T${time}:00Z`), {
        billingDate,
        totals,
        account: 'private-fixture-account',
      });
    const manualState = async () => {
      const result = {};
      for (const table of ['sheets', 'entries', 'audit']) {
        result[table] = (
          await db.query(
            `SELECT row_to_json(t) AS row FROM voip.${table} t ORDER BY row_to_json(t)::text`,
          )
        ).rows;
      }
      return result;
    };
    let firstReportId;

    await t.test(
      'Auto VoIP reports begin with an explicit baseline and expose no secrets',
      async () => {
        const before = await manualState();
        const status = await owner.get('/api/auto-voip/status');
        assert.equal(status.status, 200);
        assert.equal(status.body.enabled, true);
        assert.equal(status.body.configured, true);
        assert.equal(status.body.intervalMinutes, 30);
        assert.equal(status.body.latestSample, null);
        assert.equal(
          await sample('18:30', '2026-11-23', { '2026-11-23': 11600 }, '2026-11-23'),
          'baseline',
        );
        assert.equal(
          Number((await db.query('SELECT count(*) FROM voip.connectivo_entries')).rows[0].count),
          0,
        );
        assert.deepEqual(await manualState(), before);
        const after = (await owner.get('/api/auto-voip/status')).body;
        assert.equal(after.latestSample.outcome, 'baseline');
        assert.equal(Number(after.latestSample.billedTotal), 116);
        assert.ok(!JSON.stringify(after).includes('private-fixture-account'));
        for (const secret of [environment.CONNECTIVO_USERNAME, environment.CONNECTIVO_PASSWORD]) {
          assert.ok(!JSON.stringify(after).includes(secret));
        }
      },
    );

    await t.test(
      'Auto VoIP saves cents deltas, zeroes and midnight totals without changing manual reports',
      async () => {
        const before = await manualState();
        const yesterday = '2026-11-23';
        const today = '2026-11-24';
        const evening = (time, billDate, totals) => sample(time, billDate, totals, yesterday);
        assert.equal(await evening('19:00', yesterday, { [yesterday]: 13000 }), 'imported');
        assert.equal(await evening('19:00', yesterday, { [yesterday]: 13000 }), 'already sampled');
        assert.equal(await evening('19:30', yesterday, { [yesterday]: 13178 }), 'imported');
        assert.equal(
          await evening('20:00', today, { [yesterday]: 13221, [today]: 11 }),
          'imported',
        );
        assert.equal(await evening('20:30', today, { [today]: 19 }), 'imported');
        assert.equal(await evening('21:30', today, { [today]: 31 }), 'baseline');
        assert.equal(await evening('22:00', today, { [today]: 31 }), 'imported');
        assert.equal(
          await evening('22:30', today, { [today]: 20 }),
          'billing counter changed unexpectedly',
        );
        assert.equal(await sample('01:30', today, { [today]: 50 }), 'baseline');
        assert.equal(await sample('02:00', today, { [today]: 80 }), 'imported');
        assert.equal(await sample('02:30', today, { [today]: 90 }), 'outside shift');
        assert.equal(await sample('11:30', today, { [today]: 1000 }), 'outside shift');
        assert.equal(await sample('12:00', today, { [today]: 1100 }), 'baseline');
        assert.equal(await sample('12:30', today, { [today]: 1180 }), 'imported');
        assert.deepEqual(await manualState(), before);

        const list = await owner.get('/api/auto-voip/reports?from=2026-11-23&to=2026-11-24');
        assert.equal(list.status, 200);
        assert.deepEqual(list.body.map((report) => report.report_date).sort(), [
          '2026-11-23',
          '2026-11-24',
        ]);
        const previousDay = list.body.find((report) => report.report_date === yesterday);
        const nextDay = list.body.find((report) => report.report_date === today);
        assert.equal(Number(previousDay.total), 16.7);
        assert.equal(Number(nextDay.total), 0.8);
        firstReportId = previousDay.id;
        const previousReport = await owner.get(`/api/auto-voip/reports/${previousDay.id}`);
        const nextReport = await owner.get(`/api/auto-voip/reports/${nextDay.id}`);
        assert.equal(previousReport.status, 200);
        assert.equal(nextReport.status, 200);
        assert.equal(previousReport.body.config.timezone, 'Asia/Karachi');
        assert.equal(previousReport.body.config.slots.length, 28);
        assert.deepEqual(
          previousReport.body.readings
            .slice(0, 2)
            .map(({ periodEnd, billedTotal }) => [periodEnd, Number(billedTotal)]),
          [
            ['2026-11-23T18:30:00.000Z', 116],
            ['2026-11-23T19:00:00.000Z', 130],
          ],
        );
        assert.equal(previousReport.body.summary.intervals[13].start, '23:30');
        assert.equal(previousReport.body.summary.intervals[13].cumulative, 14);
        assert.equal(previousReport.body.config.dialers[0].id, dialer.id);
        assert.deepEqual(
          previousReport.body.entries
            .map(({ slot, amount }) => [slot, Number(amount)])
            .sort((a, b) => a[0] - b[0]),
          [
            [13, 14],
            [14, 1.78],
            [15, 0.54],
            [16, 0.08],
            [19, 0],
            [27, 0.3],
          ],
        );
        assert.deepEqual(
          nextReport.body.entries
            .map(({ slot, amount }) => [slot, Number(amount)])
            .sort((a, b) => a[0] - b[0]),
          [[0, 0.8]],
        );
        assert.equal(previousReport.body.summary.total, 16.7);
        assert.equal(nextReport.body.summary.entered, 1);
      },
    );

    await t.test(
      'Auto VoIP records failures separately and clears them after a successful attempt',
      async () => {
        const at = Date.parse('2026-11-24T08:00:00Z');
        await recordConnectivoAttempt(
          db,
          config,
          at,
          new Error('Could not reach the Go Connectivo portal over HTTPS'),
        );
        const failed = (await owner.get('/api/auto-voip/status')).body;
        assert.match(failed.lastAttempt.error, /Could not reach/);
        assert.ok(failed.lastAttempt.at);
        await recordConnectivoAttempt(db, config, at);
        assert.equal((await owner.get('/api/auto-voip/status')).body.lastAttempt.error, null);
      },
    );

    await t.test(
      'Auto VoIP data is isolated from every other account and validates report ranges',
      async () => {
        const othersStatus = await other.get('/api/auto-voip/status');
        assert.ok([200, 403, 404].includes(othersStatus.status));
        assert.ok(!othersStatus.body.latestSample);
        assert.ok(!othersStatus.body.lastAttempt);
        assert.ok(!JSON.stringify(othersStatus.body).includes('private-fixture-account'));
        const list = await other.get('/api/auto-voip/reports?from=2026-11-23&to=2026-11-24');
        assert.ok([200, 403, 404].includes(list.status));
        if (list.status === 200) assert.deepEqual(list.body, []);
        assert.equal((await other.get(`/api/auto-voip/reports/${firstReportId}`)).status, 404);
        assert.equal((await owner.get('/api/auto-voip/reports/999999')).status, 404);
        for (const range of [
          'from=2026-11-24&to=2026-11-23',
          'from=2026-02-30&to=2026-03-01',
          'from=2024-01-01&to=2026-01-01',
        ]) {
          assert.equal((await owner.get('/api/auto-voip/reports?' + range)).status, 400);
        }
        const day = await owner.get('/api/auto-voip/reports?from=2026-11-23&to=2026-11-23');
        assert.deepEqual(
          day.body.map((report) => report.id),
          [firstReportId],
        );
        assert.deepEqual(
          (await owner.get('/api/auto-voip/reports?from=2026-11-25&to=2026-11-25')).body,
          [],
        );
      },
    );
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
