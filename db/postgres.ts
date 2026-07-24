import { env } from "cloudflare:workers";
import type { Client, QueryResultRow } from "pg";

type HyperdriveBinding = { connectionString: string };
let schemaReady = false;

function getConnectionString() {
  const hyperdrive = (env as typeof env & { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE;
  return hyperdrive?.connectionString || process.env.DATABASE_URL?.trim();
}

export function isPostgresConfigured() {
  return Boolean(getConnectionString());
}

async function createClient() {
  const connectionString = getConnectionString();
  if (!connectionString) throw new Error("PostgreSQL is not configured.");
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

export async function ensurePostgresSchema() {
  if (schemaReady) return;
  const client = await createClient();
  try {
      await client.query(`CREATE TABLE IF NOT EXISTS feedback (
        id serial PRIMARY KEY,
        training_title text NOT NULL,
        training_date date NOT NULL,
        participant_name text,
        department text,
        overall_rating integer NOT NULL,
        trainer_rating integer DEFAULT 3 NOT NULL,
        clarity_rating integer NOT NULL,
        relevance_rating integer NOT NULL,
        confidence_rating integer NOT NULL,
        recommend_score integer NOT NULL,
        highlight text,
        improvement text,
        anonymous boolean DEFAULT true NOT NULL,
        respondent_token text,
        created_at timestamptz DEFAULT now() NOT NULL
      )`);
      await client.query("CREATE UNIQUE INDEX IF NOT EXISTS feedback_respondent_training_idx ON feedback (respondent_token, training_title, training_date)");
      await client.query(`CREATE TABLE IF NOT EXISTS trainings (
        id serial PRIMARY KEY,
        title text NOT NULL,
        training_date date NOT NULL,
        trainer_name text DEFAULT 'Not assigned' NOT NULL,
        facilitator_name text DEFAULT 'Not assigned' NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL
      )`);
      await client.query("CREATE UNIQUE INDEX IF NOT EXISTS trainings_title_date_idx ON trainings (title, training_date)");
      await client.query(`CREATE TABLE IF NOT EXISTS admin_users (
        id serial PRIMARY KEY,
        username text NOT NULL,
        password_hash text NOT NULL,
        display_name text NOT NULL DEFAULT 'Administrator',
        role text NOT NULL DEFAULT 'admin',
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin'");
      await client.query("CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_idx ON admin_users (lower(username))");
      schemaReady = true;
  } finally {
    await client.end();
  }
}

export async function queryPostgres<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
  await ensurePostgresSchema();
  const client = await createClient();
  try {
    return (await client.query<T>(sql, values)).rows;
  } finally {
    await client.end();
  }
}

export async function withPostgresTransaction<T>(work: (client: Client) => Promise<T>) {
  await ensurePostgresSchema();
  const client = await createClient();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
