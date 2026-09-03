# Commander Life Counter — Requirements

R1. The game shall not track or display a Ring-bearer ("The Ring tempts you")
    badge. No control (on-board or in the board-wide shortcut menu) shall
    allow assigning, displaying, or hit-testing a Ring-bearer status for any
    player.

R2. The game shall not track or display a Monarch designation. No control
    shall allow assigning, displaying, or hit-testing Monarch status for any
    player, and no badge shall render on top of a player's life counter for
    it.

R3. The game shall not offer selectable player icons. Player zones shall be
    distinguished by accent color only; no icon badge shall render on the
    board and no icon picker shall appear on the setup screen.

R4. After removal of the Ring-bearer, Monarch, and player-icon badges, each
    player zone shall retain a clean, balanced layout with the life total as
    its sole visual focal point — no vestigial empty badge slots, dead
    hit-test regions, or spacing sized for the removed badges.

R5. On the pre-game setup screen, the shared center hub shall never visually
    overlap or intercept taps intended for any player zone's controls (name
    field, color swatches, start-first button, remove-player button,
    two-commanders toggle) at any supported player count (2-8) or viewport
    size; every zone control shall remain fully visible and tappable
    regardless of the hub's rendered size.

R6. The pre-game setup hub shall show only the essential table-wide controls
    (player count, starting life, and Start Game) by default; roll-for-start,
    board theme, and match history shall be reachable from a secondary
    control that opens the docked settings panel described in R17, so the
    default hub's footprint stays small enough to fit the shared center area
    without competing with player zone controls for space.

R7. The active player's zone shall render its pulsing highlight border using the
    app's foil accent color (the brass `#d7a54c` → ember `#e2673f` gradient
    used elsewhere for primary accents), and no canvas-drawn accent, border,
    or highlight anywhere in the app shall use the blue accent family
    (`rgb(91, 140, 255)` or equivalent) that the Foil & Felt visual identity
    replaced.

R8. The shared center control disc (undo, shortcut, and pause icons) shall
    render with a beveled gradient fill, a foil-accented rim highlight, and a
    drop shadow consistent with the Foil & Felt panel treatment used by the
    app's DOM overlay screens, rather than a flat single-color fill and flat
    stroke.

R9. All canvas-drawn text on a player zone — life total, player name, and
    turn timer alike — shall use the app's `DISPLAY_FONT_STACK` display
    typeface; none shall fall back to a system-ui/generic sans-serif font.
    Player-name text shall render uppercase with letter-spacing consistent
    with the DOM overlay screens' header treatment.

R10. Each player zone's background fill shall be a same-hue, multi-stop
     radial gradient that remains visibly saturated with the player's accent
     color across the entire zone, including its outer edge — it shall never
     fade to the shared board background color at any gradient stop.

R11. The board shall render a persistent turn-indicator badge, showing the
     current turn number and the active player's name, anchored near the
     shared center control area at all times during gameplay. The badge
     shall never overlap or intercept taps on the center disc's controls.

R12. When a life, commander-damage, poison, or other tracked counter changes,
     the board shall display a floating numeral showing the signed delta
     (e.g. "-3", "+2") at the affected zone, animating with a rise-and-fade
     motion and oriented upright for that player's seat, in addition to the
     zone's existing color-wash feedback.

R13. The board's background, beneath the player zones, shall render a
     subtle code-drawn felt-like texture layered over its gradient fill, for
     every board theme, using canvas drawing code only (no external image or
     texture assets), without reducing life-total or player-name legibility.

R14. While the attack menu, board-wide shortcut menu, or any other full-board
     overlay is open, the canvas board behind it shall render with a
     blur-and-dim filter (not a flat dim-only scrim), removed immediately
     when the overlay closes.

R15. Whenever the viewport is in portrait orientation (height greater than
     width), the app shall display a full-board "rotate to landscape" prompt
     that blocks all gameplay and overlay interaction and pauses the turn
     timer, disappearing automatically the instant the viewport becomes
     landscape. On platforms where the Screen Orientation API supports
     locking, the app shall additionally attempt to lock orientation to
     landscape on load, failing silently where locking is unsupported or
     rejected.

R16. Every interactive control's rendered visual bounds — including any
     shadow, glow, or decorative chrome drawn around it — shall never extend
     beyond its tappable/hit-tested area, on both canvas-drawn controls and
     DOM controls; a player shall never see a control that looks larger than
     the region that actually responds to their tap.

R17. On the pre-game setup screen, secondary table-wide settings
     (roll-for-start, board theme, match history) shall be presented in a
     side panel docked to a screen edge, openable and closable from the
     setup hub, that never dims, obscures, or blocks pointer interaction
     with the seat zones or the center hub, so that table-wide settings
     and per-seat player configuration can be adjusted at the same time.
     While the panel is open, the seat-zone grid shall reflow to the
     remaining space rather than being covered.

R18. The pre-game setup hub's unconstrained preferred width shall be no
     narrower than 320px (or 90% of viewport width on narrower phones), so
     its player-count and starting-life steppers and its Start Game button
     are not visually cramped. The R5 non-overlap guarantee still applies:
     `computeSetupHubMaxSize` (or its equivalent) shall continue to shrink
     the hub below this preferred width, on a per-zone basis, whenever a
     seat zone's control-cluster footprint would otherwise be covered.
