import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function ensureFeedbackTable() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS feedback (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    training_title text NOT NULL,
    training_date text NOT NULL,
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
    anonymous integer DEFAULT true NOT NULL,
    respondent_token text,
    created_at text NOT NULL
  )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(feedback)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "trainer_rating")) {
    await env.DB.prepare("ALTER TABLE feedback ADD COLUMN trainer_rating integer DEFAULT 3 NOT NULL").run();
  }
  if (!columns.results.some((column) => column.name === "respondent_token")) {
    await env.DB.prepare("ALTER TABLE feedback ADD COLUMN respondent_token text").run();
  }
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS feedback_respondent_training_idx ON feedback (respondent_token, training_title, training_date)").run();
}

export async function ensureTrainingsTable() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS trainings (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    title text NOT NULL,
    training_date text NOT NULL,
    trainer_name text DEFAULT 'Not assigned' NOT NULL,
    facilitator_name text DEFAULT 'Not assigned' NOT NULL,
    created_at text NOT NULL
  )`).run();
  const trainingColumns = await env.DB.prepare("PRAGMA table_info(trainings)").all<{ name: string }>();
  if (!trainingColumns.results.some((column) => column.name === "trainer_name")) {
    await env.DB.prepare("ALTER TABLE trainings ADD COLUMN trainer_name text DEFAULT 'Not assigned' NOT NULL").run();
  }
  if (!trainingColumns.results.some((column) => column.name === "facilitator_name")) {
    await env.DB.prepare("ALTER TABLE trainings ADD COLUMN facilitator_name text DEFAULT 'Not assigned' NOT NULL").run();
  }
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS trainings_title_date_idx ON trainings (title, training_date)").run();
}

export async function ensureAdminUsersTable() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    display_name text DEFAULT 'Administrator' NOT NULL,
    role text DEFAULT 'admin' NOT NULL,
    active integer DEFAULT true NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL
  )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(admin_users)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "role")) {
    await env.DB.prepare("ALTER TABLE admin_users ADD COLUMN role text DEFAULT 'admin' NOT NULL").run();
  }
  if (!columns.results.some((column) => column.name === "active")) {
    await env.DB.prepare("ALTER TABLE admin_users ADD COLUMN active integer DEFAULT true NOT NULL").run();
  }
  if (!columns.results.some((column) => column.name === "updated_at")) {
    await env.DB.prepare("ALTER TABLE admin_users ADD COLUMN updated_at text DEFAULT '' NOT NULL").run();
  }
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_idx ON admin_users (username)").run();
}
