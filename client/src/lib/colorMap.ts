export type ColorSwatch =
  | { kind: "solid"; hex: string; needsBorder?: boolean }
  | { kind: "pattern"; pattern: "stripes" | "check" | "tartan" }
  | { kind: "unknown" };

const SOLID_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  white: "#ffffff",
  cream: "#f5f0e4",
  ivory: "#f2edd8",
  off_white: "#f0ebe0",
  ecru: "#f0e8d0",
  stone: "#a3897a",
  sand: "#c4a87e",
  beige: "#d4b896",
  tan: "#c8a46e",
  camel: "#c1895a",
  brown: "#7a5440",
  chocolate: "#5c3620",
  navy: "#1e2a4a",
  blue: "#4a7fc1",
  cobalt: "#2456a4",
  sky: "#6bb5d6",
  light_blue: "#8ac4de",
  teal: "#3a8a7d",
  turquoise: "#3abcae",
  green: "#4a8a4a",
  sage: "#8aac7a",
  olive: "#6b7c3a",
  khaki: "#b8a878",
  yellow: "#f0c040",
  mustard: "#c8942a",
  orange: "#e07428",
  rust: "#b84c28",
  red: "#c94040",
  burgundy: "#8b2e2e",
  wine: "#7a2438",
  pink: "#e070a0",
  blush: "#e8b4b8",
  hot_pink: "#d43878",
  purple: "#7b4c96",
  lilac: "#b49cc8",
  lavender: "#c8b4dc",
  grey: "#9e9e9e",
  gray: "#9e9e9e",
  charcoal: "#4a4a4a",
  slate: "#6a7880",
  silver: "#c0c0c0",
  gold: "#c8a040",
};

const PATTERN_KEYWORDS: Record<string, "stripes" | "check" | "tartan"> = {
  stripe: "stripes",
  stripes: "stripes",
  striped: "stripes",
  pinstripe: "stripes",
  pinstriped: "stripes",
  check: "check",
  checked: "check",
  checker: "check",
  plaid: "check",
  gingham: "check",
  tartan: "tartan",
  houndstooth: "check",
};

const LIGHT_COLORS = new Set(["white", "cream", "ivory", "off_white", "ecru", "blush", "lavender", "lilac", "silver"]);

function normalise(raw: string): string {
  return raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

export function getColorSwatch(colorName: string | null | undefined): ColorSwatch {
  if (!colorName) return { kind: "unknown" };

  const key = normalise(colorName);

  if (SOLID_COLORS[key]) {
    return {
      kind: "solid",
      hex: SOLID_COLORS[key],
      needsBorder: LIGHT_COLORS.has(key),
    };
  }

  if (PATTERN_KEYWORDS[key]) {
    return { kind: "pattern", pattern: PATTERN_KEYWORDS[key] };
  }

  for (const [word, hex] of Object.entries(SOLID_COLORS)) {
    if (key.includes(word) || word.includes(key)) {
      return { kind: "solid", hex, needsBorder: LIGHT_COLORS.has(word) };
    }
  }

  for (const [word, pattern] of Object.entries(PATTERN_KEYWORDS)) {
    if (key.includes(word)) {
      return { kind: "pattern", pattern };
    }
  }

  return { kind: "unknown" };
}
