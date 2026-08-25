// Board background themes (issue #168): the board's per-zone radial gradient
// (src/game.ts drawZones) already fades from each player's accent color at
// the zone center out to a shared background color at the edges — themes
// just swap that shared color, so player accents and zone legibility stay
// untouched regardless of theme. All themes are plain hex fills, drawn by
// the existing canvas gradient code rather than images, per CLAUDE.md's
// no-external-assets rule.

export interface BoardTheme {
  id: string;
  label: string;
  backgroundColor: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'midnight', label: 'Midnight', backgroundColor: '#121016' },
  { id: 'emerald', label: 'Emerald Felt', backgroundColor: '#0f2417' },
  { id: 'sapphire', label: 'Sapphire', backgroundColor: '#0d1a2e' },
  { id: 'crimson', label: 'Crimson', backgroundColor: '#2a0f14' },
];

export const DEFAULT_BOARD_THEME_ID = BOARD_THEMES[0].id;

/** Resolves a theme id to its BoardTheme, falling back to the default for an unset/unknown id. */
export function getBoardTheme(id: string | undefined): BoardTheme {
  return BOARD_THEMES.find((theme) => theme.id === id) ?? BOARD_THEMES[0];
}
