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
  {
    name: "Slate Deep",
    type: "linear" as const,
    from: "#363B4E",
    to: "#181C2A",
    angle: 155,
    css: "linear-gradient(155deg, #363B4E, #181C2A)",
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

export function hasTransparency(blob: Blob): Promise<boolean> {
  if (!blob.type.includes("png")) return Promise.resolve(false);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      URL.revokeObjectURL(url);
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) { resolve(true); return; }
      }
      resolve(false);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

export function compositeOnBackground(
  cutoutBlob: Blob,
  bgIndex: number,
  outputW = 900,
  outputH = 1200
): Promise<Blob> {
  return new Promise((resolve, reject) => {
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
        0.92
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}
