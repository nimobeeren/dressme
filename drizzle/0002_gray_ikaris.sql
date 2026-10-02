ALTER TABLE "user" RENAME COLUMN "auth0_user_id" TO "clerk_user_id";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_auth0_user_id_unique";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_clerk_user_id_unique" UNIQUE("clerk_user_id");