import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerAuthRoutes, isAuthenticated, registerOrphanClaimFn } from "./replit_integrations/auth";
import { insertItemSchema, insertOutfitSchema, detectedItemSchema } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";
import "./replit_integrations/auth/types"; // Import Express.User type augmentation

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Helper to get userId from request (Replit Auth — only call after isAuthenticated middleware)
function getUserId(req: Request): string {
  const sub = req.user!.claims.sub;
  return Array.isArray(sub) ? sub[0] : sub;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register server-side orphan claim callback (runs automatically on sign-in)
  registerOrphanClaimFn(async (userId: string) => {
    const hasOrphans = await storage.hasOrphanedRecords();
    if (hasOrphans) {
      await storage.claimOrphanedRecords(userId);
    }
  });

  // Register object storage routes
  registerObjectStorageRoutes(app);

  // Register auth routes (/api/auth/user, etc.)
  registerAuthRoutes(app);

  // Items endpoints - all require auth, scoped to userId
  app.get("/api/items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const itemsList = await storage.getAllItems(userId);
      res.json(itemsList);
    } catch (error) {
      console.error("Error fetching items:", error);
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  app.get("/api/items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const item = await storage.getItemWithOutfits(id, userId);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching item:", error);
      res.status(500).json({ error: "Failed to fetch item" });
    }
  });

  app.post("/api/items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const validatedData = insertItemSchema.parse({ ...req.body, userId });
      const item = await storage.createItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid item data", details: error.errors });
      }
      console.error("Error creating item:", error);
      res.status(500).json({ error: "Failed to create item" });
    }
  });

  app.patch("/api/items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const item = await storage.updateItem(id, userId, req.body);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating item:", error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  app.delete("/api/items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      await storage.deleteItem(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting item:", error);
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  // Outfits endpoints - all require auth, scoped to userId
  app.get("/api/outfits", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const outfitsList = await storage.getAllOutfitsWithCounts(userId);
      res.json(outfitsList);
    } catch (error) {
      console.error("Error fetching outfits:", error);
      res.status(500).json({ error: "Failed to fetch outfits" });
    }
  });

  app.get("/api/outfits/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const outfit = await storage.getOutfitWithItems(id, userId);
      if (!outfit) {
        return res.status(404).json({ error: "Outfit not found" });
      }
      res.json(outfit);
    } catch (error) {
      console.error("Error fetching outfit:", error);
      res.status(500).json({ error: "Failed to fetch outfit" });
    }
  });

  // AI analyze route must come before /:id to avoid conflict
  app.post("/api/outfits/analyze", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { imageUrl, dateWorn, notes } = req.body;

      if (!imageUrl || !dateWorn) {
        return res.status(400).json({ error: "imageUrl and dateWorn are required" });
      }

      // Create the outfit first
      const outfit = await storage.createOutfit({
        fullImageUrl: imageUrl,
        dateWorn,
        notes: notes || null,
        userId,
      });

      // Build the full image URL for OpenAI
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co`
        : `http://localhost:5000`;
      
      const fullImageUrl = imageUrl.startsWith("http") 
        ? imageUrl 
        : `${baseUrl}${imageUrl}`;

      // Analyze the image with GPT-4o Vision
      const analysisPrompt = `Identify distinct clothing items in this image. Return a JSON array with each item having these properties:
- category: The main category (e.g., "Tops", "Bottoms", "Footwear", "Outerwear", "Accessories")
- subCategory: A more specific type (e.g., "T-Shirt", "Jeans", "Sneakers", "Jacket", "Watch")
- color: The primary color of the item
- description: A brief 5-10 word description of the item

Return ONLY a valid JSON array, no additional text. Example:
[{"category": "Tops", "subCategory": "T-Shirt", "color": "Black", "description": "Plain black crew neck cotton t-shirt"}]`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: analysisPrompt },
              {
                type: "image_url",
                image_url: { url: fullImageUrl },
              },
            ],
          },
        ],
        max_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content || "[]";
      
      // Parse the JSON response
      let detectedItems: z.infer<typeof detectedItemSchema>[] = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          detectedItems = z.array(detectedItemSchema).parse(parsed);
        }
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        detectedItems = [];
      }

      res.json({
        outfitId: outfit.id,
        detectedItems,
      });
    } catch (error) {
      console.error("Error analyzing outfit:", error);
      res.status(500).json({ error: "Failed to analyze outfit" });
    }
  });

  app.post("/api/outfits", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const validatedData = insertOutfitSchema.parse({ ...req.body, userId });
      const outfit = await storage.createOutfit(validatedData);
      res.status(201).json(outfit);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid outfit data", details: error.errors });
      }
      console.error("Error creating outfit:", error);
      res.status(500).json({ error: "Failed to create outfit" });
    }
  });

  app.patch("/api/outfits/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const outfit = await storage.updateOutfit(id, userId, req.body);
      if (!outfit) {
        return res.status(404).json({ error: "Outfit not found" });
      }
      res.json(outfit);
    } catch (error) {
      console.error("Error updating outfit:", error);
      res.status(500).json({ error: "Failed to update outfit" });
    }
  });

  app.delete("/api/outfits/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      await storage.deleteOutfit(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting outfit:", error);
      res.status(500).json({ error: "Failed to delete outfit" });
    }
  });

  // Link items to outfit
  app.post("/api/outfits/:id/items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const outfitId = parseInt(req.params.id);
      const { itemIds } = req.body;

      if (!Array.isArray(itemIds)) {
        return res.status(400).json({ error: "itemIds must be an array" });
      }

      await storage.addItemsToOutfit(outfitId, itemIds, userId);
      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error linking items to outfit:", error);
      res.status(500).json({ error: "Failed to link items" });
    }
  });

  // Replace all items on outfit (clear + add)
  app.put("/api/outfits/:id/items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const outfitId = parseInt(req.params.id);
      const { itemIds } = req.body;

      if (!Array.isArray(itemIds)) {
        return res.status(400).json({ error: "itemIds must be an array" });
      }

      await storage.replaceItemsOnOutfit(outfitId, itemIds, userId);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error replacing items on outfit:", error);
      res.status(500).json({ error: "Failed to replace items" });
    }
  });

  // Remove single item from outfit
  app.delete("/api/outfits/:id/items/:itemId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const outfitId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);
      await storage.removeItemFromOutfit(outfitId, itemId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing item from outfit:", error);
      res.status(500).json({ error: "Failed to remove item" });
    }
  });

  // Activity log - requires auth, scoped to user
  app.get("/api/activity", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const log = await storage.getActivityLog(userId);
      res.json(log);
    } catch (error) {
      console.error("Error fetching activity log:", error);
      res.status(500).json({ error: "Failed to fetch activity log" });
    }
  });

  // Background removal via BiRefNet portrait on Replicate
  // Falls back gracefully to client-side ISNet if this endpoint is unavailable
  app.post("/api/bg-remove", isAuthenticated, async (req, res) => {
    try {
      const apiKey = process.env.REPLICATE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "REPLICATE_API_KEY not configured" });
      }

      const { imageData } = req.body as { imageData?: string };
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ error: "imageData (base64 data URI) is required" });
      }

      const Replicate = (await import("replicate")).default;
      const replicate = new Replicate({ auth: apiKey });

      // rembg — reliable background removal model on Replicate.
      // Previously used lucataco/birefnet-portrait but that model was removed.
      // Pinned version for reproducibility: https://replicate.com/cjwbw/rembg
      const output = await replicate.run(
        "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
        { input: { image: imageData } }
      );

      // Extract URL from Replicate output — may be a string, FileOutput (toString → URL),
      // or an array of these (some models); always take the first item.
      function extractReplicateUrl(val: unknown): string {
        if (Array.isArray(val)) return extractReplicateUrl(val[0]);
        if (typeof val === "string") return val;
        return String(val); // FileOutput.toString() returns the URL
      }
      const resultUrl = extractReplicateUrl(output);

      // Validate the URL is an HTTPS Replicate delivery URL before fetching
      let parsedUrl: URL;
      try { parsedUrl = new URL(resultUrl); } catch {
        throw new Error(`Invalid URL received from Replicate: ${resultUrl}`);
      }
      if (parsedUrl.protocol !== "https:") {
        throw new Error(`Non-HTTPS URL received from Replicate: ${resultUrl}`);
      }
      const allowedHosts = ["replicate.delivery", "replicate.com"];
      const isAllowed = allowedHosts.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`));
      if (!isAllowed) {
        throw new Error(`Unexpected host in Replicate output URL: ${parsedUrl.hostname}`);
      }

      const imageResponse = await fetch(resultUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch result from Replicate: ${imageResponse.status}`);
      }

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      const buffer = await imageResponse.arrayBuffer();
      console.info(`[bg-remove] returned PNG bytes=${buffer.byteLength} from ${parsedUrl.hostname}`);
      res.end(Buffer.from(buffer));
    } catch (error) {
      console.error("[bg-remove] Error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Background removal failed" });
    }
  });

  return httpServer;
}
