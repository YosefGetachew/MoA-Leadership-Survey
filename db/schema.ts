import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trainingTitle: text("training_title").notNull(),
  trainingDate: text("training_date").notNull(),
  participantName: text("participant_name"),
  department: text("department"),
  overallRating: integer("overall_rating").notNull(),
  clarityRating: integer("clarity_rating").notNull(),
  relevanceRating: integer("relevance_rating").notNull(),
  confidenceRating: integer("confidence_rating").notNull(),
  recommendScore: integer("recommend_score").notNull(),
  highlight: text("highlight"),
  improvement: text("improvement"),
  anonymous: integer("anonymous", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});
