import { and, desc, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { ensureFeedbackTable, getDb } from "../../../db";
import { feedback } from "../../../db/schema";
import { isPostgresConfigured, queryPostgres } from "../../../db/postgres";
import { isStaffAuthorized } from "../../admin-auth";

function clean(value: unknown, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const RESPONDENT_COOKIE = "training_feedback_respondent";
const roundOne = (value: unknown) => Math.round(Number(value) * 10) / 10;

export async function GET(request: Request) {
  if (!(await isStaffAuthorized())) {
    return Response.json({ error: "Staff access required" }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const trainingTitle = clean(url.searchParams.get("trainingTitle"), 160);
    const trainingDate = clean(url.searchParams.get("trainingDate"), 20);
    if (isPostgresConfigured()) {
      const values = trainingTitle && trainingDate ? [trainingTitle, trainingDate] : [];
      const where = values.length ? "WHERE training_title = $1 AND training_date = $2" : "";
      const [summaryRows, trainingRows, recent] = await Promise.all([
        queryPostgres(`SELECT count(*) AS total, coalesce(avg(overall_rating), 0) AS "averageRating",
          coalesce(avg(trainer_rating), 0) AS "averageTrainer", coalesce(avg(clarity_rating), 0) AS "averageClarity",
          coalesce(avg(relevance_rating), 0) AS "averageRelevance", coalesce(avg(confidence_rating), 0) AS "averageConfidence",
          coalesce(100.0 * sum(CASE WHEN recommend_score >= 9 THEN 1 ELSE 0 END) / nullif(count(*), 0), 0) AS "recommendationRate",
          coalesce(100.0 * sum(CASE WHEN overall_rating >= 4 THEN 1 ELSE 0 END) / nullif(count(*), 0), 0) AS "positiveRate"
          FROM feedback ${where}`, values),
        queryPostgres(`SELECT training_title AS "trainingTitle", training_date::text AS "trainingDate", count(*) AS total,
          avg(overall_rating) AS "averageRating", avg(trainer_rating) AS "averageTrainer", avg(clarity_rating) AS "averageClarity",
          avg(relevance_rating) AS "averageRelevance", avg(confidence_rating) AS "averageConfidence",
          100.0 * sum(CASE WHEN recommend_score >= 9 THEN 1 ELSE 0 END) / nullif(count(*), 0) AS "recommendationRate"
          FROM feedback GROUP BY training_title, training_date ORDER BY training_date DESC, training_title DESC`),
        queryPostgres(`SELECT id, training_title AS "trainingTitle", overall_rating AS "overallRating",
          recommend_score AS "recommendScore", highlight, improvement, created_at AS "createdAt"
          FROM feedback ${where} ORDER BY created_at DESC LIMIT 8`, values),
      ]);
      const summary = summaryRows[0] || {};
      return Response.json({
        total: Number(summary.total || 0),
        averageRating: roundOne(summary.averageRating), averageTrainer: roundOne(summary.averageTrainer),
        averageClarity: roundOne(summary.averageClarity), averageRelevance: roundOne(summary.averageRelevance),
        averageConfidence: roundOne(summary.averageConfidence), recommendationRate: Math.round(Number(summary.recommendationRate || 0)),
        positiveRate: Math.round(Number(summary.positiveRate || 0)),
        trainings: trainingRows.map((training) => ({ ...training, total: Number(training.total), averageRating: roundOne(training.averageRating),
          averageTrainer: roundOne(training.averageTrainer), averageClarity: roundOne(training.averageClarity),
          averageRelevance: roundOne(training.averageRelevance), averageConfidence: roundOne(training.averageConfidence),
          recommendationRate: Math.round(Number(training.recommendationRate)) })),
        recent,
      });
    }
    await ensureFeedbackTable();
    const db = getDb();
    const selectedTraining = trainingTitle && trainingDate
      ? and(eq(feedback.trainingTitle, trainingTitle), eq(feedback.trainingDate, trainingDate))
      : undefined;
    const [summary] = await db.select({
      total: sql<number>`count(*)`,
      averageRating: sql<number>`coalesce(avg(${feedback.overallRating}), 0)`,
      averageTrainer: sql<number>`coalesce(avg(${feedback.trainerRating}), 0)`,
      averageClarity: sql<number>`coalesce(avg(${feedback.clarityRating}), 0)`,
      averageRelevance: sql<number>`coalesce(avg(${feedback.relevanceRating}), 0)`,
      averageConfidence: sql<number>`coalesce(avg(${feedback.confidenceRating}), 0)`,
      recommendationRate: sql<number>`coalesce(100.0 * sum(case when ${feedback.recommendScore} >= 9 then 1 else 0 end) / nullif(count(*), 0), 0)`,
      positiveRate: sql<number>`coalesce(100.0 * sum(case when ${feedback.overallRating} >= 4 then 1 else 0 end) / nullif(count(*), 0), 0)`,
    }).from(feedback).where(selectedTraining);
    const trainings = await db.select({
      trainingTitle: feedback.trainingTitle,
      trainingDate: feedback.trainingDate,
      total: sql<number>`count(*)`,
      averageRating: sql<number>`avg(${feedback.overallRating})`,
      averageTrainer: sql<number>`avg(${feedback.trainerRating})`,
      averageClarity: sql<number>`avg(${feedback.clarityRating})`,
      averageRelevance: sql<number>`avg(${feedback.relevanceRating})`,
      averageConfidence: sql<number>`avg(${feedback.confidenceRating})`,
      recommendationRate: sql<number>`100.0 * sum(case when ${feedback.recommendScore} >= 9 then 1 else 0 end) / nullif(count(*), 0)`,
    }).from(feedback).groupBy(feedback.trainingTitle, feedback.trainingDate).orderBy(desc(feedback.trainingDate), desc(feedback.trainingTitle));
    const recent = await db.select({
      id: feedback.id,
      trainingTitle: feedback.trainingTitle,
      overallRating: feedback.overallRating,
      recommendScore: feedback.recommendScore,
      highlight: feedback.highlight,
      improvement: feedback.improvement,
      createdAt: feedback.createdAt,
    }).from(feedback).where(selectedTraining).orderBy(desc(feedback.createdAt)).limit(8);

    return Response.json({
      total: Number(summary.total),
      averageRating: roundOne(summary.averageRating),
      averageTrainer: roundOne(summary.averageTrainer),
      averageClarity: roundOne(summary.averageClarity),
      averageRelevance: roundOne(summary.averageRelevance),
      averageConfidence: roundOne(summary.averageConfidence),
      recommendationRate: Math.round(Number(summary.recommendationRate)),
      positiveRate: Math.round(Number(summary.positiveRate)),
      trainings: trainings.map((training) => ({
        ...training,
        total: Number(training.total),
        averageRating: roundOne(training.averageRating),
        averageTrainer: roundOne(training.averageTrainer),
        averageClarity: roundOne(training.averageClarity),
        averageRelevance: roundOne(training.averageRelevance),
        averageConfidence: roundOne(training.averageConfidence),
        recommendationRate: Math.round(Number(training.recommendationRate)),
      })),
      recent,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load feedback" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const trainingTitle = clean(body.trainingTitle, 160);
    const trainingDate = clean(body.trainingDate, 20);
    const overallRating = Number(body.overallRating);
    const recommendScore = Number(body.recommendScore);
    if (!trainingTitle || !trainingDate || overallRating < 1 || overallRating > 5 || recommendScore < 0 || recommendScore > 10) {
      return Response.json({ error: "Please complete all required fields." }, { status: 400 });
    }
    const anonymous = body.anonymous !== false;
    const cookieStore = await cookies();
    const respondentToken = cookieStore.get(RESPONDENT_COOKIE)?.value || crypto.randomUUID();
    if (isPostgresConfigured()) {
      const existing = await queryPostgres<{ id: number }>("SELECT id FROM feedback WHERE respondent_token = $1 AND training_title = $2 AND training_date = $3 LIMIT 1", [respondentToken, trainingTitle, trainingDate]);
      if (existing[0]) return Response.json({ error: "You have already submitted feedback for this training." }, { status: 409 });
      const saved = await queryPostgres<{ id: number }>(`INSERT INTO feedback
        (training_title, training_date, participant_name, department, overall_rating, trainer_rating, clarity_rating,
        relevance_rating, confidence_rating, recommend_score, highlight, improvement, anonymous, respondent_token)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`, [
        trainingTitle, trainingDate, anonymous ? null : clean(body.participantName, 120) || null,
        clean(body.department, 120) || null, overallRating, Math.min(5, Math.max(1, Number(body.trainerRating) || 3)),
        Math.min(5, Math.max(1, Number(body.clarityRating) || 3)), Math.min(5, Math.max(1, Number(body.relevanceRating) || 3)),
        Math.min(5, Math.max(1, Number(body.confidenceRating) || 3)), recommendScore, clean(body.highlight) || null,
        clean(body.improvement) || null, anonymous, respondentToken,
      ]);
      cookieStore.set(RESPONDENT_COOKIE, respondentToken, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 * 2 });
      return Response.json({ id: saved[0].id }, { status: 201 });
    }
    await ensureFeedbackTable();
    const db = getDb();
    const [existing] = await db.select({ id: feedback.id }).from(feedback).where(and(
      eq(feedback.respondentToken, respondentToken),
      eq(feedback.trainingTitle, trainingTitle),
      eq(feedback.trainingDate, trainingDate),
    )).limit(1);
    if (existing) {
      return Response.json({ error: "You have already submitted feedback for this training." }, { status: 409 });
    }
    const [saved] = await db.insert(feedback).values({
      trainingTitle,
      trainingDate,
      participantName: anonymous ? null : clean(body.participantName, 120) || null,
      department: clean(body.department, 120) || null,
      overallRating,
      trainerRating: Math.min(5, Math.max(1, Number(body.trainerRating) || 3)),
      clarityRating: Math.min(5, Math.max(1, Number(body.clarityRating) || 3)),
      relevanceRating: Math.min(5, Math.max(1, Number(body.relevanceRating) || 3)),
      confidenceRating: Math.min(5, Math.max(1, Number(body.confidenceRating) || 3)),
      recommendScore,
      highlight: clean(body.highlight) || null,
      improvement: clean(body.improvement) || null,
      anonymous,
      respondentToken,
    }).returning({ id: feedback.id });
    cookieStore.set(RESPONDENT_COOKIE, respondentToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 2,
    });
    return Response.json({ id: saved.id }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505" || (error instanceof Error && error.message.toLowerCase().includes("unique"))) {
      return Response.json({ error: "You have already submitted feedback for this training." }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save feedback" }, { status: 500 });
  }
}
