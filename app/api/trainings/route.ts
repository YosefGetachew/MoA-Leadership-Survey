import { and, desc, eq } from "drizzle-orm";
import { ensureFeedbackTable, ensureTrainingsTable, getDb } from "../../../db";
import { feedback, trainings } from "../../../db/schema";
import { isPostgresConfigured, queryPostgres, withPostgresTransaction } from "../../../db/postgres";
import { isStaffAuthorized } from "../../admin-auth";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  try {
    if (isPostgresConfigured()) {
      const rows = await queryPostgres(`SELECT id, title, training_date::text AS "trainingDate",
        trainer_name AS "trainerName", facilitator_name AS "facilitatorName", created_at AS "createdAt"
        FROM trainings ORDER BY training_date DESC, id DESC`);
      return Response.json({ trainings: rows });
    }
    await ensureTrainingsTable();
    const db = getDb();
    const rows = await db.select().from(trainings).orderBy(desc(trainings.trainingDate), desc(trainings.id));
    return Response.json({ trainings: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load trainings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isStaffAuthorized())) {
    return Response.json({ error: "Staff access required" }, { status: 401 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const title = clean(body.title, 160);
    const trainingDate = clean(body.trainingDate, 20);
    const trainerName = clean(body.trainerName, 120);
    const facilitatorName = clean(body.facilitatorName, 120);
    if (!title || !trainerName || !facilitatorName || !/^\d{4}-\d{2}-\d{2}$/.test(trainingDate)) {
      return Response.json({ error: "Title, date, trainer and facilitator are required." }, { status: 400 });
    }
    if (isPostgresConfigured()) {
      const existing = await queryPostgres<{ id: number }>("SELECT id FROM trainings WHERE title = $1 AND training_date = $2 LIMIT 1", [title, trainingDate]);
      if (existing[0]) {
        const updated = await queryPostgres(`UPDATE trainings SET trainer_name = $1, facilitator_name = $2 WHERE id = $3
          RETURNING id, title, training_date::text AS "trainingDate", trainer_name AS "trainerName", facilitator_name AS "facilitatorName", created_at AS "createdAt"`, [trainerName, facilitatorName, existing[0].id]);
        return Response.json({ training: updated[0], updated: true });
      }
      const saved = await queryPostgres(`INSERT INTO trainings (title, training_date, trainer_name, facilitator_name)
        VALUES ($1, $2, $3, $4) RETURNING id, title, training_date::text AS "trainingDate", trainer_name AS "trainerName", facilitator_name AS "facilitatorName", created_at AS "createdAt"`, [title, trainingDate, trainerName, facilitatorName]);
      return Response.json({ training: saved[0] }, { status: 201 });
    }
    await ensureTrainingsTable();
    const db = getDb();
    const [existing] = await db.select({ id: trainings.id }).from(trainings).where(and(eq(trainings.title, title), eq(trainings.trainingDate, trainingDate))).limit(1);
    if (existing) {
      const [updated] = await db.update(trainings).set({ trainerName, facilitatorName }).where(eq(trainings.id, existing.id)).returning();
      return Response.json({ training: updated, updated: true });
    }
    const [saved] = await db.insert(trainings).values({ title, trainingDate, trainerName, facilitatorName }).returning();
    return Response.json({ training: saved }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to add training" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isStaffAuthorized())) {
    return Response.json({ error: "Staff access required" }, { status: 401 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    const title = clean(body.title, 160);
    const trainingDate = clean(body.trainingDate, 20);
    const trainerName = clean(body.trainerName, 120);
    const facilitatorName = clean(body.facilitatorName, 120);
    if (!Number.isInteger(id) || !title || !trainerName || !facilitatorName || !/^\d{4}-\d{2}-\d{2}$/.test(trainingDate)) {
      return Response.json({ error: "A valid training profile is required." }, { status: 400 });
    }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" });
    if (isPostgresConfigured()) {
      const result = await withPostgresTransaction(async (client) => {
        const currentResult = await client.query<{ id: number; title: string; trainingDate: string }>(
          `SELECT id, title, training_date::text AS "trainingDate" FROM trainings WHERE id = $1 LIMIT 1`, [id]);
        const current = currentResult.rows[0];
        if (!current) return { error: "Training not found.", status: 404 } as const;
        if (current.trainingDate <= today) return { error: "This training can no longer be edited because its date has arrived.", status: 403 } as const;
        if (trainingDate < today) return { error: "The updated training date cannot be in the past.", status: 400 } as const;
        const duplicate = await client.query<{ id: number }>("SELECT id FROM trainings WHERE title = $1 AND training_date = $2 AND id <> $3 LIMIT 1", [title, trainingDate, id]);
        if (duplicate.rows[0]) return { error: "Another training already uses this title and date.", status: 409 } as const;
        const updated = await client.query(`UPDATE trainings SET title = $1, training_date = $2, trainer_name = $3, facilitator_name = $4 WHERE id = $5
          RETURNING id, title, training_date::text AS "trainingDate", trainer_name AS "trainerName", facilitator_name AS "facilitatorName", created_at AS "createdAt"`, [title, trainingDate, trainerName, facilitatorName, id]);
        await client.query("UPDATE feedback SET training_title = $1, training_date = $2 WHERE training_title = $3 AND training_date = $4", [title, trainingDate, current.title, current.trainingDate]);
        return { training: updated.rows[0] };
      });
      if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
      return Response.json(result);
    }
    await ensureTrainingsTable();
    await ensureFeedbackTable();
    const db = getDb();
    const [current] = await db.select().from(trainings).where(eq(trainings.id, id)).limit(1);
    if (!current) return Response.json({ error: "Training not found." }, { status: 404 });
    if (current.trainingDate <= today) {
      return Response.json({ error: "This training can no longer be edited because its date has arrived." }, { status: 403 });
    }
    if (trainingDate < today) {
      return Response.json({ error: "The updated training date cannot be in the past." }, { status: 400 });
    }
    const [duplicate] = await db.select({ id: trainings.id }).from(trainings).where(and(eq(trainings.title, title), eq(trainings.trainingDate, trainingDate))).limit(1);
    if (duplicate && duplicate.id !== id) {
      return Response.json({ error: "Another training already uses this title and date." }, { status: 409 });
    }
    const [updated] = await db.update(trainings).set({ title, trainingDate, trainerName, facilitatorName }).where(eq(trainings.id, id)).returning();
    await db.update(feedback).set({ trainingTitle: title, trainingDate }).where(and(eq(feedback.trainingTitle, current.title), eq(feedback.trainingDate, current.trainingDate)));
    return Response.json({ training: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update training" }, { status: 500 });
  }
}
