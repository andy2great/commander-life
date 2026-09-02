// Pure, DOM-free geometry for the setup screen's docked settings panel
// (issue #217): replaces the old dimmed "More" bottom sheet, which blocked
// pointer interaction with the seat zones and center hub while open —
// exactly the competition between table settings and player setup a
// stakeholder flagged at Gate 2. The panel docks to the right edge instead,
// alongside the seat-zone grid rather than on top of it: callers pass the
// `zoneAreaWidth` this module returns into `computeZoneRects` (src/game.ts)
// so the seat grid reflows into the remaining space instead of being
// covered. Kept DOM-free so it's unit-testable per CLAUDE.md, mirroring
// setupHubLayout.ts.

export interface SetupPanelLayout {
  /** Width, in px, the docked panel should render at; 0 when closed. */
  panelWidth: number;
  /** Width, in px, left for the seat-zone grid (and center hub) beside the panel; the full viewport width when closed. */
  zoneAreaWidth: number;
}

const PANEL_PREFERRED_WIDTH = 300;
// Caps the panel at well under half the viewport so the seat-zone grid
// always keeps the majority of the screen, even on a narrow landscape
// viewport (R15 forces landscape orientation on the setup screen).
const PANEL_MAX_VIEWPORT_RATIO = 0.42;

/**
 * Panel/zone-area width split for the setup screen's docked settings panel
 * (issue #217, R17). Closing the panel restores the full viewport width to
 * the zone area, matching the pre-panel layout.
 */
export function computeSetupPanelLayout(viewportWidth: number, isOpen: boolean): SetupPanelLayout {
  if (!isOpen) {
    return { panelWidth: 0, zoneAreaWidth: viewportWidth };
  }
  const panelWidth = Math.min(PANEL_PREFERRED_WIDTH, viewportWidth * PANEL_MAX_VIEWPORT_RATIO);
  return { panelWidth, zoneAreaWidth: Math.max(viewportWidth - panelWidth, 0) };
}
