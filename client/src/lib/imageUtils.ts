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

export function drawCutoutCentered(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
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

export async function removeBgFromBlob(
  blob: Blob,
  onProgress?: (p: BgRemovalProgress) => void
): Promise<Blob> {
  let result: Blob;
  let path: "server-birefnet" | "client-isnet";
  try {
    result = await removeBgServerSide(blob, onProgress);
    path = "server-birefnet";
  } catch (err) {
    if (err instanceof BgRemovalTimeoutError) {
      throw err;
    }
    console.warn("[bg-removal] Server-side BiRefNet failed, falling back to ISNet:", err);
    result = await removeBgISNet(blob, onProgress);
    path = "client-isnet";
  }
  // Diagnostic: which path ran and how the cutout compares to the source.
  // A near-equal output size is a strong hint the segmenter didn't actually
  // remove anything (and we'd produce a misleading composite if we ignored it).
  const ratio = blob.size > 0 ? (result.size / blob.size).toFixed(2) : "?";
  console.info(
    `[bg-removal] path=${path} sourceBytes=${blob.size} cutoutBytes=${result.size} sizeRatio=${ratio}`
  );
  return result;
}

export async function compositeOnBackground(
  cutoutBlob: Blob,
  bgIndex: number,
  outputW = 2400,
  outputH = 3200
): Promise<Blob> {
  // Defense-in-depth: refuse to composite an essentially-opaque cutout.
  // Without this, callers that bypass the call-site guard would still
  // produce a misleading composite where the chosen background is fully
  // covered by the original photo.
  const transparentRatio = await measureCutoutTransparency(cutoutBlob);
  console.info(
    `[composite] transparentRatio=${transparentRatio.toFixed(3)} bgIndex=${bgIndex}`
  );
  if (transparentRatio < 0.05) {
    throw new CutoutNotTransparentError(transparentRatio);
  }
  return new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = outputW;
    canvas.height = outputH;
    const ctx = canvas.getContext("2d")!;
    drawBackground(ctx, BACKGROUNDS[bgIndex], outputW, outputH);
    const url = URL.createObjectURL(cutoutBlob);
    const img = new Image();
    img.onload = () => {
      drawCutoutCentered(ctx, img, outputW, outputH);
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
