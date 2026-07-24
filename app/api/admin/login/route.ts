import { cookies } from "next/headers";
import { ADMIN_COOKIE, createStaffSession, type StaffRole } from "../../../admin-auth";
import { isPostgresConfigured, queryPostgres } from "../../../../db/postgres";
import { hashPassword, verifyPassword } from "../../../password";
import { adminUsers } from "../../../../db/schema";
import { ensureAdminUsersTable, getDb } from "../../../../db";
import { sql } from "drizzle-orm";

export async function POST(request: Request) {
  const { username, password } = await request.json() as { username?: string; password?: string };
  const expectedUsername = process.env.MINISTRY_ADMIN_USERNAME;
  const expectedPassword = process.env.MINISTRY_ADMIN_PASSWORD;
  const sessionToken = process.env.MINISTRY_ADMIN_SESSION;
  if (!sessionToken) {
    return Response.json({ error: "Staff access is not configured." }, { status: 503 });
  }
  let authorized = false;
  let role: StaffRole = "admin";
  let displayName = "Administrator";
  let authenticatedUsername = username?.trim() || "";
  if (isPostgresConfigured()) {
    const rows = await queryPostgres<{ username: string; passwordHash: string; active: boolean; role: StaffRole; displayName: string }>(
      `SELECT username, password_hash AS "passwordHash", active, role, display_name AS "displayName"
       FROM admin_users WHERE lower(username) = lower($1) LIMIT 1`,
      [username?.trim() || ""],
    );
    authorized = Boolean(rows[0]?.active && password && await verifyPassword(password, rows[0].passwordHash));
    if (rows[0]) {
      role = rows[0].role;
      displayName = rows[0].displayName;
      authenticatedUsername = rows[0].username;
    }
  } else {
    await ensureAdminUsersTable();
    const db = getDb();
    if (expectedUsername && expectedPassword) {
      const seeded = await db.select({ id: adminUsers.id }).from(adminUsers)
        .where(sql`lower(${adminUsers.username}) = lower(${expectedUsername})`).limit(1);
      if (!seeded[0]) {
        await db.insert(adminUsers).values({
          username: expectedUsername,
          passwordHash: await hashPassword(expectedPassword),
          displayName: "Administrator",
          role: "admin",
        });
      }
    }
    const rows = await db.select().from(adminUsers)
      .where(sql`lower(${adminUsers.username}) = lower(${username?.trim() || ""})`).limit(1);
    authorized = Boolean(rows[0]?.active && password && await verifyPassword(password, rows[0].passwordHash));
    if (rows[0]) {
      role = rows[0].role as StaffRole;
      displayName = rows[0].displayName;
      authenticatedUsername = rows[0].username;
    }
  }
  if (!authorized) {
    return Response.json({ error: "Incorrect username or password." }, { status: 401 });
  }
  (await cookies()).set(ADMIN_COOKIE, await createStaffSession({ username: authenticatedUsername, displayName, role }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return Response.json({ authorized: true, username: authenticatedUsername, displayName, role });
}
