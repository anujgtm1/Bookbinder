import { describe, expect, it } from 'vitest';
import type { LineSegment2D, Rect2D } from '@/types/geometry';
import {
  DEFAULT_SCALE_BAR_CLEARANCE_MM,
  SCALE_BAR_BOX_H_MM,
  SCALE_BAR_BOX_W_MM,
  planScaleBarPlacement,
  rectsIntersectMm,
  ticksToPdfAvoidRects,
  type PdfSafeBox,
  type ScaleBarPlacement,
} from './scaleBarPlacement';

function placementToRect(p: ScaleBarPlacement): Rect2D {
  return { x: p.xMm, y: p.yMm, width: p.widthMm, height: p.heightMm };
}

function assertStrictlyInsideSafeBox(p: ScaleBarPlacement, safeBox: PdfSafeBox): void {
  const eps = 1e-4;
  expect(p.xMm).toBeGreaterThanOrEqual(safeBox.leftMm - eps);
  expect(p.xMm + p.widthMm).toBeLessThanOrEqual(safeBox.leftMm + safeBox.widthMm + eps);
  expect(p.yMm).toBeGreaterThanOrEqual(safeBox.bottomMm - eps);
  expect(p.yMm + p.heightMm).toBeLessThanOrEqual(safeBox.topMm + eps);
}

function assertZeroCollision(
  p: ScaleBarPlacement,
  avoidRects: readonly Rect2D[],
  clearanceMm = DEFAULT_SCALE_BAR_CLEARANCE_MM,
): void {
  const rect = placementToRect(p);
  for (const avoid of avoidRects) {
    expect(rectsIntersectMm(rect, avoid, clearanceMm)).toBe(false);
  }
}

