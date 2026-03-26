import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Items table - individual clothing pieces
export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  subCategory: text("sub_category"),
  brand: text("brand"),
  size: text("size"),
  color: text("color"),
  imageUrl: text("image_url"),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Outfits table - full outfit photos with metadata
export const outfits = pgTable("outfits", {
  id: serial("id").primaryKey(),
  dateWorn: date("date_worn").notNull(),
  fullImageUrl: text("full_image_url").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Outfit_Items link table - Many-to-Many relationship
export const outfitItems = pgTable("outfit_items", {
  id: serial("id").primaryKey(),
  outfitId: integer("outfit_id").notNull().references(() => outfits.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
});

// Relations
export const itemsRelations = relations(items, ({ many }) => ({
  outfitItems: many(outfitItems),
}));

export const outfitsRelations = relations(outfits, ({ many }) => ({
  outfitItems: many(outfitItems),
}));

export const outfitItemsRelations = relations(outfitItems, ({ one }) => ({
  outfit: one(outfits, {
    fields: [outfitItems.outfitId],
    references: [outfits.id],
  }),
  item: one(items, {
    fields: [outfitItems.itemId],
    references: [items.id],
  }),
}));

// Insert schemas
export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  createdAt: true,
});

export const insertOutfitSchema = createInsertSchema(outfits).omit({
  id: true,
  createdAt: true,
});

export const insertOutfitItemSchema = createInsertSchema(outfitItems).omit({
  id: true,
});

// Types
export type Item = typeof items.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Outfit = typeof outfits.$inferSelect;
export type InsertOutfit = z.infer<typeof insertOutfitSchema>;
export type OutfitItem = typeof outfitItems.$inferSelect;
export type InsertOutfitItem = z.infer<typeof insertOutfitItemSchema>;

// AI Detection result type
export const detectedItemSchema = z.object({
  category: z.string(),
  subCategory: z.string(),
  color: z.string(),
  description: z.string(),
});

export type DetectedItem = z.infer<typeof detectedItemSchema>;

// Activity log table
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // "created" | "deleted"
  entityType: text("entity_type").notNull(), // "outfit" | "item"
  entityId: integer("entity_id").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type ActivityLogEntry = typeof activityLog.$inferSelect;

// Keep existing users table for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
