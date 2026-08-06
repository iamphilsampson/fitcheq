export const BACKGROUNDS = [
  {
    name: "Chalk",
    type: "solid" as const,
    color: "#F5F2EE",
    css: "#F5F2EE",
  },
  {
    name: "Sand Drift",
    type: "radial" as const,
    inner: "#F0E4C8",
    outer: "#C49A6C",
    css: "radial-gradient(circle at 40% 35%, #F0E4C8, #C49A6C)",
  },
  {
    name: "Lilac Mist",
    type: "radial" as const,
    inner: "#E8DDFF",
    outer: "#A48FD8",
    css: "radial-gradient(circle at 40% 35%, #E8DDFF, #A48FD8)",
  },
  {
    name: "Peach Haze",
    type: "linear" as const,
    from: "#FDECD2",
    to: "#E8856A",
    angle: 140,
    css: "linear-gradient(140deg, #FDECD2, #E8856A)",
  },
  // Previous "Slate Deep" — kept for reference, swap back here if needed:
  // { name: "Slate Deep", type: "linear" as const, from: "#363B4E", to: "#181C2A",
  //   angle: 155, css: "linear-gradient(155deg, #363B4E, #181C2A)" },
  {
    name: "Cloud Mist",
    type: "radial" as const,
    inner: "#EEF4FB",
    outer: "#B6CBE0",
    css: "radial-gradient(circle at 40% 35%, #EEF4FB, #B6CBE0)",
  },
  {
    name: "Sage Blur",
    type: "radial" as const,
    inner: "#D4E8CC",
    outer: "#839E7E",
    css: "radial-gradient(circle at 40% 35%, #D4E8CC, #839E7E)",
  },
] as const;

export type Background = (typeof BACKGROUNDS)[number];

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: Background,
  w: number,
  h: number
) {
  if (bg.type === "solid") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
  } else if (bg.type === "radial") {
    const cx = w * 0.4;
    const cy = h * 0.35;
    const r = Math.max(w, h) * 0.75;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, bg.inner);
    grad.addColorStop(1, bg.outer);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (bg.type === "linear") {
    const rad = (bg.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const len = Math.abs(w * cos) + Math.abs(h * sin);
    const x1 = w / 2 - (cos * len) / 2;
    const y1 = h / 2 - (sin * len) / 2;
    const x2 = w / 2 + (cos * len) / 2;
    const y2 = h / 2 + (sin * len) / 2;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, bg.from);
    grad.addColorStop(1, bg.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Find the opaque bounding box of a (transparent-PNG) cutout, so we can frame
 * the *subject* rather than the whole photo rectangle. Scans at a reduced
 * resolution (fast, and framing doesn't need pixel precision) then maps the
 * bounds back to natural coordinates. Falls back to the full image if pixels
 * can't be read (e.g. a tainted canvas) or nothing is opaque.
 */
export function getOpaqueBounds(
  img: HTMLImageElement,
  { alphaThreshold = 10, maxScan = 512 }: { alphaThreshold?: number; maxScan?: number } = {}
): { sx: number; sy: number; sw: number; sh: number } {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const full = { sx: 0, sy: 0, sw: nw, sh: nh };
  if (!nw || !nh) return full;
  const longest = Math.max(nw, nh);
  const s = longest > maxScan ? maxScan / longest : 1;
  const w = Math.max(1, Math.round(nw * s));
  const h = Math.max(1, Math.round(nh * s));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return full;
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return full; }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return full; // fully transparent
  const inv = 1 / s;
  const sx = Math.max(0, Math.floor(minX * inv));
  const sy = Math.max(0, Math.floor(minY * inv));
  const sw = Math.min(nw - sx, Math.ceil((maxX - minX + 1) * inv));
  const sh = Math.min(nh - sy, Math.ceil((maxY - minY + 1) * inv));
  return { sx, sy, sw, sh };
}

/**
 * Draw a cutout centred and fitted into a w×h frame. Frames the *subject*
 * (opaque bounding box) rather than the whole photo rectangle, so the person
 * is centred and fills the frame instead of floating wherever they happened to
 * stand in the source photo. `margin` leaves a little breathing room at the
 * edges (0.96 = 4% inset).
 */
export function drawCutoutCentered(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  margin = 0.96
) {
  const b = getOpaqueBounds(img);
  const scale = Math.min(w / b.sw, h / b.sh) * margin;
  const dw = b.sw * scale;
  const dh = b.sh * scale;
  ctx.drawImage(img, b.sx, b.sy, b.sw, b.sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export type BgRemovalProgress = {
  phase: "download" | "process" | "server";
  percent: number;
};

export class BgRemovalTimeoutError extends Error {
  readonly isTimeout = true;
  constructor() {
    super("Background removal timed out");
    this.name = "BgRemovalTimeoutError";
  }
}

export class CutoutNotTransparentError extends Error {
  readonly isNotTransparent = true;
  constructor(public readonly transparentRatio: number) {
    super(
      `Cutout has no transparent area (${(transparentRatio * 100).toFixed(1)}% transparent pixels)`
    );
    this.name = "CutoutNotTransparentError";
  }
}

/**
 * Sample a cutout PNG and return the fraction of pixels with alpha < 250.
 * Used to detect a "failed" segmentation that returned the source image
 * with no real transparency. Sampling on a 64×64 canvas keeps this cheap.
 */
export async function measureCutoutTransparency(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Image load failed"));
      i.src = url;
    });
    const SAMPLE = 64;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, SAMPLE, SAMPLE);
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    let transparent = 0;
    const total = SAMPLE * SAMPLE;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) transparent++;
    }
    return transparent / total;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function removeBgISNet(
  blob: Blob,
  onProgress?: (p: BgRemovalProgress) => void
): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(blob, {
    model: "isnet",
    output: { format: "image/png" },
    progress: onProgress
      ? (key: string, current: number, total: number) => {
          if (!total) return;
          const phase: BgRemovalProgress["phase"] = key.startsWith("fetch")
            ? "download"
            : "process";
          const percent = Math.max(
            0,
            Math.min(100, Math.round((current / total) * 100))
          );
          onProgress({ phase, percent });
        }
      : undefined,
  });
}

