CREATE TABLE IF NOT EXISTS "bdcq_answer_history" (
  "id" varchar(64) PRIMARY KEY,
  "answerId" varchar(64) NOT NULL,
  "questionId" varchar(64) NOT NULL,
  "projectId" varchar(64) NOT NULL,
  "answer" text NOT NULL,
  "answeredBy" varchar(255) DEFAULT '' NOT NULL,
  "changedBy" varchar(255) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bdcq_answer_history_answer_idx" ON "bdcq_answer_history" ("answerId", "createdAt");
