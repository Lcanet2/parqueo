-- Index des clés étrangères et des colonnes de filtre/tri. PostgreSQL n'indexe
-- pas les clés étrangères de lui-même : sans eux, la visibilité par rôle, les
-- filtres de la liste et le fil d'un ticket parcouraient la table entière.

-- CreateIndex
CREATE INDEX "assets_assigned_user_id_idx" ON "assets"("assigned_user_id");

-- CreateIndex
CREATE INDEX "attachments_ticket_id_idx" ON "attachments"("ticket_id");

-- CreateIndex
CREATE INDEX "form_fields_form_id_idx" ON "form_fields"("form_id");

-- CreateIndex
CREATE INDEX "ticket_comments_ticket_id_idx" ON "ticket_comments"("ticket_id");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_author_id_idx" ON "tickets"("author_id");

-- CreateIndex
CREATE INDEX "tickets_assignee_id_idx" ON "tickets"("assignee_id");

-- CreateIndex
CREATE INDEX "tickets_team_id_idx" ON "tickets"("team_id");

-- CreateIndex
CREATE INDEX "tickets_category_id_idx" ON "tickets"("category_id");

-- CreateIndex
CREATE INDEX "tickets_asset_id_idx" ON "tickets"("asset_id");

-- CreateIndex
CREATE INDEX "tickets_updated_at_idx" ON "tickets"("updated_at");

-- CreateIndex
CREATE INDEX "workflow_steps_workflow_id_idx" ON "workflow_steps"("workflow_id");

