import 'dotenv/config';
import pg from 'pg';
import { makeSlots } from '../shared/reporting.js';
export const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'Voip_portal',
  connectionTimeoutMillis: 5000,
});
export async function migrate(db = pool) {
  await db.query(`
    CREATE SCHEMA IF NOT EXISTS voip;
    CREATE TABLE IF NOT EXISTS voip.users (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS voip.sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES voip.users(id),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voip.campaigns (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#7058e8'
    );
    CREATE TABLE IF NOT EXISTS voip.dialers (
      id SERIAL PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES voip.campaigns(id),
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS voip.sheets (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, report_date DATE NOT NULL,
      config JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL REFERENCES voip.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS voip.entries (
      sheet_id INTEGER NOT NULL REFERENCES voip.sheets(id) ON DELETE CASCADE,
      dialer_id INTEGER NOT NULL, slot INTEGER NOT NULL CHECK(slot >= 0 AND slot < 48),
      amount NUMERIC(12,2) NOT NULL CHECK(amount >= 0),
      PRIMARY KEY(sheet_id, dialer_id, slot)
    );
    CREATE TABLE IF NOT EXISTS voip.audit (
      id SERIAL PRIMARY KEY, sheet_id INTEGER REFERENCES voip.sheets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES voip.users(id), action TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE voip.campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE voip.dialers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS voip.vendors (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS voip.vendor_reports (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, report_date DATE NOT NULL,
      config JSONB NOT NULL, entries JSONB NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL REFERENCES voip.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS vendor_reports_date_idx ON voip.vendor_reports(report_date);
    CREATE INDEX IF NOT EXISTS sheets_owner_date_idx ON voip.sheets(created_by,report_date);
    CREATE INDEX IF NOT EXISTS vendor_reports_owner_date_idx ON voip.vendor_reports(created_by,report_date);
    CREATE TABLE IF NOT EXISTS voip.vendor_audit (
      id SERIAL PRIMARY KEY, report_id INTEGER NOT NULL REFERENCES voip.vendor_reports(id),
      user_id INTEGER NOT NULL REFERENCES voip.users(id), action TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS voip.vendor_negative_reports (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, report_date DATE NOT NULL,
      config JSONB NOT NULL, entries JSONB NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL REFERENCES voip.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS vendor_negative_reports_date_idx ON voip.vendor_negative_reports(report_date);
    CREATE INDEX IF NOT EXISTS vendor_negative_reports_owner_date_idx ON voip.vendor_negative_reports(created_by,report_date);
    CREATE TABLE IF NOT EXISTS voip.schema_migrations (name TEXT PRIMARY KEY);
    ALTER TABLE voip.users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','super_admin'));
    ALTER TABLE voip.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE voip.users ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS voip.user_audit (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES voip.users(id),
      action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM voip.schema_migrations WHERE name='user-roles-v1') THEN
        UPDATE voip.users SET role='super_admin' WHERE id=(SELECT min(id) FROM voip.users);
        INSERT INTO voip.schema_migrations(name) VALUES('user-roles-v1');
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM voip.schema_migrations WHERE name='initial-vendors') THEN
        INSERT INTO voip.vendors(name) VALUES ('Telcast_com'),('Telcast_main'),('Dial_egde'),('Dial_360'),('Go_Connectivo'),('Contactivity_main'),('Contactivity_com') ON CONFLICT DO NOTHING;
        INSERT INTO voip.schema_migrations(name) VALUES('initial-vendors');
      END IF;
    END $$;
  `);
  const slotMig = await db.query(
    "SELECT 1 FROM voip.schema_migrations WHERE name='default-slots-630pm-500am-v1'",
  );
  if (!slotMig.rowCount) {
    const updatedSlots = makeSlots('18:30', '05:30');
    await db.query(
      `UPDATE voip.sheets
       SET config = jsonb_set(config, '{slots}', $1::jsonb)
       WHERE jsonb_array_length(config->'slots') = 20
         AND config->'slots'->0->>'start' = '18:30'
         AND config->'slots'->19->>'end' = '04:30'`,
      [JSON.stringify(updatedSlots)],
    );
    await db.query(
      "INSERT INTO voip.schema_migrations(name) VALUES('default-slots-630pm-500am-v1') ON CONFLICT DO NOTHING",
    );
  }
}
