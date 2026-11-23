import { load } from 'cheerio';
import { DateTime } from 'luxon';

const origin = 'https://portal.goconnectivo.com';
const billingPath = '/billing.php?portal=1';

function parseDate(value, format) {
  const date = DateTime.fromFormat(String(value ?? ''), format, { zone: 'UTC' });
  if (!date.isValid) throw new Error('Go Connectivo returned an invalid billing date');
  return date;
}

function parseCents(value) {
  const match = /^\$\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})$/.exec(value);
  if (!match) throw new Error('Go Connectivo returned an invalid billed amount');
  const cents = Number(match[1].replaceAll(',', '')) * 100 + Number(match[2]);
  if (cents > 999999999999) throw new Error('Go Connectivo billed amount is out of range');
  return cents;
}

export function readBilledTotals($, billingName, dates) {
  const required = ['Name', 'Date', 'Type', 'Billed'];
  const cells = (row) =>
    $(row)
      .children('th,td')
      .map((_, cell) => $(cell).text().trim())
      .get();
  const table = $('table').filter((_, element) =>
    $(element)
      .find('tr')
      .toArray()
      .some(
        (row) =>
          $(row).closest('table')[0] === element &&
          required.every((label) => cells(row).includes(label)),
      ),
  );
  if (table.length !== 1) throw new Error('Go Connectivo billing table could not be identified');

  const rows = table
    .find('tr')
    .filter((_, row) => $(row).closest('table')[0] === table[0])
    .toArray()
    .map(cells);
  const header = rows.findIndex((row) => required.every((label) => row.includes(label)));
  const [nameCol, dateCol, typeCol, billedCol] = required.map((label) =>
    rows[header].indexOf(label),
  );
  const totals = Object.fromEntries(dates.map((date) => [date, 0]));
  const seen = new Set();
  for (const row of rows.slice(header + 1)) {
    if (row[nameCol]?.toLowerCase() !== billingName.toLowerCase() || row[typeCol] !== 'Billed')
      continue;
    const date = parseDate(row[dateCol], 'MM-dd-yyyy').toISODate();
    if (!Object.hasOwn(totals, date))
      throw new Error('Go Connectivo ignored the billing date filter');
    if (seen.has(date))
      throw new Error('Go Connectivo returned more than one billed total for the dialer and date');
    seen.add(date);
    totals[date] = parseCents(row[billedCol]);
  }
  if (!seen.size)
    throw new Error('Go Connectivo billing dialer was not found in the requested dates');
  return totals;
}

export function createConnectivoSource({ username, password, billingName }) {
  let session = '';

  async function request(path, options) {
    try {
      const response = await fetch(origin + path, {
        ...options,
        headers: { ...options?.headers, ...(session && { Cookie: session }) },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      for (const header of response.headers.getSetCookie()) {
        const id = /^PHPSESSID=[A-Za-z0-9,-]*(?=;|$)/.exec(header);
        if (id) session = id[0];
      }
      return response;
    } catch {
      throw new Error('Could not reach the Go Connectivo portal over HTTPS');
    }
  }

  async function signIn() {
    session = '';
    const login = await request('/login.php');
    if (!login.ok) throw new Error(`Go Connectivo sign-in page returned HTTP ${login.status}`);
    const form = load(await login.text())('form#c_form');
    if (form.attr('action') !== 'login.php' || !form.find('input[name=c_passwd]').length) {
      throw new Error('Go Connectivo sign-in form changed');
    }
    const body = new URLSearchParams({ c_userId: username, c_passwd: password, c_login: 'Login' });
    const response = await request('/login.php', {
      method: 'POST',
      headers: { Origin: origin, Referer: origin + '/login.php' },
      body,
    });
    await response.body?.cancel();
    const location = new URL(response.headers.get('location') ?? '/login.php', origin);
    if (
      !session ||
      ![302, 303].includes(response.status) ||
      location.origin !== origin ||
      location.pathname !== '/account.php'
    ) {
      session = '';
      throw new Error('Go Connectivo did not accept the sign-in');
    }
  }

  async function billingPage(path, refresh = true) {
    if (!session) await signIn();
    const response = await request(path, { headers: { 'Cache-Control': 'no-cache' } });
    if (response.ok) {
      const $ = load(await response.text());
      if ($('#frmfilter').length) return $;
      if (!refresh || !$('form#c_form').length)
        throw new Error('Go Connectivo billing page changed');
    } else {
      await response.body?.cancel();
      const location = new URL(response.headers.get('location') ?? '/', origin);
      if (
        !refresh ||
        ![302, 303].includes(response.status) ||
        location.origin !== origin ||
        location.pathname !== '/login.php'
      ) {
        throw new Error(`Go Connectivo billing page returned HTTP ${response.status}`);
      }
    }
    await signIn();
    return billingPage(path, false);
  }

  return async function readSnapshot() {
    const $ = await billingPage(billingPath);
    const today = parseDate($('#startdate1').val(), 'MM/dd/yyyy');
    const yesterday = today.minus({ days: 1 });
    const account = $('#frmfilter input[name=account_id]').val();
    if (!account) throw new Error('Go Connectivo billing account is missing');
    const query = new URLSearchParams({
      portal: '1',
      account_id: account,
      p: 'balance',
      dfrom: yesterday.toFormat('MM/dd/yyyy'),
      tfrom: today.toFormat('MM/dd/yyyy'),
      type: 'I',
    });
    const page = await billingPage('/billing.php?' + query);
    if (
      page('#frmfilter input[name=account_id]').val() !== account ||
      page('#startdate1').val() !== $('#startdate1').val()
    ) {
      throw new Error('Go Connectivo billing account or date changed during the read');
    }
    const billingDate = today.toISODate();
    return {
      account,
      billingDate,
      totals: readBilledTotals(page, billingName, [yesterday.toISODate(), billingDate]),
    };
  };
}
