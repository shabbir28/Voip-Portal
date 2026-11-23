import { pool, migrate } from './db.js';
import { createApp } from './app.js';
import { connectivoConfig, connectivoEnvironment } from './integrations/connectivo/config.js';
import { startConnectivoSync } from './integrations/connectivo/worker.js';
try {
  await migrate();
  let stopConnectivo;
  const server = createApp(pool).listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || '127.0.0.1',
    () => {
      console.log(
        `Voip Portal API ready on http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`,
      );
      try {
        const env = connectivoEnvironment();
        if (env.CONNECTIVO_SYNC_ENABLED === 'true') {
          stopConnectivo = startConnectivoSync(pool, connectivoConfig(env));
        }
      } catch (error) {
        console.error(`[Go Connectivo] Could not start sync: ${error.code || error.message}`);
      }
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () =>
      server.close(async () => {
        await stopConnectivo?.();
        await pool.end();
        process.exit(0);
      }),
    );
} catch (err) {
  console.error(
    `Database connection failed (${err.code || err.name}). Check .env and ensure PostgreSQL is running.`,
  );
  process.exit(1);
}
