import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerObjectStorageRoutes } from "./uploads";
import { registerAuthRoutes, isAuthenticated, registerOrphanClaimFn } from "./auth";
import { insertItemSchema, insertOutfitSchema, detectedItemSchema } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";
import "./replit_integrations/auth/types"; // Import Express.User type augmentation

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
      const itemsList = await storage.getAllItemsWithWearCount(userId);
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

      // Clothing detection is optional — construct the OpenAI client lazily so a
      // missing key degrades this one feature instead of crashing the server.
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
      }
      const openai = new OpenAI({ apiKey: openaiKey });

      // Create the outfit first
      const outfit = await storage.createOutfit({
        fullImageUrl: imageUrl,
        dateWorn,
        notes: notes || null,
        userId,
      });

      // Build the full image URL for OpenAI to fetch. Must be publicly
      // reachable, so this feature only works when deployed with a public URL
      // (set APP_BASE_URL on Railway) — not on localhost.
      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;

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

  // Background-removal model allow-list. The client may request a specific model
  // by key (used by the staging-only /bg-lab comparison harness); anything not in
  // this map is rejected — we never pass an arbitrary Replicate slug from the
  // client. We resolve each model's LATEST version at request time and run it
  // pinned (`owner/model:version`) — community models (rembg, birefnet, …) 404 on
  // the run-by-name endpoint (only official models accept that), and resolving
  // latest keeps the lab robust to a pinned version being retired. `input` maps
  // the base64 data URI to whatever field name each model expects.
  const BG_MODELS: Record<string, { slug: string; input: (image: string) => Record<string, unknown> }> = {
    // Current production baseline.
    rembg: { slug: "cjwbw/rembg", input: (image) => ({ image }) },
    // BiRefNet-based, most-used remover on Replicate.
    bgremover: { slug: "851-labs/background-remover", input: (image) => ({ image }) },
    // BiRefNet reference implementation.
    birefnet: { slug: "men1scus/birefnet", input: (image) => ({ image }) },
    // rembg with an improved matting pass.
    "rembg-enhance": { slug: "smoretalk/rembg-enhance", input: (image) => ({ image }) },
    // Premium: Bria RMBG 2.0 (official model), 256-level alpha. Costs real money.
    rmbg2: { slug: "bria/remove-background", input: (image) => ({ image }) },
  };
  const DEFAULT_BG_MODEL = "rembg";

  // Cache each slug's latest version id for the process lifetime so repeated lab
  // runs don't re-hit the models endpoint. Value null = resolve failed / official
  // model with no version → run by name.
  const bgVersionCache = new Map<string, string | null>();
  async function resolveBgRef(replicate: any, slug: string): Promise<string> {
    if (bgVersionCache.has(slug)) {
      const v = bgVersionCache.get(slug);
      return v ? `${slug}:${v}` : slug;
    }
    const [owner, name] = slug.split("/");
    try {
      const model = await replicate.models.get(owner, name);
      const vid: string | null = model?.latest_version?.id ?? null;
      bgVersionCache.set(slug, vid);
      return vid ? `${slug}:${vid}` : slug;
    } catch {
      bgVersionCache.set(slug, null);
      return slug; // fall back to run-by-name (works for official models)
    }
  }

  // Background removal via Replicate (default: rembg; ISNet WASM fallback client-side).
  app.post("/api/bg-remove", isAuthenticated, async (req, res) => {
    try {
      const apiKey = process.env.REPLICATE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "REPLICATE_API_KEY not configured" });
      }

      const { imageData, model } = req.body as { imageData?: string; model?: string };
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ error: "imageData (base64 data URI) is required" });
      }

      const modelKey = model ?? DEFAULT_BG_MODEL;
      const chosen = BG_MODELS[modelKey];
      if (!chosen) {
        return res.status(400).json({ error: `Unknown model "${modelKey}"` });
      }

      const Replicate = (await import("replicate")).default;
      const replicate = new Replicate({ auth: apiKey });

      const started = Date.now();
      const ref = await resolveBgRef(replicate, chosen.slug);
      // Retry a couple of times on Replicate's prediction-creation throttle (429).
      let output: unknown;
      for (let attempt = 0; ; attempt++) {
        try {
          output = await replicate.run(ref, { input: chosen.input(imageData) });
          break;
        } catch (runErr) {
          const msg = runErr instanceof Error ? runErr.message : String(runErr);
          if (/\b429\b|throttled|Too Many Requests/i.test(msg) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          throw runErr;
        }
      }

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

      const elapsedMs = Date.now() - started;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Bg-Model", modelKey);
      res.setHeader("X-Bg-Slug", chosen.slug);
      res.setHeader("X-Bg-Ms", String(elapsedMs));
      // Expose the diagnostic headers to the browser fetch (the lab reads them).
      res.setHeader("Access-Control-Expose-Headers", "X-Bg-Model, X-Bg-Slug, X-Bg-Ms");
      const buffer = await imageResponse.arrayBuffer();
      console.info(`[bg-remove] model=${modelKey} slug=${chosen.slug} ms=${elapsedMs} bytes=${buffer.byteLength} from ${parsedUrl.hostname}`);
      res.end(Buffer.from(buffer));
    } catch (error) {
      console.error("[bg-remove] Error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Background removal failed" });
    }
  });

  return httpServer;
}
