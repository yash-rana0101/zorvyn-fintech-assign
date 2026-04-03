import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { Pool } from 'pg';

config();

type SeedUser = {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'analyst' | 'viewer';
  status: 'active' | 'inactive';
};

type SeedTransaction = {
  userEmail: string;
  amount: string;
  type: 'income' | 'expense';
  category: string;
  note: string;
  timestamp: string;
  idempotencyKey: string;
};

function buildConnectionString(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const name = process.env.DB_NAME ?? 'finance_db';
  const user = encodeURIComponent(process.env.DB_USER ?? 'postgres');
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? 'postgres');

  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

const seedUsers: SeedUser[] = [
  {
    name: 'System Admin',
    email: 'admin@finance.local',
    password: 'Admin@123',
    role: 'admin',
    status: 'active',
  },
  {
    name: 'Finance Analyst',
    email: 'analyst@finance.local',
    password: 'Analyst@123',
    role: 'analyst',
    status: 'active',
  },
  {
    name: 'Report Viewer',
    email: 'viewer@finance.local',
    password: 'Viewer@123',
    role: 'viewer',
    status: 'active',
  },
];

const seedTransactions: SeedTransaction[] = [
  {
    userEmail: 'analyst@finance.local',
    amount: '2500.00',
    type: 'income',
    category: 'salary',
    note: 'Monthly salary',
    timestamp: '2026-01-05T10:00:00.000Z',
    idempotencyKey: 'seed-analyst-income-2026-01',
  },
  {
    userEmail: 'analyst@finance.local',
    amount: '180.50',
    type: 'expense',
    category: 'utilities',
    note: 'Electric bill',
    timestamp: '2026-01-10T10:00:00.000Z',
    idempotencyKey: 'seed-analyst-expense-2026-01',
  },
  {
    userEmail: 'viewer@finance.local',
    amount: '500.00',
    type: 'income',
    category: 'freelance',
    note: 'Freelance project',
    timestamp: '2026-01-15T10:00:00.000Z',
    idempotencyKey: 'seed-viewer-income-2026-01',
  },
];

async function run(): Promise<void> {
  const pool = new Pool({ connectionString: buildConnectionString() });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const usersByEmail = new Map<string, string>();

    for (const user of seedUsers) {
      const passwordHash = await bcrypt.hash(user.password, 10);

      const result = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (email)
         DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           status = EXCLUDED.status,
           updated_at = NOW()
         RETURNING id`,
        [user.name, user.email.toLowerCase(), passwordHash, user.role, user.status]
      );

      usersByEmail.set(user.email.toLowerCase(), result.rows[0].id);
    }

    for (const transaction of seedTransactions) {
      const userId = usersByEmail.get(transaction.userEmail.toLowerCase());
      if (!userId) {
        throw new Error(`Missing seeded user for ${transaction.userEmail}`);
      }

      await client.query(
        `INSERT INTO transactions (
          user_id,
          amount,
          type,
          category,
          note,
          timestamp,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES ($1, $2::numeric(15,2), $3, $4, $5, $6::timestamptz, $7, NOW(), NOW())
        ON CONFLICT (idempotency_key)
        DO UPDATE SET
          amount = EXCLUDED.amount,
          type = EXCLUDED.type,
          category = EXCLUDED.category,
          note = EXCLUDED.note,
          timestamp = EXCLUDED.timestamp,
          updated_at = NOW()`,
        [
          userId,
          transaction.amount,
          transaction.type,
          transaction.category,
          transaction.note,
          transaction.timestamp,
          transaction.idempotencyKey,
        ]
      );
    }

    await client.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log('Seed completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  process.exit(1);
});
