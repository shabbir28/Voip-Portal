import { pool } from '../server/db.js';

async function cleanDatabase() {
  console.log('--- Cleaning VoIP Portal Database ---');
  try {
    // 1. Truncate all reports, entries, and audits (resets counters)
    await pool.query(`
      TRUNCATE voip.entries, 
               voip.audit, 
               voip.sheets, 
               voip.vendor_audit, 
               voip.vendor_reports, 
               voip.user_audit 
      RESTART IDENTITY CASCADE;
    `);
    console.log('✔ All sheets, entries, vendor reports, and audit logs cleared.');

    // 2. Delete all users except Muhammad Shabbir Ahmed (Super Admin)
    const superAdminEmail = 'shabbirahmed.devv@gmail.com';
    await pool.query(
      `DELETE FROM voip.sessions WHERE user_id NOT IN (SELECT id FROM voip.users WHERE email = $1)`,
      [superAdminEmail],
    );
    const deletedUsers = await pool.query(
      `DELETE FROM voip.users WHERE email != $1 RETURNING email`,
      [superAdminEmail],
    );
    console.log(
      `✔ Removed other users: ${deletedUsers.rows.map((r) => r.email).join(', ') || 'None'}`,
    );

    // Verify remaining users
    const remaining = await pool.query(`SELECT id, name, email, role FROM voip.users`);
    console.log('-------------------------------------');
    console.log('Remaining User(s):');
    console.table(remaining.rows);
    console.log('-------------------------------------');
    console.log('✔ Database successfully cleaned!');
  } catch (err) {
    console.error('Error cleaning database:', err);
  } finally {
    await pool.end();
  }
}

cleanDatabase();
