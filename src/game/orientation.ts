// Portrait/landscape detection (issue #213, R15). A pure function, free of
// DOM globals per CLAUDE.md's "core logic stays DOM-free" convention, so it
// stays unit-testable in isolation from main.ts's actual viewport reads.

/** True when the viewport is in portrait orientation (height greater than width) — the case the rotate prompt should cover. */
export function isPortraitOrientation(width: number, height: number): boolean {
  return height > width;
}
