import { pool, migrate } from '../../db.js';
import { connectivoConfig, connectivoEnvironment } from './config.js';
import { createConnectivoSource } from './source.js';
import { recordConnectivoAttempt, recordConnectivoSnapshot } from './sync.js';
import { autoVoipShift, autoVoipShiftDate } from '../../../shared/autoVoip.js';

// An immediate connection check is a baseline only. Its actual timestamp is kept
// so it cannot be mistaken for a complete half-hour measurement.
let config;
try {
  config = connectivoConfig(connectivoEnvironment());
  const { start, end } = autoVoipShift(autoVoipShiftDate());
  if (Date.now() > +end) {
    console.info(`[Go Connectivo] Sampling resumes at ${start.toFormat('h:mm a')} Pakistan time.`);
  } else {
    await migrate();
    const snapshot = await createConnectivoSource(config)();
    const at = Date.now();
    const outcome = await recordConnectivoSnapshot(pool, config, at, snapshot);
    if (outcome !== 'outside shift') await recordConnectivoAttempt(pool, config, at);
    console.info(
      `[Go Connectivo] Auto VoIP ${outcome}: ${config.billingName} billed $${(snapshot.totals[snapshot.billingDate] / 100).toFixed(2)} on ${snapshot.billingDate}. Manual reports unchanged.`,
    );
  }
} catch (error) {
  if (config) await recordConnectivoAttempt(pool, config, Date.now(), error).catch(() => {});
  console.error(`[Go Connectivo] Sample failed: ${error.code || error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
