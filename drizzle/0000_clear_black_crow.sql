CREATE TABLE "outfit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"top_id" uuid NOT NULL,
	"bottom_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth0_user_id" varchar NOT NULL,
	"selfie_image_key" varchar,
	"avatar_image_key" varchar,
	CONSTRAINT "user_auth0_user_id_unique" UNIQUE("auth0_user_id")
);
--> statement-breakpoint
CREATE TABLE "wearableonavatarimage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"avatar_image_key" varchar NOT NULL,
	"wearable_image_key" varchar NOT NULL,
	"image_key" varchar NOT NULL,
	"mask_image_key" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wearable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar NOT NULL,
	"image_key" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_top_id_wearable_id_fk" FOREIGN KEY ("top_id") REFERENCES "public"."wearable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_bottom_id_wearable_id_fk" FOREIGN KEY ("bottom_id") REFERENCES "public"."wearable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wearableonavatarimage" ADD CONSTRAINT "wearableonavatarimage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wearable" ADD CONSTRAINT "wearable_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outfit_user_id_idx" ON "outfit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "woa_user_id_idx" ON "wearableonavatarimage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "woa_avatar_image_key_idx" ON "wearableonavatarimage" USING btree ("avatar_image_key");--> statement-breakpoint
CREATE INDEX "woa_wearable_image_key_idx" ON "wearableonavatarimage" USING btree ("wearable_image_key");--> statement-breakpoint
CREATE INDEX "wearable_user_id_idx" ON "wearable" USING btree ("user_id");