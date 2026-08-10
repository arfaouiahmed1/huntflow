/**
 * Single source of truth for the HUNTFLOW palette.
 * `palette` returns CSS custom-property references (usable in inline
 * styles, SVG attributes, framer-motion values). `rawPalette` holds the
 * literal hex values for contexts that cannot resolve CSS variables
 * (e.g. canvas-confetti colors). Keep both in sync with globals.css.
 */

export const rawPalette = {
  ink: "#080b0e",
  inkSoft: "#0d1116",
  inkCard: "#10151c",
  inkDeep: "#05070a",
  inkConsole: "#0a0c0f",
  inkLeaf: "#0e1510",
  paper: "#e8ece4",
  paperDim: "#9aa39a",
  chartreuse: "#c8f453",
  chartreuseBright: "#eaffa0",
  amber: "#ffb454",
  coral: "#ff7a5c",
  sky: "#6bc7ff",
  violet: "#b48cff",
  linkedin: "#0a66c2",
} as const;

export type PaletteKey = keyof typeof rawPalette;

export const palette = Object.fromEntries(
  Object.entries(rawPalette).map(([key]) => [
    key,
    `var(--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`,
  ])
) as Record<PaletteKey, string>;

/** color-mix tint of a palette color at the given alpha (0–1). */
export function tint(color: string, alpha: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
