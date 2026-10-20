import { REPORT_TIMEZONE } from '../../shared/time.js';
// Constant timezone comes from application configuration, never from SQL input.
export const reportDateSql = `(((report_date + (config->'slots'->0->>'start')::time) AT TIME ZONE COALESCE(config->>'timezone','Asia/Karachi')) AT TIME ZONE '${REPORT_TIMEZONE}')::date`;
