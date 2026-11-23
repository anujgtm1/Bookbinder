import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import { DEFAULT_POCKET_STYLE } from '@/types/studio';
import {
  computeInnerPocketsLayout,
  computePocketImagePlacement,
  generateStyledInnerTemplatesPdf,
} from './pocketRenderEngine';
import { buildInnerPocketSnapTargets } from './snapGuides';

describe('pocketRenderEngine', () => {
  it('computes consistent 1:1 mm inner pockets layout rects and magnetic snap targets', () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const layout = computeInnerPocketsLayout(geom);

    expect(layout.backX).toBe(0);
    expect(layout.linerX).toBeGreaterThan(layout.backFullRect.width);
    expect(layout.frontX).toBeGreaterThan(layout.linerX + layout.linerRect.width);
    expect(layout.totalWidthMm).toBeCloseTo(
      layout.frontX + geom.frontPocket.totalWidthMm,
      2,
    );

    const targets = buildInnerPocketSnapTargets(layout);
    expect(targets.vertical.some((t) => t.label === 'FRONT CENTER')).toBe(true);
    expect(targets.vertical.some((t) => t.label === 'BACK CENTER')).toBe(true);
    expect(targets.horizontal.some((t) => t.label === 'CENTERLINE')).toBe(true);
  });

  it('computes cover, contain, and tile placements accurately', () => {
    const target = { x: 12, y: 12, width: 100, height: 200 };

    // Square image in 1:2 portrait rect: cover scales to height=200 (width=200 centered)
    const cover = computePocketImagePlacement(target, 1000, 1000, 'cover', 1);
    expect(cover.width).toBe(200);
    expect(cover.height).toBe(200);
    expect(cover.x).toBe(12 - 50);

    // Contain scales to width=100 (height=100 centered vertically)
    const contain = computePocketImagePlacement(target, 1000, 1000, 'contain', 1);
    expect(contain.width).toBe(100);
    expect(contain.height).toBe(100);
    expect(contain.y).toBe(12 + 50);

    // Tile uses scaled tile dimensions
    const tile = computePocketImagePlacement(target, 400, 200, 'tile', 0.5);
    expect(tile.width).toBeCloseTo(32.5, 1);
    expect(tile.height).toBeCloseTo(16.25, 1);
  });

  it('generates a valid styled inner templates PDF honoring auto-pagination', async () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const result = await generateStyledInnerTemplatesPdf(
      geom,
      'letter',
      {
        ...DEFAULT_POCKET_STYLE,
        backgroundColor: '#1e4d44',
      },
      72,
    );

    expect(result.plan.pageCount).toBe(2);
    expect(new TextDecoder().decode(result.bytes.subarray(0, 5))).toBe('%PDF-');
  });
});
