import bcrypt from 'bcryptjs';
import { pool } from '../server/db.js';

async function setupSuperAdmin() {
  const email = process.argv[2] || 'syedramish@gmail.com';
  const password = process.argv[3] || 'ramish@12332';
  const name = process.argv[4] || 'Syed Ramish';

  console.log('--- Setting Up Super Admin & Cleaning Database ---');
  try {
    // 1. Clear all reports, entries, and audits (clean slate)
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

    // 2. Hash the new password
    const passwordHash = await bcrypt.hash(password, 12);

    // 3. Upsert Super Admin
    const existing = await pool.query('SELECT id FROM voip.users WHERE email = $1', [email]);
    let superAdminId;
    if (existing.rowCount > 0) {
      superAdminId = existing.rows[0].id;
      await pool.query(
        `UPDATE voip.users SET name = $1, password_hash = $2, role = 'super_admin', deleted_at = NULL WHERE id = $3`,
        [name, passwordHash, superAdminId],
      );
    } else {
      const res = await pool.query(
        `INSERT INTO voip.users (name, email, password_hash, role) VALUES ($1, $2, $3, 'super_admin') RETURNING id`,
        [name, email, passwordHash],
      );
      superAdminId = res.rows[0].id;
    }
    console.log(`✔ Super Admin set up: ${email}`);

    // 4. Delete all existing sessions and all other users
    await pool.query('DELETE FROM voip.sessions');
    const deleted = await pool.query('DELETE FROM voip.users WHERE id != $1 RETURNING email', [
      superAdminId,
    ]);
    console.log(
      `✔ Removed other users: ${deleted.rows.map((r) => r.email).join(', ') || 'None'}`,
    );

    // 5. Verification
    const remaining = await pool.query('SELECT id, name, email, role FROM voip.users');
    console.log('--------------------------------------------------');
    console.log('Active Super Admin in Database:');
    console.table(remaining.rows);
    console.log('--------------------------------------------------');
    console.log(`Login Credentials:`);
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log('--------------------------------------------------');
    console.log('✔ Done! Only the new Super Admin exists in the database.');
  } catch (err) {
    console.error('Error setting up Super Admin:', err);
  } finally {
    await pool.end();
  }
}

setupSuperAdmin();
