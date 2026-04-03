import app from './app';
import { env } from './config/env';
import { closePool } from './db';
import { closeRedis } from './lib/Redis';

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is running on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, shutting down...`);

  server.close(async () => {
    await closeRedis();
    await closePool();
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10_000);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
