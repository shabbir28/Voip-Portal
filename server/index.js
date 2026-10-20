import { pool, migrate } from './db.js';
import { createApp } from './app.js';
try {
  await migrate();
  const server = createApp(pool).listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || '127.0.0.1',
    () => {
      console.log(
        `Voip Portal API ready on http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`,
      );
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () =>
      server.close(async () => {
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
