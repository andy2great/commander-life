// Board background themes (issue #168): the live board fills its canvas with
// this shared color before drawing zones on top. Per-zone fills stay within
// each player's own accent hue regardless of theme (issue #200/R10) rather
// than blending toward it, so game.ts's drawZones() leaves a thin gutter
// (ZONE_GRADIENT_GUTTER_PX) around each zone letting this base layer show
// through between zones and at the board's outer edge, keeping the theme
// swap visible during gameplay while player accents/zone legibility stay
// untouched. All themes are plain hex fills, drawn by the existing canvas
// gradient code rather than images, per CLAUDE.md's no-external-assets rule.

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
