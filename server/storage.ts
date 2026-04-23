import {
  items,
  outfits,
  outfitItems,
  activityLog,
  type Item,
  type InsertItem,
  type Outfit,
  type InsertOutfit,
  type OutfitItem,
  type InsertOutfitItem,
  type ActivityLogEntry,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, isNull, and, inArray } from "drizzle-orm";

export interface IStorage {
  // Items
  getAllItems(userId: string): Promise<Item[]>;
  getItem(id: number, userId: string): Promise<Item | undefined>;
  getItemWithOutfits(id: number, userId: string): Promise<(Item & { outfits: Outfit[] }) | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: number, userId: string, item: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(id: number, userId: string): Promise<void>;

  // Outfits
  getAllOutfitsWithCounts(userId: string): Promise<(Outfit & { itemCount: number })[]>;
  getAllOutfits(userId: string): Promise<Outfit[]>;
  getOutfit(id: number, userId: string): Promise<Outfit | undefined>;
  getOutfitWithItems(id: number, userId: string): Promise<(Outfit & { items: Item[] }) | undefined>;
  createOutfit(outfit: InsertOutfit): Promise<Outfit>;
  updateOutfit(id: number, userId: string, outfit: Partial<InsertOutfit>): Promise<Outfit | undefined>;
  deleteOutfit(id: number, userId: string): Promise<void>;

  // Outfit Items (linking) - ownership verified via outfitId ownership
  addItemsToOutfit(outfitId: number, itemIds: number[], userId: string): Promise<void>;
  replaceItemsOnOutfit(outfitId: number, itemIds: number[], userId: string): Promise<void>;
  removeItemFromOutfit(outfitId: number, itemId: number, userId: string): Promise<void>;
  getOutfitsByItem(itemId: number, userId: string): Promise<Outfit[]>;

  // Activity log
  getActivityLog(userId: string): Promise<ActivityLogEntry[]>;

  // Data migration: claim orphaned records for first user
  claimOrphanedRecords(userId: string): Promise<void>;
  hasOrphanedRecords(): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Items
  async getAllItems(userId: string): Promise<Item[]> {
    return db.select().from(items).where(eq(items.userId, userId)).orderBy(desc(items.createdAt));
  }

