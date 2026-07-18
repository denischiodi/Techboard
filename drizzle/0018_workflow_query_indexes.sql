CREATE INDEX IF NOT EXISTS "scope_items_project_idx" ON "scope_items" ("projectId");
CREATE INDEX IF NOT EXISTS "bdcq_questions_project_sort_idx" ON "bdcq_questions" ("projectId", "sortOrder");
CREATE INDEX IF NOT EXISTS "bdcq_answers_project_question_idx" ON "bdcq_answers" ("projectId", "questionId");
CREATE INDEX IF NOT EXISTS "workshops_project_date_idx" ON "workshops" ("projectId", "scheduledDate");
CREATE INDEX IF NOT EXISTS "client_requirements_project_workshop_idx" ON "client_requirements" ("projectId", "workshopId");
CREATE INDEX IF NOT EXISTS "dcd_documents_project_status_idx" ON "dcd_documents" ("projectId", "status");
CREATE INDEX IF NOT EXISTS "gaps_project_status_idx" ON "gaps" ("projectId", "status");
CREATE INDEX IF NOT EXISTS "configurations_project_status_idx" ON "configurations" ("projectId", "status");
