import { pool } from '../server/db.js';

async function cleanDataKeepUsers() {
  console.log('--- Cleaning Report & Audit Data (Keeping All Users) ---');
  try {
    const usersBefore = await pool.query('SELECT id, name, email, role FROM voip.users ORDER BY id');
    console.log(`Found ${usersBefore.rows.length} existing users. Preserving all of them.`);
    console.table(usersBefore.rows);

    await pool.query(`
      TRUNCATE voip.entries, 
               voip.audit, 
               voip.sheets, 
               voip.vendor_audit, 
               voip.vendor_reports, 
               voip.user_audit 
      RESTART IDENTITY CASCADE;
    `);
    console.log('✔ All sheets, entries, vendor reports, and audit logs have been successfully cleared.');

    const usersAfter = await pool.query('SELECT id, name, email, role FROM voip.users ORDER BY id');
    console.log('--------------------------------------------------');
    console.log('Preserved Users in Database:');
    console.table(usersAfter.rows);
    console.log('--------------------------------------------------');
    console.log('✔ Done! All report data cleared; users remain intact.');
  } catch (err) {
    console.error('Error cleaning database:', err);
  } finally {
    await pool.end();
  }
}

cleanDataKeepUsers();
