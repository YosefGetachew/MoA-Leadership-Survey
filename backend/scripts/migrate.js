const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const { pool, ensureSchema } = require("../config/db");

function hashPassword(password) {
  const iterations = 210_000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2_sha256$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function migrate() {
  await ensureSchema();
  const username = process.env.MINISTRY_ADMIN_USERNAME?.trim();
  const password = process.env.MINISTRY_ADMIN_PASSWORD;
  if (username && password) {
    await pool.query(
      `INSERT INTO admin_users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (lower(username)) DO UPDATE
       SET password_hash = excluded.password_hash,
           display_name = excluded.display_name,
           role = 'admin',
           active = true`,
      [username, hashPassword(password), "Ministry Administrator"],
    );
  }
  console.log("MoA leadership survey PostgreSQL migration complete.");
}

migrate()
  .catch((error) => {
    console.error("PostgreSQL migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
