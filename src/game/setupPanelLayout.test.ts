import { describe, expect, it } from 'vitest';
import { computeSetupPanelLayout } from './setupPanelLayout';

describe('computeSetupPanelLayout', () => {
  it('gives the full viewport width to the zone area when closed', () => {
    expect(computeSetupPanelLayout(800, false)).toEqual({ panelWidth: 0, zoneAreaWidth: 800 });
  });

  it('docks a panel and reflows the zone area to the remaining width when open', () => {
    const layout = computeSetupPanelLayout(800, true);
    expect(layout.panelWidth).toBeGreaterThan(0);
    expect(layout.zoneAreaWidth).toBe(800 - layout.panelWidth);
  });

  it('caps the panel width so the zone area keeps the majority of the screen on a narrow viewport', () => {
    const layout = computeSetupPanelLayout(650, true);
    expect(layout.panelWidth).toBeLessThanOrEqual(650 * 0.42);
    expect(layout.zoneAreaWidth).toBeGreaterThan(layout.panelWidth);
  });

  it('never produces a negative zone-area width on a very narrow viewport', () => {
    const layout = computeSetupPanelLayout(100, true);
    expect(layout.zoneAreaWidth).toBeGreaterThanOrEqual(0);
  });
});
