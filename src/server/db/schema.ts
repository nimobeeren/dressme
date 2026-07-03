import { relations } from "drizzle-orm";
import { index, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  auth0UserId: varchar("auth0_user_id").notNull().unique(),
  selfieImageKey: varchar("selfie_image_key"),
  avatarImageKey: varchar("avatar_image_key"),
});

export const wearables = pgTable(
  "wearable",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    category: varchar("category").notNull(),
    imageKey: varchar("image_key").notNull(),
  },
  (table) => [index("wearable_user_id_idx").on(table.userId)],
);

export const wearableOnAvatarImages = pgTable(
  "wearableonavatarimage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    avatarImageKey: varchar("avatar_image_key").notNull(),
    wearableImageKey: varchar("wearable_image_key").notNull(),
    imageKey: varchar("image_key").notNull(),
    maskImageKey: varchar("mask_image_key").notNull(),
  },
  (table) => [
    index("woa_user_id_idx").on(table.userId),
    index("woa_avatar_image_key_idx").on(table.avatarImageKey),
    index("woa_wearable_image_key_idx").on(table.wearableImageKey),
  ],
);

export const outfits = pgTable(
  "outfit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    topId: uuid("top_id")
      .notNull()
      .references(() => wearables.id),
    bottomId: uuid("bottom_id")
      .notNull()
      .references(() => wearables.id),
  },
  (table) => [index("outfit_user_id_idx").on(table.userId)],
);

export const outfitsRelations = relations(outfits, ({ one }) => ({
  top: one(wearables, {
    fields: [outfits.topId],
    references: [wearables.id],
  }),
  bottom: one(wearables, {
    fields: [outfits.bottomId],
    references: [wearables.id],
  }),
}));
