// Temporary, isolated UI verification fixture. Never uses the real portal database.
import 'dotenv/config';
import pg from 'pg';
import { todayInZone } from '../shared/time.js';
import { createApp } from '../server/app.js';
import { migrate } from '../server/db.js';
const connection = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD };
const admin = new pg.Pool({ ...connection, database: 'postgres' });
const database = `voip_portal_preview_${process.pid}`;
await admin.query(`CREATE DATABASE "${database}"`);
const db = new pg.Pool({ ...connection, database });
await migrate(db);
process.env.APP_ORIGIN = 'http://127.0.0.1:3002';
const server = createApp(db).listen(3002, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:3002/api';
const headers = { 'Content-Type': 'application/json', 'X-Voip-Request': '1' };
const setup = await fetch(`${base}/setup`, { method: 'POST', headers, body: JSON.stringify({ name: 'QA Preview', email: 'preview@example.test', password: 'Preview-only-4829' }) });
headers.Cookie = setup.headers.get('set-cookie').split(';')[0];
await fetch(`${base}/users`, {method:'POST',headers,body:JSON.stringify({name:'Preview Operations Admin',email:'preview.admin@example.test',password:'Preview-admin-only-4829',role:'admin'})});
const catalog = await (await fetch(`${base}/catalog`, { headers })).json();
const sheet = await (await fetch(`${base}/sheets`, { method: 'POST', headers, body: JSON.stringify({ name: 'QA sample · not live data', report_date: todayInZone(), start: '18:30', end: '04:30', dialer_ids: catalog.dialers.map(d => d.id) }) })).json();
await fetch(`${base}/sheets/${sheet.id}/entries`, { method: 'PUT', headers, body: JSON.stringify({ version: 0, entries: catalog.dialers.flatMap((d, j) => Array.from({ length: 10 }, (_, slot) => ({ dialer_id: d.id, slot, amount: (j * 11 + slot * 7) % 80 + 10 }))) }) });
const vendors = await (await fetch(`${base}/vendors`, { headers })).json();
const vendorReport = await (await fetch(`${base}/vendor-reports`, { method: 'POST', headers, body: JSON.stringify({ name: 'Vendor preview · sample data', report_date: todayInZone(), vendor_ids: vendors.map(v => v.id) }) })).json();
await fetch(`${base}/vendor-reports/${vendorReport.id}/entries`, { method: 'PUT', headers, body: JSON.stringify({ version: 0, entries: vendors.flatMap((v, j) => Array.from({ length: 6 }, (_, slot) => ({ vendor_id: v.id, slot, amount: Number((24.5 + j * 11 + slot * 6.35).toFixed(2)) }))) }) });
console.log(`Isolated preview ready at http://127.0.0.1:3002 (database ${database})`);
async function cleanup() {
  await new Promise(resolve => server.close(resolve));
  await db.end();
  if (!/^voip_portal_preview_\d+$/.test(database)) throw new Error('Invalid preview database name');
  await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
// Auto-clean the disposable fixture even if the verification client disconnects.
setTimeout(cleanup, 15 * 60 * 1000).unref();
