import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { insertItemSchema, insertOutfitSchema, detectedItemSchema } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register object storage routes
  registerObjectStorageRoutes(app);

  // Items endpoints
  app.get("/api/items", async (req, res) => {
    try {
      const items = await storage.getAllItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching items:", error);
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  app.get("/api/items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.getItemWithOutfits(id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching item:", error);
      res.status(500).json({ error: "Failed to fetch item" });
    }
  });

  app.post("/api/items", async (req, res) => {
    try {
      const validatedData = insertItemSchema.parse(req.body);
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

  app.patch("/api/items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.updateItem(id, req.body);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating item:", error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  app.delete("/api/items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteItem(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting item:", error);
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  // Outfits endpoints
  app.get("/api/outfits", async (req, res) => {
    try {
      const outfits = await storage.getAllOutfits();
      res.json(outfits);
    } catch (error) {
      console.error("Error fetching outfits:", error);
      res.status(500).json({ error: "Failed to fetch outfits" });
    }
  });

  app.get("/api/outfits/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const outfit = await storage.getOutfitWithItems(id);
      if (!outfit) {
        return res.status(404).json({ error: "Outfit not found" });
      }
      res.json(outfit);
    } catch (error) {
      console.error("Error fetching outfit:", error);
      res.status(500).json({ error: "Failed to fetch outfit" });
    }
  });

  app.post("/api/outfits", async (req, res) => {
    try {
      const validatedData = insertOutfitSchema.parse(req.body);
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

  app.delete("/api/outfits/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteOutfit(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting outfit:", error);
      res.status(500).json({ error: "Failed to delete outfit" });
    }
  });

  // Link items to outfit
  app.post("/api/outfits/:id/items", async (req, res) => {
    try {
      const outfitId = parseInt(req.params.id);
      const { itemIds } = req.body;

      if (!Array.isArray(itemIds)) {
        return res.status(400).json({ error: "itemIds must be an array" });
      }

      await storage.addItemsToOutfit(outfitId, itemIds);
      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error linking items to outfit:", error);
      res.status(500).json({ error: "Failed to link items" });
    }
  });

  // AI Outfit Analysis endpoint
  app.post("/api/outfits/analyze", async (req, res) => {
    try {
      const { imageUrl, dateWorn, notes } = req.body;

      if (!imageUrl || !dateWorn) {
        return res.status(400).json({ error: "imageUrl and dateWorn are required" });
      }

      // Create the outfit first
      const outfit = await storage.createOutfit({
        fullImageUrl: imageUrl,
        dateWorn,
        notes: notes || null,
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
        // Return empty items array if parsing fails
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

  return httpServer;
}
