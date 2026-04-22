import { users, type User, type UpsertUser } from "@shared/models/auth";
import { items, outfits, activityLog } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // If the incoming record has an email, check whether an existing user with
    // that email already exists under a *different* id (e.g. legacy Replit Auth
    // record). If so, migrate the existing record's id to the new one and
    // re-link all owned data so the user keeps their wardrobe and outfits.
    if (userData.email && userData.id) {
      const [existingByEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email));

      if (existingByEmail && existingByEmail.id !== userData.id) {
        const oldId = existingByEmail.id;
        const newId = userData.id;

        const migratedUser = await db.transaction(async (tx) => {
          // Re-link owned data first (no FK constraints on userId, so plain UPDATEs).
          await tx.update(items).set({ userId: newId }).where(eq(items.userId, oldId));
          await tx.update(outfits).set({ userId: newId }).where(eq(outfits.userId, oldId));
          await tx.update(activityLog).set({ userId: newId }).where(eq(activityLog.userId, oldId));

          // Update the user record's primary key + profile fields.
          const [updated] = await tx
            .update(users)
            .set({
              id: newId,
              email: userData.email,
              firstName: userData.firstName,
              lastName: userData.lastName,
              profileImageUrl: userData.profileImageUrl,
              updatedAt: new Date(),
            })
            .where(eq(users.id, oldId))
            .returning();
          return updated;
        });

        return migratedUser;
      }
    }

    // Normal path: insert by id, or update by id if it already exists.
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
