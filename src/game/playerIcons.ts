// Code-drawn player icon options (issue #167): a small set of vector glyphs
// players can pick to tell seats apart at a glance, beyond accent color
// alone (docs/concept.md's no-external-assets rule rules out photos/emoji).
// This module only holds the id list and validation/default logic — the
// canvas glyph drawing lives in game.ts (render-only) and the setup
// screen's SVG previews live in src/ui/setupScreen.ts — so assigning and
// persisting an icon choice stays unit-testable independent of rendering.

export const PLAYER_ICON_IDS = ['star', 'shield', 'bolt', 'moon', 'flame', 'leaf'] as const;

export type PlayerIconId = (typeof PLAYER_ICON_IDS)[number];

export const DEFAULT_PLAYER_ICON: PlayerIconId = PLAYER_ICON_IDS[0];

export function isPlayerIconId(value: unknown): value is PlayerIconId {
  return typeof value === 'string' && (PLAYER_ICON_IDS as readonly string[]).includes(value);
}

/** The default icon for seat `index`, cycling through PLAYER_ICON_IDS the same way PLAYER_COLORS cycles for accent colors. */
export function defaultIconForSeat(index: number): PlayerIconId {
  return PLAYER_ICON_IDS[index % PLAYER_ICON_IDS.length];
}
