/**
 * Single source of truth for the HUNTFLOW palette.
 * `palette` returns CSS custom-property references (usable in inline
 * styles, SVG attributes, framer-motion values). `rawPalette` holds the
 * literal hex values for contexts that cannot resolve CSS variables
 * (e.g. canvas-confetti colors). Keep both in sync with globals.css.
 */

export const rawPalette = {
  ink: "#0a0e13",
  inkSoft: "#10161e",
  inkCard: "#131a23",
  inkDeep: "#070a0f",
  inkConsole: "#0c1118",
  inkLeaf: "#111a15",
  paper: "#f3f5f1",
  paperDim: "#9ca7a1",
  chartreuse: "#b9ed57",
  chartreuseBright: "#dcff91",
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
