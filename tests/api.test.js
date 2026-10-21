import { verifyReportOwnership } from './report-ownership-api.js';
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { migrate } from '../server/db.js';
import { verifyVendorApi } from './vendor-api.js';
import { verifyVendorNegativeApi } from './vendor-negative-api.js';
import { verifyRoles } from './roles-api.js';
import { verifyUserEditing } from './user-editing-api.js';
test('PostgreSQL authentication, reporting, validation and concurrent edits', async (t) => {
  const connection = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
  const admin = new pg.Pool({ ...connection, database: 'postgres' });
  const dbName = `voip_portal_test_${process.pid}`;
  assert.match(dbName, /^voip_portal_test_\d+$/);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const db = new pg.Pool({ ...connection, database: dbName });
  try {
    await migrate(db);
    const app = createApp(db),
      agent = request.agent(app);
    const mutate = (method, url, body) => agent[method](url).set('X-Voip-Request', '1').send(body);
    await t.test('private endpoints require authentication', async () => {
      assert.equal((await agent.get('/api/catalog')).status, 401);
      assert.equal((await agent.get('/api/vendors')).status, 401);
      assert.equal(
        (await agent.get('/api/vendor-reports?from=2026-10-20&to=2026-10-20')).status,
        401,
      );
      assert.equal((await agent.get('/api/status')).body.needsSetup, true);
    });
    await t.test('setup creates an account and original campaign structure', async () => {
      const r = await mutate('post', '/api/setup', {
        name: 'Test Admin',
        email: 'test@example.com',
        password: 'Testing-only-4829',
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.user.name, 'Test Admin');
      assert.equal((await agent.get('/api/catalog')).body.dialers.length, 18);
      assert.equal(
        (
          await mutate('post', '/api/setup', {
            name: 'Other',
            email: 'other@example.com',
            password: 'Testing-only-4829',
          })
        ).status,
        409,
      );
    });
    const catalog = (await agent.get('/api/catalog')).body;
    const dialerId = catalog.dialers[0].id;
    let sheetId;
    await t.test('new reports contain 20 intervals and persist in PostgreSQL', async () => {
      const r = await mutate('post', '/api/sheets', {
        name: 'Night shift test',
        report_date: '2026-10-20',
        start: '18:30',
        end: '04:30',
        dialer_ids: [dialerId],
      });
      assert.equal(r.status, 201);
      sheetId = r.body.id;
      const s = (await agent.get(`/api/sheets/${sheetId}`)).body;
      assert.equal(s.config.slots.length, 20);
      assert.equal(s.summary.total, 0);
      assert.equal(s.report_date, '2026-10-20');
    });
    const endpoint = `/api/sheets/${sheetId}/entries`;
    await t.test('save, totals and detailed audit trail work', async () => {
      const r = await mutate('put', endpoint, {
        version: 0,
        entries: [
          { dialer_id: dialerId, slot: 0, amount: 37.15 },
          { dialer_id: dialerId, slot: 1, amount: 0 },
        ],
      });
      assert.equal(r.status, 200);
      const s = (await agent.get(`/api/sheets/${sheetId}`)).body;
      assert.equal(s.summary.total, 37.15);
      assert.equal(s.summary.entered, 2);
      assert.equal(s.activity[0].detail.changes.length, 2);
      assert.equal(
        Number((await db.query('SELECT amount FROM voip.entries WHERE slot=0')).rows[0].amount),
        37.15,
      );
    });
    await t.test('stale versions cannot overwrite saved values', async () => {
      assert.equal(
        (
          await mutate('put', endpoint, {
            version: 0,
            entries: [{ dialer_id: dialerId, slot: 0, amount: 99 }],
          })
        ).status,
        409,
      );
    });
    await t.test(
      'invalid amounts, foreign dialers and invalid slots are rejected atomically',
      async () => {
        for (const amount of [-1, 0.001, 10000000000])
          assert.equal(
            (
              await mutate('put', endpoint, {
                version: 1,
                entries: [{ dialer_id: dialerId, slot: 0, amount }],
              })
            ).status,
            400,
          );
        const r = await mutate('put', endpoint, {
          version: 1,
          entries: [
            { dialer_id: dialerId, slot: 0, amount: 99 },
            { dialer_id: 999999, slot: 0, amount: 2 },
          ],
        });
        assert.equal(r.status, 400);
        assert.equal((await agent.get(`/api/sheets/${sheetId}`)).body.summary.total, 37.15);
        assert.equal(
          (
            await mutate('put', endpoint, {
              version: 1,
              entries: [{ dialer_id: dialerId, slot: 30, amount: 1 }],
            })
          ).status,
          400,
        );
      },
    );
    await t.test('clear a cell and concurrent save conflict', async () => {
      const results = await Promise.all([
        mutate('put', endpoint, {
          version: 1,
          entries: [{ dialer_id: dialerId, slot: 0, amount: null }],
        }),
        mutate('put', endpoint, {
          version: 1,
          entries: [{ dialer_id: dialerId, slot: 0, amount: null }],
        }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const s = (await agent.get(`/api/sheets/${sheetId}`)).body;
      assert.equal(s.summary.total, 0);
      assert.equal(s.summary.entered, 1);
    });
    await t.test('origin protection, invalid dates and duplicate dialer names', async () => {
      assert.equal((await agent.post('/api/campaigns').send({ name: 'Blocked' })).status, 403);
      assert.equal(
        (
          await agent
            .post('/api/campaigns')
            .set('X-Voip-Request', '1')
            .set('Origin', 'https://untrusted.example')
            .send({ name: 'Blocked' })
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate('post', '/api/sheets', {
            name: 'Bad date',
            report_date: '2026-02-30',
            start: '18:30',
            end: '04:30',
            dialer_ids: [dialerId],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await mutate('post', '/api/dialers', {
            name: catalog.dialers[0].name,
            campaign_id: catalog.campaigns[0].id,
          })
        ).status,
        409,
      );
      assert.equal(
        (await mutate('post', '/api/campaigns', { name: 'New campaign', color: '#123456' })).status,
        201,
      );
    });
    await t.test(
      'add existing and new dialers to an existing report, preserving entries',
      async () => {
        const route = `/api/sheets/${sheetId}/dialers`;
        const existing = {
          version: 2,
          campaign_id: catalog.campaigns[0].id,
          dialer_id: catalog.dialers[1].id,
        };
        assert.equal((await mutate('post', route, existing)).status, 201);
        assert.equal((await mutate('post', route, existing)).status, 409);
        assert.equal((await mutate('post', route, { ...existing, version: 3 })).status, 409);
        assert.equal(
          (
            await mutate('post', route, {
              version: 3,
              campaign_id: catalog.campaigns[0].id,
              name: 'New report dialer',
            })
          ).status,
          201,
        );
        const s = (await agent.get(`/api/sheets/${sheetId}`)).body;
        assert.equal(s.config.dialers.length, 3);
        assert.equal(s.entries.length, 1);
        assert.equal(s.activity[0].action, 'Dialer added');
        assert.equal(s.summary.expected, 60);
        const newId = s.config.dialers.at(-1).id;
        assert.equal(
          (
            await mutate('put', endpoint, {
              version: 4,
              entries: [{ dialer_id: newId, slot: 0, amount: 15.25 }],
            })
          ).status,
          200,
        );
        assert.equal((await agent.get(`/api/sheets/${sheetId}`)).body.summary.total, 15.25);
        const before = (await agent.get('/api/catalog')).body.dialers.length;
        assert.equal(
          (
            await mutate('post', route, {
              version: 4,
              campaign_id: catalog.campaigns[0].id,
              name: 'Must not be created',
            })
          ).status,
          409,
        );
        assert.equal((await agent.get('/api/catalog')).body.dialers.length, before);
        assert.equal(
          (
            await mutate('post', route, {
              version: 5,
              campaign_id: catalog.campaigns[1].id,
              dialer_id: catalog.dialers[0].id,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      'date ranges include both boundaries, exclude other days and validate dates',
      async () => {
        for (const day of ['2026-10-19', '2026-10-21'])
          await mutate('post', '/api/sheets', {
            name: 'Date boundary',
            report_date: day,
            start: '18:30',
            end: '04:30',
            dialer_ids: [dialerId],
          });
        const reports = (await agent.get('/api/reports/range?from=2026-10-20&to=2026-10-21')).body;
        assert.deepEqual(
          reports.map((r) => r.report_date),
          ['2026-10-20', '2026-10-21'],
        );
        assert.equal(
          reports[0].entries.reduce((n, e) => n + Number(e.amount), 0),
          15.25,
        );
        assert.equal(
          (await agent.get('/api/reports/range?from=2026-10-20&to=2026-10-20')).body.length,
          1,
        );
        assert.deepEqual(
          (await agent.get('/api/reports/range?from=2026-11-01&to=2026-11-30')).body,
          [],
        );
        assert.equal(
          (await agent.get('/api/reports/range?from=2026-10-21&to=2026-10-20')).status,
          400,
        );
        assert.equal(
          (await agent.get('/api/reports/range?from=2026-02-30&to=2026-03-01')).status,
          400,
        );
        assert.equal(
          (await agent.get('/api/reports/range?from=2024-01-01&to=2026-01-01')).status,
          400,
        );
      },
    );
    await t.test(
      'report rows can be renamed, removed, restored and cleared with version checks',
      async () => {
        const route = `/api/sheets/${sheetId}/dialers/${dialerId}`;
        assert.equal(
          (await mutate('patch', route, { version: 5, action: 'rename', name: 'Report-only name' }))
            .status,
          200,
        );
        assert.equal((await mutate('patch', route, { version: 5, action: 'remove' })).status, 409);
        assert.equal((await mutate('patch', route, { version: 6, action: 'remove' })).status, 200);
        let report = (await agent.get(`/api/sheets/${sheetId}`)).body;
        assert.equal(report.config.dialers.length, 2);
        assert.equal(report.config.removedDialers[0].row.name, 'Report-only name');
        assert.equal(
          report.entries.some((e) => e.dialer_id === dialerId),
          false,
        );
        assert.equal((await mutate('patch', route, { version: 7, action: 'restore' })).status, 200);
        report = (await agent.get(`/api/sheets/${sheetId}`)).body;
        assert.equal(report.config.dialers.length, 3);
        assert.equal(report.entries.find((e) => e.dialer_id === dialerId).amount, '0.00');
        const newRow = report.config.dialers.find((d) => d.name === 'New report dialer');
        assert.equal(
          (
            await mutate('patch', `/api/sheets/${sheetId}/dialers/${newRow.id}`, {
              version: 8,
              action: 'clear',
            })
          ).status,
          200,
        );
        report = (await agent.get(`/api/sheets/${sheetId}`)).body;
        assert.equal(report.summary.total, 0);
        assert.equal(report.activity[0].action, 'Row entries cleared');
        assert.equal(report.activity[0].detail.changes[0].previous, 15.25);
      },
    );
    await t.test('catalog edits and recoverable deletes preserve existing reports', async () => {
      const cid = catalog.campaigns[0].id;
      assert.equal(
        (await mutate('patch', `/api/campaigns/${cid}`, { name: 'ACA Renamed', color: '#123456' }))
          .status,
        200,
      );
      assert.equal(
        (
          await mutate('patch', `/api/dialers/${dialerId}`, {
            name: 'Directory renamed',
            campaign_id: cid,
          })
        ).status,
        200,
      );
      const before = (await agent.get(`/api/sheets/${sheetId}`)).body;
      assert.equal(before.config.dialers.find((d) => d.id === dialerId).name, 'Report-only name');
      assert.equal(before.config.dialers.find((d) => d.id === dialerId).campaign, 'ACA');
      assert.equal((await mutate('delete', `/api/dialers/${dialerId}`, {})).status, 200);
      assert.equal(
        (await agent.get('/api/catalog')).body.dialers.some((d) => d.id === dialerId),
        false,
      );
      assert.ok(
        (await agent.get('/api/catalog?includeDeleted=true')).body.dialers.find(
          (d) => d.id === dialerId,
        ).deleted_at,
      );
      assert.equal((await mutate('post', `/api/dialers/${dialerId}/restore`, {})).status, 200);
      assert.equal((await mutate('delete', `/api/campaigns/${cid}`, {})).status, 200);
      assert.equal(
        (await agent.get('/api/catalog')).body.dialers.some((d) => d.campaign_id === cid),
        false,
      );
      assert.equal(
        (
          await mutate('post', '/api/sheets', {
            name: 'Invalid archived dialer',
            report_date: '2026-10-20',
            start: '18:30',
            end: '04:30',
            dialer_ids: [dialerId],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await mutate('post', '/api/dialers', {
            name: 'Archived campaign entry',
            campaign_id: cid,
          })
        ).status,
        400,
      );
      assert.deepEqual((await agent.get(`/api/sheets/${sheetId}`)).body.entries, before.entries);
      assert.equal((await mutate('post', `/api/campaigns/${cid}/restore`, {})).status, 200);
      assert.equal(
        (await agent.get('/api/catalog')).body.dialers.some((d) => d.id === dialerId),
        true,
      );
    });
    await t.test(
      'legacy timezone conversion agrees across range filtering, list and report view',
      async () => {
        const template = (await agent.get(`/api/sheets/${sheetId}`)).body.config;
        const legacy = {
          ...template,
          timezone: 'Asia/Karachi',
          slots: [{ start: '02:00', end: '02:30', dayOffset: 0 }],
        };
        const inserted = (
          await db.query(
            "INSERT INTO voip.sheets(name,report_date,config,created_by) VALUES('Legacy timezone','2026-10-20',$1,1) RETURNING id",
            [JSON.stringify(legacy)],
          )
        ).rows[0];
        const viewed = (await agent.get(`/api/sheets/${inserted.id}`)).body;
        assert.equal(viewed.report_date, '2026-10-19');
        assert.equal(viewed.config.slots[0].start, '17:00');
        assert.equal(
          (await agent.get('/api/sheets')).body.find((s) => s.id === inserted.id).report_date,
          '2026-10-19',
        );
        assert.equal(
          (await agent.get('/api/reports/range?from=2026-10-19&to=2026-10-19')).body.some(
            (s) => s.id === inserted.id,
          ),
          true,
        );
        assert.equal(
          (await agent.get('/api/reports/range?from=2026-10-20&to=2026-10-20')).body.some(
            (s) => s.id === inserted.id,
          ),
          false,
        );
      },
    );
    await verifyVendorApi(t, agent, mutate, db);
    await verifyVendorNegativeApi(t, agent, mutate);
    await verifyRoles(t, app, agent, mutate, db);
    await verifyReportOwnership(t, app, agent, mutate);
    await verifyUserEditing(t, app, agent, mutate, db);
    await t.test('logout revokes session and login validates passwords', async () => {
      assert.equal((await mutate('post', '/api/logout', {})).status, 200);
      assert.equal((await agent.get('/api/me')).status, 401);
      assert.equal(
        (await mutate('post', '/api/login', { email: 'test@example.com', password: 'wrong' }))
          .status,
        401,
      );
      assert.equal(
        (
          await mutate('post', '/api/login', {
            email: 'test@example.com',
            password: 'Testing-only-4829',
          })
        ).status,
        200,
      );
    });
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE "${dbName}"`);
    await admin.end();
  }
});
