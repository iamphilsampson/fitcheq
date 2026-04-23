# Background Removal — Approach Log

This document records every background-removal strategy tried in Fit Check, why each was changed, and what options remain if the current approach proves insufficient.

---

## What we've tried

### 1. ISNet fp16 — original implementation
- **Library**: `@imgly/background-removal` with `model: "isnet_fp16"`
- **Resolution**: Cut output at 900×1200, JPEG 0.92
- **How it works**: Generic subject-vs-background segmentation model. Classifies each pixel as "subject" or "background" with no domain knowledge about people specifically.
- **Outcome**: Rough, halo-y edges. Output resolution too low for editorial use. Obvious artefacts on mirror selfies (mirror frames bled through). Replaced in Task #6.

### 2. ISNet full — quality bump
- **Library**: `@imgly/background-removal` with `model: "isnet"`
- **Resolution**: PNG intermediate → composite at 2400×3200, JPEG 0.95
- **How it works**: Larger variant of the same ISNet model. Higher parameter count, slightly crisper edges.
- **Outcome**: Noticeably sharper image quality. Edge quality marginally improved, but still generic — mirror outlines, white-on-white backgrounds, and cluttered room shots confused the model. Replaced in Task #12.

---

## Current approach

### 3. MediaPipe Selfie Segmentation — Task #12
- **Library**: `@mediapipe/selfie_segmentation` (Google, v0.1.1675465747)
- **Model**: `modelSelection: 1` (landscape model, ~4 MB, tuned for full-body shots)
- **How it works**: Purpose-built human-silhouette model. Runs client-side via WASM with WebGL acceleration. Returns a segmentation mask where the alpha channel encodes foreground confidence. We composite the mask onto the original image using `source-in` blending to produce a transparent PNG cutout.
- **Model files**: Loaded on first use from CDN (`cdn.jsdelivr.net`); cached by the browser thereafter.
- **Entry point**: `client/src/lib/selfieSegmentation.ts` → called via `removeBgFromBlob` in `imageUtils.ts`.
- **Progress reporting**: Phase "download" fires during first-run model initialisation; phase "process" fires during segmentation.

---

## Models considered (but not yet tried)

| Model | Where it runs | Typical cost | Quality | Notes |
|---|---|---|---|---|
| **MediaPipe Selfie Seg** | Browser (WASM + WebGL) | Free | Good | ✅ Current approach. Designed for human silhouettes. |
| **BiRefNet (portrait)** | Replicate API | ~$0.002 / image | Excellent | SOTA for portrait/fashion cutouts. Would require a server-side API call and user auth. |
| **U²-Net Human Seg** | Replicate / self-host | ~$0.001 / image | Very good | Older but rock-solid for person segmentation. |
| **remove.bg** | API | $0.05–0.20 / image | Excellent | Polished edges, widely used in e-commerce. |
| **Photoroom** | API | ~$0.08 / image | Excellent | Designed for fashion/product photography. |
| **SAM 2 (Segment Anything)** | API | variable | Best-in-class | Promptable — can be told to segment the person specifically. Larger model, more complex integration. |

---

## Open ideas (if MediaPipe isn't enough)

1. **Try BiRefNet on Replicate** — cheapest paid option (~$0.002/image). Portrait-tuned variant likely handles mirror selfies and busy backgrounds better than any client-side model. Add `REPLICATE_API_KEY` as an environment secret and hit the API from the server.

2. **Two-pass refinement** — run MediaPipe for a fast initial cutout, then run a lightweight edge-matting pass (e.g. Alpha-Matting library) to clean up soft-edge regions around hair and fine detail.

3. **User-guided eraser** — after the initial cutout, present a simple brush tool so the user can paint out any stray background pixels manually. Low-tech but zero extra cost.

4. **Progressive model swap** — run MediaPipe and a paid API in parallel for a test set of images and compare quality before committing to a paid option.
