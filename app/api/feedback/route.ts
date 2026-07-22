import { desc, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { feedback } from "../../../db/schema";

function clean(value: unknown, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  try {
    const db = getDb();
    const [summary] = await db.select({
      total: sql<number>`count(*)`,
      averageRating: sql<number>`coalesce(avg(${feedback.overallRating}), 0)`,
      recommendationRate: sql<number>`coalesce(100.0 * sum(case when ${feedback.recommendScore} >= 9 then 1 else 0 end) / nullif(count(*), 0), 0)`,
      positiveRate: sql<number>`coalesce(100.0 * sum(case when ${feedback.overallRating} >= 4 then 1 else 0 end) / nullif(count(*), 0), 0)`,
    }).from(feedback);
    const recent = await db.select({
      id: feedback.id,
      trainingTitle: feedback.trainingTitle,
      overallRating: feedback.overallRating,
      recommendScore: feedback.recommendScore,
      highlight: feedback.highlight,
      improvement: feedback.improvement,
      createdAt: feedback.createdAt,
    }).from(feedback).orderBy(desc(feedback.createdAt)).limit(8);

    return Response.json({
      total: Number(summary.total),
      averageRating: Math.round(Number(summary.averageRating) * 10) / 10,
      recommendationRate: Math.round(Number(summary.recommendationRate)),
      positiveRate: Math.round(Number(summary.positiveRate)),
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
    const db = getDb();
    const [saved] = await db.insert(feedback).values({
      trainingTitle,
      trainingDate,
      participantName: anonymous ? null : clean(body.participantName, 120) || null,
      department: clean(body.department, 120) || null,
      overallRating,
      clarityRating: Math.min(5, Math.max(1, Number(body.clarityRating) || 3)),
      relevanceRating: Math.min(5, Math.max(1, Number(body.relevanceRating) || 3)),
      confidenceRating: Math.min(5, Math.max(1, Number(body.confidenceRating) || 3)),
      recommendScore,
      highlight: clean(body.highlight) || null,
      improvement: clean(body.improvement) || null,
      anonymous,
    }).returning({ id: feedback.id });
    return Response.json({ id: saved.id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save feedback" }, { status: 500 });
  }
}
