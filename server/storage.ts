import {
  items,
  outfits,
  outfitItems,
  type Item,
  type InsertItem,
  type Outfit,
  type InsertOutfit,
  type OutfitItem,
  type InsertOutfitItem,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Items
  getAllItems(): Promise<Item[]>;
  getItem(id: number): Promise<Item | undefined>;
  getItemWithOutfits(id: number): Promise<(Item & { outfits: Outfit[] }) | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: number, item: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(id: number): Promise<void>;

  // Outfits
  getAllOutfitsWithCounts(): Promise<(Outfit & { itemCount: number })[]>;
  getAllOutfits(): Promise<Outfit[]>;
  getOutfit(id: number): Promise<Outfit | undefined>;
  getOutfitWithItems(id: number): Promise<(Outfit & { items: Item[] }) | undefined>;
  createOutfit(outfit: InsertOutfit): Promise<Outfit>;
  updateOutfit(id: number, outfit: Partial<InsertOutfit>): Promise<Outfit | undefined>;
  deleteOutfit(id: number): Promise<void>;

  // Outfit Items (linking)
  addItemsToOutfit(outfitId: number, itemIds: number[]): Promise<void>;
  replaceItemsOnOutfit(outfitId: number, itemIds: number[]): Promise<void>;
  removeItemFromOutfit(outfitId: number, itemId: number): Promise<void>;
  getOutfitsByItem(itemId: number): Promise<Outfit[]>;
}

export class DatabaseStorage implements IStorage {
  // Items
  async getAllItems(): Promise<Item[]> {
    return db.select().from(items).orderBy(desc(items.createdAt));
  }

  async getItem(id: number): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    return item;
  }

  async getItemWithOutfits(id: number): Promise<(Item & { outfits: Outfit[] }) | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (!item) return undefined;

    const linkedOutfits = await db
      .select({ outfit: outfits })
      .from(outfitItems)
      .innerJoin(outfits, eq(outfitItems.outfitId, outfits.id))
      .where(eq(outfitItems.itemId, id))
      .orderBy(desc(outfits.dateWorn));

    return {
      ...item,
      outfits: linkedOutfits.map((row) => row.outfit),
    };
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning();
    return newItem;
  }

  async updateItem(id: number, item: Partial<InsertItem>): Promise<Item | undefined> {
    const [updated] = await db.update(items).set(item).where(eq(items.id, id)).returning();
    return updated;
  }

  async deleteItem(id: number): Promise<void> {
    await db.delete(outfitItems).where(eq(outfitItems.itemId, id));
    await db.delete(items).where(eq(items.id, id));
  }

  // Outfits
  async getAllOutfitsWithCounts(): Promise<(Outfit & { itemCount: number })[]> {
    const result = await db
      .select({
        id: outfits.id,
        dateWorn: outfits.dateWorn,
        fullImageUrl: outfits.fullImageUrl,
        notes: outfits.notes,
        createdAt: outfits.createdAt,
        itemCount: sql<number>`cast(count(${outfitItems.id}) as int)`,
      })
      .from(outfits)
      .leftJoin(outfitItems, eq(outfits.id, outfitItems.outfitId))
      .groupBy(outfits.id)
      .orderBy(desc(outfits.dateWorn));
    return result;
  }

  async getAllOutfits(): Promise<Outfit[]> {
    return db.select().from(outfits).orderBy(desc(outfits.dateWorn));
  }

  async getOutfit(id: number): Promise<Outfit | undefined> {
    const [outfit] = await db.select().from(outfits).where(eq(outfits.id, id));
    return outfit;
  }

  async getOutfitWithItems(id: number): Promise<(Outfit & { items: Item[] }) | undefined> {
    const [outfit] = await db.select().from(outfits).where(eq(outfits.id, id));
    if (!outfit) return undefined;

    const linkedItems = await db
      .select({ item: items })
      .from(outfitItems)
      .innerJoin(items, eq(outfitItems.itemId, items.id))
      .where(eq(outfitItems.outfitId, id));

    return {
      ...outfit,
      items: linkedItems.map((row) => row.item),
    };
  }

  async createOutfit(outfit: InsertOutfit): Promise<Outfit> {
    const [newOutfit] = await db.insert(outfits).values(outfit).returning();
    return newOutfit;
  }

  async updateOutfit(id: number, outfit: Partial<InsertOutfit>): Promise<Outfit | undefined> {
    const [updated] = await db.update(outfits).set(outfit).where(eq(outfits.id, id)).returning();
    return updated;
  }

  async deleteOutfit(id: number): Promise<void> {
    await db.delete(outfitItems).where(eq(outfitItems.outfitId, id));
    await db.delete(outfits).where(eq(outfits.id, id));
  }

  // Outfit Items linking
  async addItemsToOutfit(outfitId: number, itemIds: number[]): Promise<void> {
    if (itemIds.length === 0) return;
    
    const values = itemIds.map((itemId) => ({ outfitId, itemId }));
    await db.insert(outfitItems).values(values);
  }

  async replaceItemsOnOutfit(outfitId: number, itemIds: number[]): Promise<void> {
    await db.delete(outfitItems).where(eq(outfitItems.outfitId, outfitId));
    if (itemIds.length === 0) return;
    const values = itemIds.map((itemId) => ({ outfitId, itemId }));
    await db.insert(outfitItems).values(values);
  }

  async removeItemFromOutfit(outfitId: number, itemId: number): Promise<void> {
    await db
      .delete(outfitItems)
      .where(
        sql`${outfitItems.outfitId} = ${outfitId} AND ${outfitItems.itemId} = ${itemId}`
      );
  }

  async getOutfitsByItem(itemId: number): Promise<Outfit[]> {
    const linkedOutfits = await db
      .select({ outfit: outfits })
      .from(outfitItems)
      .innerJoin(outfits, eq(outfitItems.outfitId, outfits.id))
      .where(eq(outfitItems.itemId, itemId))
      .orderBy(desc(outfits.dateWorn));

    return linkedOutfits.map((row) => row.outfit);
  }
}

export const storage = new DatabaseStorage();