  async getItem(id: number, userId: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, userId)));
    return item;
  }

  async getItemWithOutfits(id: number, userId: string): Promise<(Item & { outfits: Outfit[] }) | undefined> {
    const [item] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, userId)));
    if (!item) return undefined;

    const linkedOutfits = await db
      .select({ outfit: outfits })
      .from(outfitItems)
      .innerJoin(outfits, eq(outfitItems.outfitId, outfits.id))
      .where(and(eq(outfitItems.itemId, id), eq(outfits.userId, userId)))
      .orderBy(desc(outfits.dateWorn));

    return {
      ...item,
      outfits: linkedOutfits.map((row) => row.outfit),
    };
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning();
    const descText = [newItem.color, newItem.subCategory || newItem.category, newItem.brand].filter(Boolean).join(" ");
    await db.insert(activityLog).values({ action: "created", entityType: "item", entityId: newItem.id, description: descText, userId: newItem.userId });
    return newItem;
  }

  async updateItem(id: number, userId: string, item: Partial<InsertItem>): Promise<Item | undefined> {
    const [updated] = await db.update(items).set(item).where(and(eq(items.id, id), eq(items.userId, userId))).returning();
    return updated;
  }

  async deleteItem(id: number, userId: string): Promise<void> {
    const [item] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, userId)));
    if (item) {
      const descText = [item.color, item.subCategory || item.category, item.brand].filter(Boolean).join(" ");
      await db.insert(activityLog).values({ action: "deleted", entityType: "item", entityId: id, description: descText, userId: item.userId });
      await db.delete(outfitItems).where(eq(outfitItems.itemId, id));
      await db.delete(items).where(eq(items.id, id));
    }
  }

  // Outfits
  async getAllOutfitsWithCounts(userId: string): Promise<(Outfit & { itemCount: number })[]> {
    const result = await db
      .select({
        id: outfits.id,
        userId: outfits.userId,
        dateWorn: outfits.dateWorn,
        fullImageUrl: outfits.fullImageUrl,
        originalImageUrl: outfits.originalImageUrl,
        notes: outfits.notes,
        createdAt: outfits.createdAt,
        itemCount: sql<number>`cast(count(${outfitItems.id}) as int)`,
      })
      .from(outfits)
      .leftJoin(outfitItems, eq(outfits.id, outfitItems.outfitId))
      .where(eq(outfits.userId, userId))
      .groupBy(outfits.id)
      .orderBy(desc(outfits.dateWorn));
    return result;
  }

  async getAllOutfits(userId: string): Promise<Outfit[]> {
    return db.select().from(outfits).where(eq(outfits.userId, userId)).orderBy(desc(outfits.dateWorn));
  }

  async getOutfit(id: number, userId: string): Promise<Outfit | undefined> {
    const [outfit] = await db.select().from(outfits).where(and(eq(outfits.id, id), eq(outfits.userId, userId)));
    return outfit;
  }

  async getOutfitWithItems(id: number, userId: string): Promise<(Outfit & { items: Item[] }) | undefined> {
    const [outfit] = await db.select().from(outfits).where(and(eq(outfits.id, id), eq(outfits.userId, userId)));
    if (!outfit) return undefined;

    // Only return items that belong to this user (prevents cross-user item leakage)
    const linkedItems = await db
      .select({ item: items })
      .from(outfitItems)
      .innerJoin(items, and(eq(outfitItems.itemId, items.id), eq(items.userId, userId)))
      .where(eq(outfitItems.outfitId, id));

    return {
      ...outfit,
      items: linkedItems.map((row) => row.item),
    };
  }

  async createOutfit(outfit: InsertOutfit): Promise<Outfit> {
    const [newOutfit] = await db.insert(outfits).values(outfit).returning();
    await db.insert(activityLog).values({ action: "created", entityType: "outfit", entityId: newOutfit.id, description: `Outfit from ${newOutfit.dateWorn}`, userId: newOutfit.userId });
    return newOutfit;
  }

  async updateOutfit(id: number, userId: string, outfit: Partial<InsertOutfit>): Promise<Outfit | undefined> {
    const [updated] = await db.update(outfits).set(outfit).where(and(eq(outfits.id, id), eq(outfits.userId, userId))).returning();
    return updated;
  }

  async deleteOutfit(id: number, userId: string): Promise<void> {
    const [outfit] = await db.select().from(outfits).where(and(eq(outfits.id, id), eq(outfits.userId, userId)));
    if (outfit) {
      await db.insert(activityLog).values({ action: "deleted", entityType: "outfit", entityId: id, description: `Outfit from ${outfit.dateWorn}`, userId: outfit.userId });
      await db.delete(outfitItems).where(eq(outfitItems.outfitId, id));
      await db.delete(outfits).where(eq(outfits.id, id));
    }
  }

  // Outfit Items linking - verify outfit AND item ownership before mutating
  async addItemsToOutfit(outfitId: number, itemIds: number[], userId: string): Promise<void> {
    if (itemIds.length === 0) return;
    // Verify outfit ownership
    const [outfit] = await db.select().from(outfits).where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)));
    if (!outfit) return;
    // Verify all items belong to this user — reject any that don't
    if (itemIds.length > 0) {
      const ownedItems = await db.select({ id: items.id }).from(items)
        .where(and(eq(items.userId, userId), inArray(items.id, itemIds)));
      const ownedIds = new Set(ownedItems.map((i) => i.id));
      const allOwned = itemIds.every((id) => ownedIds.has(id));
      if (!allOwned) return; // silently reject if any item doesn't belong to user
    }
    const values = itemIds.map((itemId) => ({ outfitId, itemId }));
    await db.insert(outfitItems).values(values);
  }

  async replaceItemsOnOutfit(outfitId: number, itemIds: number[], userId: string): Promise<void> {
    // Verify outfit ownership
    const [outfit] = await db.select().from(outfits).where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)));
    if (!outfit) return;
    // Verify all items belong to this user — reject any that don't
    if (itemIds.length > 0) {
      const ownedItems = await db.select({ id: items.id }).from(items)
        .where(and(eq(items.userId, userId), inArray(items.id, itemIds)));
      const ownedIds = new Set(ownedItems.map((i) => i.id));
      const allOwned = itemIds.every((id) => ownedIds.has(id));
      if (!allOwned) return; // silently reject if any item doesn't belong to user
    }
    await db.delete(outfitItems).where(eq(outfitItems.outfitId, outfitId));
    if (itemIds.length === 0) return;
    const values = itemIds.map((itemId) => ({ outfitId, itemId }));
    await db.insert(outfitItems).values(values);
  }

  async removeItemFromOutfit(outfitId: number, itemId: number, userId: string): Promise<void> {
    // Verify ownership
    const [outfit] = await db.select().from(outfits).where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)));
    if (!outfit) return;
    await db
      .delete(outfitItems)
      .where(
        sql`${outfitItems.outfitId} = ${outfitId} AND ${outfitItems.itemId} = ${itemId}`
      );
  }

  async getOutfitsByItem(itemId: number, userId: string): Promise<Outfit[]> {
    const linkedOutfits = await db
      .select({ outfit: outfits })
      .from(outfitItems)
      .innerJoin(outfits, eq(outfitItems.outfitId, outfits.id))
      .where(and(eq(outfitItems.itemId, itemId), eq(outfits.userId, userId)))
      .orderBy(desc(outfits.dateWorn));

    return linkedOutfits.map((row) => row.outfit);
  }

  async getActivityLog(userId: string): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog).where(eq(activityLog.userId, userId)).orderBy(desc(activityLog.createdAt));
  }

  // Data migration: check if there are orphaned records across items or outfits (null userId)
  async hasOrphanedRecords(): Promise<boolean> {
    const [itemResult] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(items)
      .where(isNull(items.userId));
    const [outfitResult] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(outfits)
      .where(isNull(outfits.userId));
    return (itemResult?.count ?? 0) > 0 || (outfitResult?.count ?? 0) > 0;
  }

  // Claim all orphaned records (null userId) across items, outfits, and activity_log
  async claimOrphanedRecords(userId: string): Promise<void> {
    await db.update(items).set({ userId }).where(isNull(items.userId));
    await db.update(outfits).set({ userId }).where(isNull(outfits.userId));
    await db.update(activityLog).set({ userId }).where(isNull(activityLog.userId));
  }
}

export const storage = new DatabaseStorage();
