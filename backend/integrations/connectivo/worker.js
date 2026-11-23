import { createConnectivoSource } from './source.js';
import { recordConnectivoAttempt, recordConnectivoSnapshot } from './sync.js';
import {
  INTERVAL_MS,
  MAX_SAMPLE_DELAY_MS,
  nextAutoVoipBoundary,
  SAMPLE_DELAY_MS,
} from '../../../shared/autoVoip.js';

const RETRY_DELAY_MS = 10_000;

export function startConnectivoSync(db, config, dependencies = {}) {
  const readSnapshot = dependencies.readSnapshot ?? createConnectivoSource(config);
  const recordSnapshot = dependencies.recordSnapshot ?? recordConnectivoSnapshot;
  const recordAttempt = dependencies.recordAttempt ?? recordConnectivoAttempt;
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimeout ?? setTimeout;
  const clearTimer = dependencies.clearTimeout ?? clearTimeout;
  const logger = dependencies.logger ?? console;
  let timer;
  let inFlight;
  let stopped = false;

  async function saveAttempt(periodEnd, error = null) {
    try {
      await recordAttempt(db, config, periodEnd, error);
    } catch (statusError) {
      logger.error(
        `[Go Connectivo] Could not save sync status: ${statusError.code || statusError.message}`,
      );
    }
  }

  async function poll(periodEnd) {
    if (now() > periodEnd + MAX_SAMPLE_DELAY_MS)
      throw new Error('Billing read missed the sampling window');
    const snapshot = await readSnapshot();
    if (now() > periodEnd + MAX_SAMPLE_DELAY_MS)
      throw new Error('Billing read missed the sampling window');
    const outcome = await recordSnapshot(db, config, periodEnd, snapshot);
    await saveAttempt(periodEnd);
    logger.info(
      `[Go Connectivo] ${new Date(periodEnd).toISOString()} ${config.dialerName}: ${outcome}`,
    );
  }

  function scheduleNext(periodEnd) {
    const current = Math.floor(now() / INTERVAL_MS) * INTERVAL_MS;
    const next = Math.max(periodEnd + INTERVAL_MS, current);
    schedule(nextAutoVoipBoundary(now() - next >= MAX_SAMPLE_DELAY_MS ? next + INTERVAL_MS : next));
  }

  function schedule(periodEnd, sampleAt = periodEnd + SAMPLE_DELAY_MS) {
    if (stopped) return;
    timer = setTimer(
      () => {
        inFlight = poll(periodEnd)
          .then(() => scheduleNext(periodEnd))
          .catch(async (error) => {
            await saveAttempt(periodEnd, error);
            if (stopped) return;
            const retryAt = now() + RETRY_DELAY_MS;
            if (retryAt <= periodEnd + MAX_SAMPLE_DELAY_MS) {
              logger.warn(
                `[Go Connectivo] Sync failed; retrying in 10 seconds: ${error.code || error.message}`,
              );
              schedule(periodEnd, retryAt);
            } else {
              logger.error(`[Go Connectivo] Sync failed: ${error.code || error.message}`);
              scheduleNext(periodEnd);
            }
          });
      },
      Math.max(0, sampleAt - now()),
    );
  }

  const startedAt = now();
  const current = Math.floor(startedAt / INTERVAL_MS) * INTERVAL_MS;
  const first = nextAutoVoipBoundary(
    startedAt - current >= MAX_SAMPLE_DELAY_MS ? current + INTERVAL_MS : current,
  );
  logger.info(
    `[Go Connectivo] ${config.billingName} → ${config.dialerName}, next boundary ${new Date(first).toISOString()}`,
  );
  schedule(first);

  return async () => {
    stopped = true;
    clearTimer(timer);
    await inFlight;
  };
}