describe('scaleBarPlacement (planScaleBarPlacement)', () => {
  it('regression: avoids deep-flap softcover cover occupying top-left safeBox corner on US Legal Landscape', () => {
    // US Legal Landscape (355.6 x 215.9 mm) with standard 5 mm margins -> safeBox 345.6 x 205.9 mm
    const safeBox: PdfSafeBox = {
      leftMm: 5,
      bottomMm: 5,
      widthMm: 345.6,
      heightMm: 205.9,
      topMm: 210.9,
    };
    // Tall softcover slip cover + glue tabs + bleed (305 x 198 mm) centered in safeBox:
    // x = 25.3..330.3 (20.3 mm left/right margin), y = 8.95..206.95 (only 3.95 mm top/bottom!)
    // Previously hardcoded top-left (x=6..60, y=201.0..209.4) overlapped the cover flap!
    const coverRect: Rect2D = { x: 25.3, y: 8.95, width: 305, height: 198 };
    const footerStrip: Rect2D = { x: 5, y: 5, width: 345.6, height: 4.2 };
    const avoidRects = [coverRect, footerStrip];

    const placement = planScaleBarPlacement({
      safeBox,
      barWidthMm: SCALE_BAR_BOX_W_MM,
      barHeightMm: SCALE_BAR_BOX_H_MM,
      avoidRects,
    });

    expect(placement.overlapsAvoidZone).toBe(false);
    expect(placement.rotated90).toBe(true);
    expect(placement.widthMm).toBeCloseTo(SCALE_BAR_BOX_H_MM, 4);
    expect(placement.heightMm).toBeCloseTo(SCALE_BAR_BOX_W_MM, 4);
    assertStrictlyInsideSafeBox(placement, safeBox);
    assertZeroCollision(placement, avoidRects);
  });

  it('places horizontally in top-left when clear top margin exists', () => {
    const safeBox: PdfSafeBox = {
      leftMm: 5,
      bottomMm: 5,
      widthMm: 345.6,
      heightMm: 205.9,
      topMm: 210.9,
    };
    const coverRect: Rect2D = { x: 16.3, y: 22.95, width: 323, height: 170 };
    const footerStrip: Rect2D = { x: 5, y: 5, width: 345.6, height: 4.2 };
    const avoidRects = [coverRect, footerStrip];

    const placement = planScaleBarPlacement({
      safeBox,
      barWidthMm: SCALE_BAR_BOX_W_MM,
      barHeightMm: SCALE_BAR_BOX_H_MM,
      avoidRects,
    });

    expect(placement.overlapsAvoidZone).toBe(false);
    expect(placement.rotated90).toBe(false);
    expect(placement.slotName).toBe('top-left');
    expect(placement.xMm).toBeCloseTo(6.0, 3);
    expect(placement.yMm).toBeCloseTo(safeBox.topMm - 1.0 - SCALE_BAR_BOX_H_MM, 3);
    assertStrictlyInsideSafeBox(placement, safeBox);
    assertZeroCollision(placement, avoidRects);
  });

  it('uses dynamic tucked horizontal slot when top margin is tight (10.5 mm) so bar fits strictly inside safeBox with full clearance', () => {
    // Letter Landscape with asymmetric margins: safeBox y in [20, 210.9]
    // Cover y in [30.45, 200.45] -> 10.45 mm top gap (fits 8.4 mm bar + 1.5 mm clearance = 9.9 mm!)
    const safeBox: PdfSafeBox = {
      leftMm: 10,
      bottomMm: 20,
      widthMm: 264.4,
      heightMm: 190.9,
      topMm: 210.9,
    };
    const coverRect: Rect2D = { x: 17.2, y: 30.45, width: 250, height: 170 };
    const footerStrip: Rect2D = { x: 10, y: 20, width: 264.4, height: 4.2 };
    const avoidRects = [coverRect, footerStrip];

    const placement = planScaleBarPlacement({
      safeBox,
      barWidthMm: SCALE_BAR_BOX_W_MM,
      barHeightMm: SCALE_BAR_BOX_H_MM,
      avoidRects,
    });

    expect(placement.overlapsAvoidZone).toBe(false);
    expect(placement.rotated90).toBe(false);
    expect(placement.yMm).toBeGreaterThanOrEqual(coverRect.y + coverRect.height + DEFAULT_SCALE_BAR_CLEARANCE_MM - 1e-4);
    assertStrictlyInsideSafeBox(placement, safeBox);
    assertZeroCollision(placement, avoidRects);
  });

  it('shifts to bottom horizontal slot tucked cleanly above the footer when top is blocked', () => {
    const safeBox: PdfSafeBox = {
      leftMm: 5,
      bottomMm: 5,
      widthMm: 269.4,
      heightMm: 205.9,
      topMm: 210.9,
    };
    // Cover pushed toward top edge leaving 22 mm at bottom and 3 mm at top
    const coverRect: Rect2D = { x: 10, y: 27, width: 259, height: 180.9 };
    const footerStrip: Rect2D = { x: 5, y: 5, width: 269.4, height: 4.2 };
    const avoidRects = [coverRect, footerStrip];

    const placement = planScaleBarPlacement({
      safeBox,
      barWidthMm: SCALE_BAR_BOX_W_MM,
      barHeightMm: SCALE_BAR_BOX_H_MM,
      avoidRects,
    });

    expect(placement.overlapsAvoidZone).toBe(false);
    expect(placement.rotated90).toBe(false);
    expect(placement.yMm).toBeGreaterThanOrEqual(footerStrip.y + footerStrip.height + DEFAULT_SCALE_BAR_CLEARANCE_MM - 1e-4);
    expect(placement.yMm + placement.heightMm).toBeLessThanOrEqual(coverRect.y - DEFAULT_SCALE_BAR_CLEARANCE_MM + 1e-4);
    assertStrictlyInsideSafeBox(placement, safeBox);
    assertZeroCollision(placement, avoidRects);
  });

  it('avoids external fold guide ticks near top-left by shifting to an unobstructed slot', () => {
    const safeBox: PdfSafeBox = {
      leftMm: 5,
      bottomMm: 5,
      widthMm: 345.6,
      heightMm: 205.9,
      topMm: 210.9,
    };
    const coverRect: Rect2D = { x: 16.3, y: 22.95, width: 323, height: 170 };
    // Suppose a fold guide tick sticks up right into the top-left corner area
    const blockingTick: Rect2D = { x: 35, y: 194, width: 1, height: 10 };
    const footerStrip: Rect2D = { x: 5, y: 5, width: 345.6, height: 4.2 };
    const avoidRects = [coverRect, blockingTick, footerStrip];

    const placement = planScaleBarPlacement({
      safeBox,
      barWidthMm: SCALE_BAR_BOX_W_MM,
      barHeightMm: SCALE_BAR_BOX_H_MM,
      avoidRects,
    });

    expect(placement.overlapsAvoidZone).toBe(false);
    expect(placement.rotated90).toBe(false);
    expect(placement.slotName).not.toBe('top-left');
    assertStrictlyInsideSafeBox(placement, safeBox);
    assertZeroCollision(placement, avoidRects);
  });

  it('on 2-sheet tiled Sheet 1, avoids cover, overlap seam strip, header, and footer', () => {
    // US Letter Portrait (215.9 x 279.4 mm), 5 mm margins -> safeBox 205.9 x 269.4 mm
    const safeBox: PdfSafeBox = {
      leftMm: 5,
      bottomMm: 5,
      widthMm: 205.9,
      heightMm: 269.4,
      topMm: 274.4,
    };
    // Tall 2-sheet cover clipped on Sheet 1: x = 22..194, y = 12..267 (leaves 17 mm on left, overlap on right)
    const clippedCover: Rect2D = { x: 22, y: 12, width: 172, height: 255 };
    const overlapStrip: Rect2D = { x: 184, y: 6.5, width: 11, height: 266.4 };
    const headerStrip: Rect2D = { x: 5, y: 270.0, width: 205.9, height: 4.4 };
    const footerStrip: Rect2D = { x: 5, y: 5, width: 205.9, height: 4.2 };
    const avoidRects = [clippedCover, overlapStrip, headerStrip, footerStrip];

    const placement = planScaleBarPlacement({
      safeBox,
      barWidthMm: SCALE_BAR_BOX_W_MM,
      barHeightMm: SCALE_BAR_BOX_H_MM,
      avoidRects,
    });

    expect(placement.overlapsAvoidZone).toBe(false);
    expect(placement.rotated90).toBe(true);
    expect(placement.xMm + placement.widthMm).toBeLessThanOrEqual(clippedCover.x - DEFAULT_SCALE_BAR_CLEARANCE_MM + 1e-4);
    assertStrictlyInsideSafeBox(placement, safeBox);
    assertZeroCollision(placement, avoidRects);
  });

  it('on wide-format roll, avoids all nested copies and roll footer by choosing open roll space', () => {
    // 36" roll (914.4 mm wide x 391 mm long), 3 rotated copies across x = 5..805
    const safeBox: PdfSafeBox = {
      leftMm: 5,
      bottomMm: 1,
      widthMm: 904.4,
      heightMm: 389,
      topMm: 390,
    };
    const copy1: Rect2D = { x: 5, y: 5, width: 260, height: 381 };
    const copy2: Rect2D = { x: 275, y: 5, width: 260, height: 381 };
    const copy3: Rect2D = { x: 545, y: 5, width: 260, height: 381 };
    const rollFooter: Rect2D = { x: 5, y: 1, width: 904.4, height: 3.4 };
    const avoidRects = [copy1, copy2, copy3, rollFooter];

    const placement = planScaleBarPlacement({
      safeBox,
      barWidthMm: SCALE_BAR_BOX_W_MM,
      barHeightMm: SCALE_BAR_BOX_H_MM,
      avoidRects,
    });

    expect(placement.overlapsAvoidZone).toBe(false);
    expect(placement.rotated90).toBe(false);
    expect(placement.slotName).toBe('top-right');
    assertStrictlyInsideSafeBox(placement, safeBox);
    assertZeroCollision(placement, avoidRects);
  });

  it('gracefully falls back to minimum-overlap outer corner when cover completely fills safeBox', () => {
    const safeBox: PdfSafeBox = {
      leftMm: 5,
      bottomMm: 5,
      widthMm: 205.9,
      heightMm: 269.4,
      topMm: 274.4,
    };
    // Cover fills 100% of safeBox, plus footer strip at bottom
    const fullCover: Rect2D = { x: 5, y: 5, width: 205.9, height: 269.4 };
    const footerStrip: Rect2D = { x: 5, y: 5, width: 205.9, height: 4.2 };
    const avoidRects = [fullCover, footerStrip];

    const placement = planScaleBarPlacement({
      safeBox,
      barWidthMm: SCALE_BAR_BOX_W_MM,
      barHeightMm: SCALE_BAR_BOX_H_MM,
      avoidRects,
    });

    expect(placement.overlapsAvoidZone).toBe(true);
    expect(placement.rotated90).toBe(false);
    // Avoids double-overlapping the bottom footer strip and prefers outer corner
    expect(placement.slotName).toBe('top-left');
    assertStrictlyInsideSafeBox(placement, safeBox);
  });

  it('converts top-down external fold guide ticks into clipped PDF bottom-up avoid rects', () => {
    const ticks: readonly LineSegment2D[] = [
      // Vertical tick near top edge (top-down y: 10..14 -> PDF y on 200 mm page: 186..190)
      { x1: 50, y1: 10, x2: 50, y2: 14, label: 'Spine' },
      // Tick completely outside clip region (should be excluded)
      { x1: 250, y1: 10, x2: 250, y2: 14, label: 'Clipped' },
    ];

    const rects = ticksToPdfAvoidRects(ticks, {
      pageHeightMm: 200,
      offsetXMm: 5,
      offsetYMm: 2,
      clipRectMm: { x: 0, y: 0, width: 200, height: 200 },
      strokePadMm: 0.5,
    });

    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeCloseTo(54.5, 4);
    expect(rects[0].width).toBeCloseTo(1.0, 4);
    // top-down y = 12..16 -> PDF y = 184..188, padded ±0.5 -> 183.5..188.5
    expect(rects[0].y).toBeCloseTo(183.5, 4);
    expect(rects[0].height).toBeCloseTo(5.0, 4);
  });
});
