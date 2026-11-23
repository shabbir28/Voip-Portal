import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

export function connectivoEnvironment() {
  let local = {};
  try {
    local = parse(readFileSync(new URL('../../.env.connectivo', import.meta.url)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...local, ...process.env };
}

export function connectivoConfig(env) {
  const ownerId = Number(env.CONNECTIVO_REPORT_OWNER_ID);
  const username = env.CONNECTIVO_USERNAME?.trim();
  const password = env.CONNECTIVO_PASSWORD;
  const billingName = env.CONNECTIVO_BILLING_NAME?.trim() || 'BT-rev1';
  const dialerName = env.CONNECTIVO_REPORT_DIALER?.trim() || 'MED_MAIN_BTrev1';
  if (!username || !password || !Number.isInteger(ownerId) || ownerId < 1 || ownerId > 2147483647) {
    throw new Error('Set CONNECTIVO_USERNAME, CONNECTIVO_PASSWORD, and CONNECTIVO_REPORT_OWNER_ID');
  }
  return { username, password, ownerId, billingName, dialerName };
}
