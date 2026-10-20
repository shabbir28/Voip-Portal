import bcrypt from 'bcryptjs';
import { pool } from '../server/db.js';

const email = process.argv[2] || 'shabbirahmed.devv@gmail.com';
const newPassword = process.argv[3] || 'Admin@12345';
const name = process.argv[4] || 'Super Admin';

try {
  const hash = await bcrypt.hash(newPassword, 12);
  const existing = await pool.query('SELECT * FROM voip.users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    await pool.query('UPDATE voip.users SET password_hash = $1, deleted_at = NULL WHERE email = $2', [
      hash,
      email,
    ]);
    console.log(`Password updated successfully!`);
  } else {
    await pool.query(
      "INSERT INTO voip.users (name, email, password_hash, role) VALUES ($1, $2, $3, 'super_admin')",
      [name, email, hash],
    );
    console.log(`New Super Admin created!`);
  }
  console.log(`-----------------------------------`);
  console.log(`Email:    ${email}`);
  console.log(`Password: ${newPassword}`);
  console.log(`-----------------------------------`);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await pool.end();
}
