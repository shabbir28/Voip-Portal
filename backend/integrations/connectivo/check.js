import '../../db.js';
import { connectivoConfig, connectivoEnvironment } from './config.js';
import { createConnectivoSource } from './source.js';

try {
  const config = connectivoConfig(connectivoEnvironment());
  const readSnapshot = createConnectivoSource(config);
  const { billingDate, totals } = await readSnapshot();
  const amount = (totals[billingDate] / 100).toFixed(2);
  console.info(
    `[Go Connectivo] ${config.billingName} billed $${amount} on ${billingDate}. Read-only check passed.`,
  );
} catch (error) {
  console.error(`[Go Connectivo] Check failed: ${error.code || error.message}`);
  process.exitCode = 1;
}
