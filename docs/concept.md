# Commander Life Counter — Concept

## Pitch
A gorgeous, tap-driven life counter built specifically for Magic: The Gathering Commander (EDH) games of 3-6 players. Track life, commander damage, whose turn it is, and get a beautiful stat recap when the game ends.

## Goal
Replace pen-and-paper trackers and generic counter apps with a single shared portrait device passed around (or laid flat) at the table. Every player's life total is oriented so it's readable from their own seat, controls are one-thumb tap-driven, turn order is always visible, mistakes are one tap to undo, and the end of the game produces a rich, shareable stat summary.

## Core loop
1. Host configures the game (player count 3-6, starting life, names/colors) on the setup screen.
2. The canvas splits into N player zones, each rotated to face that player's seat.
3. The active player's zone is highlighted with a pulsing border; long-pressing anywhere inside that zone advances the active-player highlight clockwise around the table (with a brief flash animation as the press commits), and the turn counter increments each full lap.
4. Dragging a pointer from your own zone into another player's zone (à la Playgroup) opens a damage-type menu for that attacker/target pair, letting you log plain damage, commander damage, lifelink damage, healing, or poison dealt in that direction. Dragging from your own zone back into itself (past the same movement threshold as a cross-zone drag) opens a self-target menu instead — labeled with your name and "(self)" rather than an attacker → target pair — for logging self-damage, healing, or poison against your own total; commander damage and lifelink don't apply to yourself, so those options are omitted. A drag released outside any player zone is ignored. This drag gesture is the only way life totals change — tapping a zone does nothing.
5. Every life, commander-damage, or poison change pushes onto an undo stack; a center undo icon reverts the most recent action ("retour en arrière").
6. The game ends automatically when only one player remains above 0 life. A stats screen shows total duration, time-per-turn breakdown, most damage dealt/received, biggest single hit, and elimination order.
7. "New Game" returns to the setup screen, pre-filled with the previous configuration.

## Controls (touch-only, one-thumb per player)
- Drag from your own zone into another player's zone (~10px movement past the zone boundary): opens a damage-type menu for that attacker/target pair, with +/- steppers for plain damage, commander damage, lifelink damage (damages the target and heals the attacker as one action), healing, and poison — the only way life totals change; a plain tap on your own zone does nothing
- Drag from your own zone back into itself (same ~10px movement threshold): opens a self-target menu (name shown once with a "(self)" label) with +/- steppers for plain damage, healing, and poison against your own total — commander damage and lifelink are omitted since they don't apply to yourself
- Long-press (~500ms) anywhere inside the active player's own zone = pass turn, with a brief flash animation as it commits; long-pressing a non-active zone does nothing
- Center shared control: tap = undo last action (dimmed/disabled when nothing to undo)
- Setup screen: tap +/- steppers for player count and starting life, tap color swatches to assign player accent colors, tap a name field to rename via the soft keyboard

## Layout by player count (portrait canvas, all code-drawn, no external assets)
- 3 players: one zone spans the full width at the top (rotated 180°), two zones split the bottom half vertically
- 4 players: 2x2 grid; top row rotated 180°, bottom row upright
- 5 players: top row = 1 zone spanning the full width (the fifth player sits alone at that end of the table, rotated 180°), bottom row = 4 zones upright (each row sized to fill its half)
- 6 players: 3x2 grid; top row rotated 180°, bottom row upright
- A shared circular control disc sits where all zones meet, at the vertical center of the canvas, hosting the undo icon

## Scoring / "impact" stats (shown only at game end, never mid-game)
- Match duration (mm:ss)
- Time spent as active player, per player, drawn as a horizontal canvas bar chart
- Total life lost and gained, per player
- Total commander damage dealt and received, per player
- Biggest single hit (player, amount, and target if it was commander damage)
- Elimination order, for any player who reached 0 life
- Winner: last player standing

## Difficulty curve / progression
Not applicable in the traditional score-chasing sense — this is a utility, not a score attack. "Progression" instead means configuration depth: the default game (4 players, 40 life) launches in two taps for casual use, while power users can dig into commander-damage sub-panels and the full stat history. Every screen must stay usable one-handed regardless of depth.

## Visual style (all code-drawn on canvas, zero external assets/fonts/images)
- Dark neutral background (near-black, #121016) so colored player zones pop like felt on a card table
- Each player zone is assigned one of 6 preset saturated accent colors (crimson, teal, amber, violet, lime, sky), rendered as a soft radial gradient fill
- Life numbers: huge, bold, centered, drawn with canvas text using a heavy sans stack, white with a subtle drop shadow, rotated 180° for top-row zones so every player reads their own number upright from their seat
- The active player's zone renders an animated pulsing border (canvas stroke with a sine-driven width/opacity); a long-press that commits a turn pass also plays a brief flash animation on that zone, distinct from the idle pulse
- Center control disc: circular, translucent dark fill, hosting a curved-arrow icon (undo), vector-drawn with canvas path calls — no icon fonts or bitmap images
- Stats screen reuses the same dark background and per-player accent colors for its horizontal bar charts, so results are instantly recognizable against the in-game colors

## Ad monetization potential
Low-frequency, high-context: this app is used for the full length of a Commander game (often 20-60+ minutes), so ads must sit only at natural breaks — an interstitial after "End Game" and before the stats screen, plus an optional banner on the setup screen. No mid-game ads, since interrupting live life tracking would break usability and trust. A "remove ads" IAP fits naturally given the app's repeat, session-based usage pattern.
