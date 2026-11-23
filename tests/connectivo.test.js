import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import {
  createConnectivoSource,
  readBilledTotals,
} from '../backend/integrations/connectivo/source.js';
import {
  autoReportConfig,
  INTERVAL_MS,
  intervalCents,
} from '../backend/integrations/connectivo/sync.js';

const dates = ['2026-11-22', '2026-11-23'];
const table = (rows) =>
  load(
    `<table><tr><th>Name</th><th>Date</th><th>Type</th><th>Billed</th><th>Credited</th></tr>${rows}</table>`,
  );

test('reads the named dialer and billed amount, ignoring other dialers, credits and totals', () => {
  const $ = table(`
    <tr><td>BT-rev1</td><td>11-23-2026</td><td>Billed</td><td>$ 1,234.56</td><td>$ 0.00</td></tr>
    <tr><td>BT-rev1</td><td>11-23-2026</td><td>Credited</td><td>$ 0.00</td><td>$ 10.00</td></tr>
    <tr><td>BT-rev10</td><td>11-23-2026</td><td>Billed</td><td>$ 100.00</td><td>$ 0.00</td></tr>
    <tr><td colspan="3">Total</td><td>$ 1,334.56</td><td>$ 10.00</td></tr>`);
  assert.deepEqual(readBilledTotals($, 'BT-rev1', dates), {
    '2026-11-22': 0,
    '2026-11-23': 123456,
  });
});

test('rejects unexpected, duplicate or malformed billing rows', () => {
  const read = (rows) => readBilledTotals(table(rows), 'BT-rev1', dates);
  const row = (date, amount) =>
    `<tr><td>BT-rev1</td><td>${date}</td><td>Billed</td><td>${amount}</td></tr>`;
  assert.throws(() => read(row('11-21-2026', '$ 49.73')), /date filter/);
  assert.throws(() => read(row('11-23-2026', '$ 49.73').repeat(2)), /more than one/);
  assert.throws(() => read(row('11-23-2026', 'unavailable')), /invalid billed amount/);
  assert.throws(() => read(''), /billing dialer/);
  assert.throws(
    () => readBilledTotals(load('<form id="c_form"></form>'), 'BT-rev1', dates),
    /billing table/,
  );
});

test('treats a matched zero billed row as confirmed zero spend', () => {
  const $ = table('<tr><td>BT-rev1</td><td>11-23-2026</td><td>Billed</td><td>$ 0.00</td></tr>');
  assert.deepEqual(readBilledTotals($, 'BT-rev1', dates), {
    '2026-11-22': 0,
    '2026-11-23': 0,
  });
});

test('subtracts billing counters in cents across the vendor day change', () => {
  const before = { billingDate: '2026-11-23', totals: { '2026-11-23': 4973 } };
  assert.equal(intervalCents(before, { ...before, totals: { '2026-11-23': 5280 } }), 307);
  assert.equal(intervalCents(before, { ...before, totals: { '2026-11-23': 4900 } }), null);
  assert.equal(
    intervalCents(before, {
      billingDate: '2026-11-24',
      totals: { '2026-11-23': 5000, '2026-11-24': 11 },
    }),
    38,
  );
  assert.equal(
    intervalCents(before, { billingDate: '2026-11-24', totals: { '2026-11-24': 11 } }),
    null,
  );
});

test('accepts the vendor login redirect query and reads the filtered billed total', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const billing = `<form id="frmfilter"><input name="account_id" value="fixture-account"><input id="startdate1" value="11/23/2026"></form>
    <table><tr><th>Name</th><th>Date</th><th>Type</th><th>Billed</th></tr>
    <tr><td>BT-rev1</td><td>11-23-2026</td><td>Billed</td><td>$ 49.73</td></tr></table>`;
  const responses = [
    new Response('<form id="c_form" action="login.php"><input name="c_passwd"></form>', {
      headers: { 'Set-Cookie': 'PHPSESSID=fixture; Path=/; Secure; HttpOnly' },
    }),
    new Response(null, {
      status: 302,
      headers: { Location: 'https://portal.goconnectivo.com/account.php?src=login' },
    }),
    new Response(billing),
    new Response(billing),
  ];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const response = responses.shift();
    assert.ok(response, 'The source must not make unexpected requests');
    return response;
  };
  try {
    const read = createConnectivoSource({
      username: 'fixture-user',
      password: 'fixture-password',
      billingName: 'BT-rev1',
    });
    assert.deepEqual(await read(), {
      account: 'fixture-account',
      billingDate: '2026-11-23',
      totals: { '2026-11-22': 0, '2026-11-23': 4973 },
    });
    const query = new URL(requests.at(-1).url).searchParams;
    assert.equal(query.get('dfrom'), '11/22/2026');
    assert.equal(query.get('tfrom'), '11/23/2026');
    assert.equal(requests[1].options.headers.Cookie, 'PHPSESSID=fixture');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects a login redirect outside the vendor portal', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response('<form id="c_form" action="login.php"><input name="c_passwd"></form>', {
      headers: { 'Set-Cookie': 'PHPSESSID=fixture; Path=/' },
    }),
    new Response(null, {
      status: 302,
      headers: { Location: 'https://untrusted.example/account.php?src=login' },
    }),
  ];
  globalThis.fetch = async () => {
    const response = responses.shift();
    assert.ok(response, 'The source must not follow the third-party redirect');
    return response;
  };
  try {
    const read = createConnectivoSource({
      username: 'fixture-user',
      password: 'fixture-password',
      billingName: 'BT-rev1',
    });
    await assert.rejects(read, /did not accept/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Auto VoIP keeps 28 Pakistan half-hours even when Eastern clocks change', () => {
  for (const date of ['2026-11-23', '2026-03-07', '2026-10-31']) {
    const config = autoReportConfig(date, { id: 8, name: 'MED_MAIN_BTrev1' });
    assert.equal(config.slots.length, 28);
    assert.equal(config.timezone, 'Asia/Karachi');
    assert.equal(config.slots[0].start, '17:00');
    assert.equal(config.slots.at(-1).end, '07:00');
    assert.equal(config.slots.at(-1).dayOffset, 1);
    const starts = config.slots.map((slot) => Date.parse(slot.utcStart));
    assert.equal(new Set(starts).size, 28);
    for (let index = 0; index < config.slots.length; index++) {
      const slot = config.slots[index];
      assert.equal(Date.parse(slot.utcEnd) - starts[index], INTERVAL_MS);
      if (index > 0) assert.equal(starts[index], Date.parse(config.slots[index - 1].utcEnd));
    }
    if (date === '2026-11-23') {
      assert.equal(config.slots[13].utcStart, '2026-11-23T18:30:00.000Z');
      assert.equal(config.slots[13].utcEnd, '2026-11-23T19:00:00.000Z');
      assert.equal(config.slots[14].start, '00:00');
      assert.equal(config.slots.at(-1).utcEnd, '2026-11-24T02:00:00.000Z');
    }
  }
});
