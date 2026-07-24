import { getStaffSession, type StaffRole } from "../../../admin-auth";
import { hashPassword } from "../../../password";
import { isPostgresConfigured, queryPostgres } from "../../../../db/postgres";
import { adminUsers } from "../../../../db/schema";
import { ensureAdminUsersTable, getDb } from "../../../../db";
import { desc, sql } from "drizzle-orm";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function requireAdministrator() {
  const session = await getStaffSession();
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await requireAdministrator())) return Response.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const users = isPostgresConfigured()
      ? await queryPostgres(`SELECT id, username, display_name AS "displayName", role, active, created_at AS "createdAt"
          FROM admin_users ORDER BY created_at DESC, id DESC`)
      : await (async () => {
          await ensureAdminUsersTable();
          return getDb().select({
            id: adminUsers.id,
            username: adminUsers.username,
            displayName: adminUsers.displayName,
            role: adminUsers.role,
            active: adminUsers.active,
            createdAt: adminUsers.createdAt,
          }).from(adminUsers).orderBy(desc(adminUsers.createdAt), desc(adminUsers.id));
        })();
    return Response.json({ users });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await requireAdministrator())) return Response.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const username = clean(body.username, 80);
    const displayName = clean(body.displayName, 120);
    const password = typeof body.password === "string" ? body.password : "";
    const role = clean(body.role, 30) as StaffRole;
    if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username) || !displayName || password.length < 8 || !["admin", "data_encoder"].includes(role)) {
      return Response.json({ error: "Enter a valid username, display name, role and password of at least 8 characters." }, { status: 400 });
    }
    const duplicate = isPostgresConfigured()
      ? await queryPostgres<{ id: number }>("SELECT id FROM admin_users WHERE lower(username) = lower($1) LIMIT 1", [username])
      : await (async () => {
          await ensureAdminUsersTable();
          return getDb().select({ id: adminUsers.id }).from(adminUsers)
            .where(sql`lower(${adminUsers.username}) = lower(${username})`).limit(1);
        })();
    if (duplicate[0]) return Response.json({ error: "That username already exists." }, { status: 409 });
    const passwordHash = await hashPassword(password);
    const users = isPostgresConfigured()
      ? await queryPostgres(`INSERT INTO admin_users (username, password_hash, display_name, role)
          VALUES ($1, $2, $3, $4)
          RETURNING id, username, display_name AS "displayName", role, active, created_at AS "createdAt"`,
          [username, passwordHash, displayName, role])
      : await getDb().insert(adminUsers).values({ username, passwordHash, displayName, role }).returning({
          id: adminUsers.id,
          username: adminUsers.username,
          displayName: adminUsers.displayName,
          role: adminUsers.role,
          active: adminUsers.active,
          createdAt: adminUsers.createdAt,
        });
    return Response.json({ user: users[0] }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505" || String(error).includes("UNIQUE constraint failed")) {
      return Response.json({ error: "That username already exists." }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to add user." }, { status: 500 });
  }
}