function blobToBase64DataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function removeBgServerSide(
  blob: Blob,
  onProgress?: (p: BgRemovalProgress) => void,
  timeoutMs = 60_000
): Promise<Blob> {
  const imageData = await blobToBase64DataUri(blob);

  onProgress?.({ phase: "server", percent: 0 });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("/api/bg-remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`bg-remove API error ${res.status}: ${err.error}`);
    }

    const result = await res.blob();
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new BgRemovalTimeoutError();
    }
    throw err;
  }
}

/**
 * Return a blob whose raw pixels are already upright (EXIF orientation baked
 * in, flag cleared). Background-removal models — and server-side PIL — do NOT
 * honour EXIF orientation, so a phone photo carrying an orientation flag would
 * be segmented sideways (rotated + garbage mask). We normalise before removal.
 * Prefers createImageBitmap({imageOrientation:'from-image'}); falls back to an
 * <img> round-trip (browsers apply image-orientation:from-image by default).
 */
export async function normalizeOrientation(blob: Blob, quality = 0.95): Promise<Blob> {
  const encode = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Canvas empty"))), "image/jpeg", quality)
    );
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(bmp, 0, 0);
        bmp.close?.();
        return await encode(c);
      }
      bmp.close?.();
    }
  } catch { /* fall through to <img> */ }
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) { reject(new Error("no ctx")); return; }
      ctx.drawImage(img, 0, 0);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas empty"))), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export async function removeBgFromBlob(
  blob: Blob,
  onProgress?: (p: BgRemovalProgress) => void
): Promise<Blob> {
  // Upright pixels first — the model ignores EXIF orientation otherwise.
  const src = await normalizeOrientation(blob).catch(() => blob);
  let result: Blob;
  let path: "server-birefnet" | "client-isnet";
  try {
    result = await removeBgServerSide(src, onProgress);
    path = "server-birefnet";
  } catch (err) {
    if (err instanceof BgRemovalTimeoutError) {
      throw err;
    }
    console.warn("[bg-removal] Server-side model failed, falling back to ISNet:", err);
    result = await removeBgISNet(src, onProgress);
    path = "client-isnet";
  }
  // Diagnostic: which path ran and how the cutout compares to the (normalised)
  // source. A near-equal output size hints the segmenter removed nothing.
  const ratio = src.size > 0 ? (result.size / src.size).toFixed(2) : "?";
  console.info(
    `[bg-removal] path=${path} sourceBytes=${src.size} cutoutBytes=${result.size} sizeRatio=${ratio}`
  );
  return result;
}

