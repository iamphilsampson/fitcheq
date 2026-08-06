# Background Removal — Approach Log

This document records every background-removal strategy tried in FitCheq, why each was changed, and what options remain if the current approach proves insufficient.

> **Current state (Aug 2026):** auto bg-removal (Replicate `cjwbw/rembg`, ISNet WASM
> fallback) is followed by a manual **clean-up editor** — `components/CutoutEditor.tsx`,
> with **Erase** brush + **Magic-wand** tools, undo, and re-crop-on-reclean. The model log
> below is the history of the *automatic* step; the editor is the user-guided step on top.

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

### 4. rembg via Replicate + ISNet fallback — active
- **Primary**: `cjwbw/rembg` on Replicate (server-side API call). Version pinned: `fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003`.
- **Fallback**: `@imgly/background-removal` with `model: "isnet"` (client-side WASM). Runs if the Replicate call fails for any reason other than a timeout.
- **How it works**: rembg is a well-established server-side segmentation tool. The Replicate endpoint accepts an image URI (or base64 data URI via SDK auto-upload) and returns a transparent PNG cutout. The input is the already-cropped image blob (not the full original), so the model receives only the user's chosen frame.
- **Entry point**: `server/routes.ts` → `/api/bg-remove` → `client/src/lib/imageUtils.ts` → `removeBgFromBlob`.
- **Previous primary**: `lucataco/birefnet-portrait` — removed from Replicate on or around May 2026. Replaced here.

### 3. BiRefNet portrait via Replicate — removed upstream (was Task #15)
- **Model**: `lucataco/birefnet-portrait` — pinned version `9d17a74b...`
- **Outcome**: Excellent quality for standing portraits. Removed from Replicate by the model owner (~May 2026), causing 422 errors. Replaced by rembg above.

### 2. MediaPipe Selfie Segmentation — Task #12 (bypassed)
- **Library**: `@mediapipe/selfie_segmentation` (Google, v0.1.1675465747)
- **Entry point**: `client/src/lib/selfieSegmentation.ts` — kept but bypassed; server-side route is primary.
- **Outcome**: Purpose-built for human silhouettes but inconsistent on mirror selfies. Superseded by server-side approaches.

---

## Models considered / tried

| Model | Where it runs | Typical cost | Quality | Notes |
|---|---|---|---|---|
| **rembg** | Replicate API | ~$0.001 / image | Good | ✅ Current primary. Reliable general segmentation. |
| **ISNet** | Browser (WASM) | Free | Good | ✅ Current fallback. Crisper than ISNet fp16 but slower. |
| **BiRefNet (portrait)** | Replicate API | ~$0.002 / image | Excellent | Was primary — model removed from Replicate May 2026. |
| **MediaPipe Selfie Seg** | Browser (WASM + WebGL) | Free | Good | Was primary — bypassed in favour of server-side models. |
| **U²-Net Human Seg** | Replicate / self-host | ~$0.001 / image | Very good | Not tried. Good portrait segmentation alternative. |
| **remove.bg** | API | $0.05–0.20 / image | Excellent | Not tried. Polished edges, widely used in e-commerce. |
| **SAM 2** | API | variable | Best-in-class | Not tried. Promptable segmentation; more complex. |

---

## Open ideas

1. **Switch to a portrait-specific rembg model** — rembg supports multiple internal models (`u2net_human_seg`, `isnet-general-use`, etc.). The Replicate wrapper uses the default. A future task could pass a `model` input to use `u2net_human_seg` for better person cutouts.

2. **Two-pass refinement** — run the primary cutout then apply a lightweight edge-matting pass to clean up soft regions around hair.

3. **User-guided eraser** — simple brush tool to paint out stray background pixels after the initial cutout. Zero extra cost.
