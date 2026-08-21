# Visual identity — "Foil & Felt"

Design pass for issue #116: the DOM overlays (`setupScreen.ts`, `attackMenu.ts`,
`boardShortcutMenu.ts`, `statsScreen.ts`) shared one flat, unstyled dark-card
look — `#1b1822` panels, default `system-ui` type, plain circular buttons, and
a blue→violet CTA gradient. That blue→violet gradient in particular is the
single most recognizable "generic AI app" signature (chat widgets, SaaS
onboarding screens, etc.), so it's the first thing this pass replaces.

Direction, in one line: **a card table, not a chat app.** Everything reads
against `docs/concept.md`'s felt-table pitch — code-drawn only, no external
assets/fonts, per CLAUDE.md.

## Palette

- Background stays the concept's near-black plum `#121016`, but overlays now
  sit on a subtle top-lit vignette (`radial-gradient` toward `#211a2c`) instead
  of a flat fill, so panels read as sitting *on* felt rather than floating on
  a solid color.
- Panels move from a flat `#1b1822` fill to a faint 160° bevel
  (`#211c29 → #1a1620`) with a 1px inset highlight on top and shadow on the
  bottom edge — a soft embossed-card edge instead of a flat rectangle.
- New signature accent, **foil**: a brass→ember gradient (`#d7a54c → #e2673f`)
  replaces the old sky→violet gradient everywhere it appeared (CTA buttons,
  winner card, active/selected states, focus rings). It reads as gilt card
  foil, ties into the Commander/EDH theme, and is not a stock "AI product"
  gradient.
- Per-player accent colors (`PLAYER_COLORS` in `game.ts`) are unchanged — they
  are already distinctive and load-bearing for gameplay legibility.

## Typography

- Section headers (`h1`, panel titles, stats card headings) are uppercase,
  tracked (`letter-spacing`), 800 weight, with a short 2px foil-gradient rule
  underneath as a signature mark — still system fonts, just a heavier
  editorial treatment than default `system-ui`.
- Hero numbers/names (winner name, biggest-hit name) get a foil gradient text
  fill (`background-clip: text`) instead of flat white, for a "engraved
  plaque" feel at the moments that matter most (end of game).
- Body copy, labels, and counters keep the existing readable weight/size —
  the goal is a distinctive frame, not decoration that hurts one-thumb
  legibility mid-game.

## Shape language

- Primary CTAs and the two hero stat cards (winner, biggest hit) get a
  clipped corner (`clip-path` cutting the top-left and bottom-right corners)
  — a "trimmed card" silhouette instead of a generic rounded rectangle.
- Everything else (steppers, toggles, player rows) keeps soft rounded
  corners for touch comfort, but selected/active states now render a foil
  ring instead of a flat color swap.

## Iconography

- Close buttons switch from a text "✕" glyph to a small inline vector icon,
  matching the stroke style already used for the board-shortcut icons
  (`stroke-width: 2.2`, round caps, `currentColor`) — one consistent icon
  language across overlays instead of mixing text glyphs and SVG.

## Motion accents

- Interactive elements get a short `:active` press (scale down + brightness
  bump) with a matching transition, so taps have tactile feedback.
- CTA buttons carry a slow looping foil "shimmer" sweep (pure CSS
  `background-position` keyframe) — a quiet idle accent that reinforces the
  foil-card motif without being distracting mid-game.
- Toggle/selection state changes (attack menu, board-shortcut menu) transition
  border/background instead of snapping instantly.

## Consistency

All four restyled screens (setup, attack menu, board-shortcut menu, stats)
share the same background treatment, panel bevel, foil accent, header
treatment, and press/shimmer motion — so the product reads as one designed
surface rather than four independently styled screens.
