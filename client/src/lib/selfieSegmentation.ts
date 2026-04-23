import type { SelfieSegmentation as SelfieSegmentationType, Results, InputMap } from "@mediapipe/selfie_segmentation";
import type { BgRemovalProgress } from "./imageUtils";

const CDN_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747";

let instance: SelfieSegmentationType | null = null;
let initPromise: Promise<SelfieSegmentationType> | null = null;

async function getSegmenter(
  onProgress?: (p: BgRemovalProgress) => void
): Promise<SelfieSegmentationType> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    onProgress?.({ phase: "download", percent: 5 });

    const { SelfieSegmentation } = await import("@mediapipe/selfie_segmentation");

    onProgress?.({ phase: "download", percent: 20 });

    const seg = new SelfieSegmentation({
      locateFile: (file: string) => `${CDN_BASE}/${file}`,
    });

    seg.setOptions({ modelSelection: 1, selfieMode: false });

    onProgress?.({ phase: "download", percent: 40 });

    await seg.initialize();

    onProgress?.({ phase: "download", percent: 100 });

    instance = seg;
    return seg;
  })();

  return initPromise;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

export async function removeBgMediaPipe(
  blob: Blob,
  onProgress?: (p: BgRemovalProgress) => void
): Promise<Blob> {
  const seg = await getSegmenter(onProgress);

  onProgress?.({ phase: "process", percent: 10 });

  const img = await loadImage(blob);

  onProgress?.({ phase: "process", percent: 30 });

  const MAX_DIM = 2400;
  const scale = Math.min(1, MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight);
  const outW = Math.round(img.naturalWidth * scale);
  const outH = Math.round(img.naturalHeight * scale);

  let segMask: Results["segmentationMask"] | null = null;

  seg.onResults((results: Results) => {
    segMask = results.segmentationMask;
  });

  await seg.send({ image: img } as InputMap);

  if (!segMask) throw new Error("Segmentation returned no mask");

  onProgress?.({ phase: "process", percent: 70 });

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;

  ctx.drawImage(segMask as CanvasImageSource, 0, 0, outW, outH);
  ctx.globalCompositeOperation = "source-in";
  ctx.drawImage(img, 0, 0, outW, outH);

  onProgress?.({ phase: "process", percent: 95 });

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
      "image/png"
    );
  });
}
