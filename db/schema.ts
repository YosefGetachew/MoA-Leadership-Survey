import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trainingTitle: text("training_title").notNull(),
  trainingDate: text("training_date").notNull(),
  participantName: text("participant_name"),
  department: text("department"),
  overallRating: integer("overall_rating").notNull(),
  trainerRating: integer("trainer_rating").notNull().default(3),
  clarityRating: integer("clarity_rating").notNull(),
  relevanceRating: integer("relevance_rating").notNull(),
  confidenceRating: integer("confidence_rating").notNull(),
  recommendScore: integer("recommend_score").notNull(),
  highlight: text("highlight"),
  improvement: text("improvement"),
  anonymous: integer("anonymous", { mode: "boolean" }).notNull().default(true),
  respondentToken: text("respondent_token"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("feedback_respondent_training_idx").on(table.respondentToken, table.trainingTitle, table.trainingDate),
]);

export const trainings = sqliteTable("trainings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  trainingDate: text("training_date").notNull(),
  trainerName: text("trainer_name").notNull().default("Not assigned"),
  facilitatorName: text("facilitator_name").notNull().default("Not assigned"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("trainings_title_date_idx").on(table.title, table.trainingDate),
]);

export const adminUsers = sqliteTable("admin_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().default("Administrator"),
  role: text("role").notNull().default("admin"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("admin_users_username_idx").on(table.username),
]);
