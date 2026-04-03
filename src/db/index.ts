import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

function buildConnectionString(): string {
  if (env.DATABASE_URL && env.DATABASE_URL.trim().length > 0) {
    return env.DATABASE_URL;
  }

  const user = encodeURIComponent(env.DB_USER);
  const password = encodeURIComponent(env.DB_PASSWORD);

  return `postgresql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
}

const pool = new Pool({
  connectionString: buildConnectionString(),
  min: env.DB_POOL_MIN,
  max: env.DB_POOL_MAX,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as unknown[] as any[]);
}

export function getPool(): Pool {
  return pool;
}

export async function closePool(): Promise<void> {
  await pool.end();
}
