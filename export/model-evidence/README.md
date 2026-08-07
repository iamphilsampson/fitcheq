# Background-removal model — failure evidence

Notes backing the **[PARKED] cut-out quality** item on the board. The model in use
is `cjwbw/rembg` on Replicate (server path; the client WASM ISNet is the fallback).
Orientation (EXIF) and the re-clean crop step have already been fixed — the issues
below are the *model* itself.

To keep an actual screenshot with the investigation, drop the image file into this
folder (`export/model-evidence/`) and add a dated line below. (Chat-pasted images
can't be saved from here automatically.)

## Observed failure modes
- **2026-08-06 · staging** — Parts of the *subject* are made **translucent** (alpha < 1)
  by the model, not just the background: on the headphones / blue-shirt-over-tee / dark
  parka outfit (and others), the left arm/sleeve and parts of the torso came out
  see-through — you can see the checkerboard/white through them. This is a segmentation
  quality problem, distinct from orientation or crop.
- **Shoes / feet** consistently poor — dark footwear on a dark floor is left with rough,
  smudged, or partially-missing edges.

## Comparison harness (2026-08-07)
A staging-only **BG Lab** now exists to evaluate these directly: `/bg-lab` (link in the
STAGING banner). Pick one photo, crop once, then run every candidate model on that same
crop — showing the raw cutout on a checkerboard (to spot translucent-subject pixels) and
the full composite, with timings + % transparent. Models wired: rembg (current), 851-labs
BiRefNet, men1scus BiRefNet, rembg-enhance, **Bria RMBG 2.0** (premium), ISNet (browser).
Use it on the exact outfits below, then promote the winner via `DEFAULT_BG_MODEL` in
`server/routes.ts`.

## Candidate fixes to evaluate (when unparked)
- Swap `rembg` for a stronger current Replicate model (e.g. a BiRefNet / RMBG-2.0-class
  model) and compare on these exact outfits.
- Alpha post-processing: threshold/harden near-opaque alpha so faint-but-present subject
  pixels don't read as translucent.
