DELETE FROM "outfit" duplicate
USING "outfit" kept
WHERE duplicate."user_id" = kept."user_id"
  AND duplicate."top_id" = kept."top_id"
  AND duplicate."bottom_id" = kept."bottom_id"
  AND duplicate."id" > kept."id";
--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_user_top_bottom_unique" UNIQUE("user_id","top_id","bottom_id");
