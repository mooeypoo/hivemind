import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/**
 * Colour contrast can't be measured in a DOM without layout, so it is checked here, from the
 * theme's tokens, for both modes: WCAG 1.4.3 (text, 4.5:1) and 1.4.11 (controls and focus, 3:1).
 */
const publicDir = new URL('../../src/web/public/', import.meta.url);
const theme = readFileSync(new URL('themes/night/tokens.css', publicDir), 'utf8');

/** `--name: light-dark(#light, #dark)` → one map per mode. */
const modes = [
  ...theme.matchAll(/--([\w-]+):\s*light-dark\((#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\)/g),
];
const light = Object.fromEntries(modes.map((m) => [m[1] ?? '', m[2] ?? '']));
const dark = Object.fromEntries(modes.map((m) => [m[1] ?? '', m[3] ?? '']));

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

/** [foreground token, background token, minimum ratio] */
const pairs: [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-2', 4.5],
  ['text', 'accent-soft', 4.5],
  ['muted', 'bg', 4.5],
  ['muted', 'surface', 4.5],
  ['muted', 'surface-2', 4.5],
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['accent-text', 'accent', 4.5],
  ['danger', 'bg', 4.5],
  ['danger', 'surface', 4.5],
  ['surface', 'danger', 4.5],
  ['success', 'bg', 4.5],
  ['success', 'surface', 4.5],
  ['control-border', 'surface', 3],
  ['control-border', 'bg', 3],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  ['highlight', 'bg', 4.5],
  ['highlight', 'surface', 4.5],
  ['highlight', 'surface-2', 4.5],
  ['accent', 'accent-soft', 4.5],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s mode colour contrast', (_, tokens) => {
  test.each(pairs)('%s on %s is at least %s:1', (fg, bg, min) => {
    const a = tokens[fg];
    const b = tokens[bg];
    expect(a, `--${fg} is defined`).toBeDefined();
    expect(b, `--${bg} is defined`).toBeDefined();
    expect(contrast(a ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
  });
});

describe('stylesheets outside the theme', () => {
  const stylesheets = readdirSync(new URL('styles/', publicDir)).filter((name) =>
    name.endsWith('.css'),
  );

  test.each(stylesheets)('%s uses colour tokens, not colour literals', (name) => {
    const css = readFileSync(new URL(`styles/${name}`, publicDir), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g)).toBeNull();
  });
});