/**
 * Downscale (never upscale) an image blob to `maxLongSide` and re-encode as
 * JPEG. Used to keep stored "original" photos small — a re-uploaded 24MP phone
 * shot doesn't need to persist at full resolution to serve as a re-clean source.
 */
export async function downscaleImageBlob(
  sourceBlob: Blob,
  maxLongSide = 2000,
  quality = 0.9,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(sourceBlob);
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = longest > maxLongSide ? maxLongSide / longest : 1;
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error("Canvas empty")); },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export type CropRect = { x: number; y: number; w: number; h: number };

/**
 * Full source context for compositing — tells the compositor to size the
 * output canvas from the original photo dimensions (not the crop frame) so
 * the chosen background fills the entire original photo rectangle.
 *
 * The cutout blob must have been produced from a blob that was scaled by
 * `min(1, maxLongSide / max(cropW, cropH))`. The compositor uses the ratio
 * `srcScale / cropScale` to rescale the cutout to its correct proportional
 * size within the full-photo canvas and places it at (cropX, cropY) scaled
 * to output pixel space. If a future provider rescales its output to a
 * different scale, the caller must normalise the cutout blob first.
 */
export interface CompositeContext {
  srcW: number;   // full original photo width in pixels
  srcH: number;   // full original photo height in pixels
  cropX: number;  // crop left offset in original pixels
  cropY: number;  // crop top offset in original pixels
  cropW: number;  // crop width in original pixels
  cropH: number;  // crop height in original pixels
}

// Output frame aspect ratio (portrait 3:4) for all composites. The background
// fills the whole frame and the subject is centre-fit into it, so tall/narrow
// crops end up centred on a full colour field rather than a thin strip.
export const FRAME_ASPECT = 3 / 4;

/**
 * Composite a transparent-PNG cutout onto a solid/gradient background.
 *
 * The output is a fixed portrait 3:4 frame, fully filled with the chosen
 * background, with the cutout centre-fit inside it. This keeps the colour
 * field filling the whole frame regardless of how the source was cropped.
 * (`context` is retained for signature compatibility but no longer used.)
 */
export async function compositeOnBackground(
  cutoutBlob: Blob,
  bgIndex: number,
  _context?: CompositeContext,
  frameHeight = 1600
): Promise<Blob> {
  // Defense-in-depth: refuse to composite an essentially-opaque cutout.
  const transparentRatio = await measureCutoutTransparency(cutoutBlob);
  console.info(`[composite] transparentRatio=${transparentRatio.toFixed(3)} bgIndex=${bgIndex}`);
  if (transparentRatio < 0.05) {
    throw new CutoutNotTransparentError(transparentRatio);
  }
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(cutoutBlob);
    const img = new Image();
    img.onload = () => {
      const outH = frameHeight;
      const outW = Math.round(outH * FRAME_ASPECT);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      drawBackground(ctx, BACKGROUNDS[bgIndex], outW, outH);
      drawCutoutCentered(ctx, img, outW, outH);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error("Canvas empty")); },
        "image/jpeg",
        0.95
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

/**
 * Produce a cropped-only JPEG (no background fill). Used by the
 * "skip background removal" path so the saved photo matches the user's
 * chosen frame, with the longest side capped for storage sanity.
 */
export async function cropImageBlob(
  sourceBlob: Blob,
  cropRect: CropRect,
  maxLongSide = 2400,
  quality = 0.92
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(sourceBlob);
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(cropRect.w, cropRect.h);
      const scale = longest > maxLongSide ? maxLongSide / longest : 1;
      const outW = Math.max(1, Math.round(cropRect.w * scale));
      const outH = Math.max(1, Math.round(cropRect.h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(
        img,
        cropRect.x, cropRect.y, cropRect.w, cropRect.h,
        0, 0, outW, outH
      );
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error("Canvas empty")); },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}
