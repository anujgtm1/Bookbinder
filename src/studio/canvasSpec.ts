import { resolveBindingStrategy } from '@/core/bindingStyles';
import { CoverTextLayerModel, type CoverTextLayer } from '@/types/coverElements';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import { CoverStudioModel, type CoverStudioState, type StudioFontId } from '@/types/studio';
import {
  normalizeQuarterTurn,
  type LayerClipZone,
  type QuickFitTarget,
} from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';

export interface StudioCanvasSpec {
  readonly bleedMm: number;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** Full background band for back side (including turn-in / back flap). */
  readonly backZoneRect: Rect2D;
  /** Full background band for spine (including top/bottom turn-in or trim). */
  readonly spineZoneRect: Rect2D;
  /** Full background band for front side (including turn-in / front flap). */
  readonly frontZoneRect: Rect2D;
  /** Artwork fit & clip bounds for back cover (excludes tuck flaps and glue tabs on flap covers). */
  readonly backArtworkRect: Rect2D;
  /** Artwork fit & clip bounds for spine (excludes top/bottom cut-away waste on glue-tab covers). */
  readonly spineArtworkRect: Rect2D;
  /** Artwork fit & clip bounds for front cover (excludes tuck flaps and glue tabs on flap covers). */
  readonly frontArtworkRect: Rect2D;
  readonly fullWrapRect: Rect2D;
}

export interface SpineTextPlacement {
  readonly text: string;
  readonly anchorXMm: number;
  readonly anchorYMm: number;
  readonly fontSizePt: number;
  readonly rotationDegCss: 0 | 90 | -90;
  readonly kind: 'inline' | 'title' | 'author';
}

export interface CoverTextLinePlacement {
  readonly text: string;
  readonly anchorXMm: number;
  readonly anchorYMm: number;
  readonly fontSizePt: number;
  readonly letterSpacingEm: number;
  readonly align: CoverTextLayer['align'];
  readonly color: string;
  readonly fontId: StudioFontId;
}

/**
 * Builds an SVG transform attribute rotating (clockwise quarter-turns) and/or flipping
 * an element around a point (cx, cy). Returns undefined when no flip and rotation === 0.
 */
export function buildPointFlipTransform(
  cx: number,
  cy: number,
  flipX?: boolean,
  flipY?: boolean,
  rotationDeg?: number,
): string | undefined {
  const rot = normalizeQuarterTurn(rotationDeg);
  if (!flipX && !flipY && rot === 0) return undefined;
  const rx = roundTo(cx, 3);
  const ry = roundTo(cy, 3);
  const parts: string[] = [`translate(${rx} ${ry})`];
  if (rot !== 0) {
    parts.push(`rotate(${rot})`);
  }
  if (flipX || flipY) {
    const sx = flipX ? -1 : 1;
    const sy = flipY ? -1 : 1;
    parts.push(`scale(${sx} ${sy})`);
  }
  parts.push(`translate(${-rx} ${-ry})`);
  return parts.join(' ');
}

/**
 * Builds an SVG transform attribute rotating (clockwise quarter-turns) and/or flipping
 * a rectangular layer around its center. Returns undefined when no flip and rotation === 0.
 */
export function buildLayerFlipTransform(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  flipX?: boolean,
  flipY?: boolean,
  rotationDeg?: number,
): string | undefined {
  return buildPointFlipTransform(
    xMm + widthMm / 2,
    yMm + heightMm / 2,
    flipX,
    flipY,
    rotationDeg,
  );
}

export function computeStudioCanvasSpec(
  geometry: CaseGeometry,
  dpi = PRINT_DPI,
): StudioCanvasSpec {
  const { outerWrap } = geometry;
  const bleedMm = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const totalWidthMm = outerWrap.widthMm + bleedMm * 2;
  const totalHeightMm = outerWrap.heightMm + bleedMm * 2;

  const spineZoneStart = bleedMm + outerWrap.leftHingeRect.x;
  const frontZoneStart = bleedMm + outerWrap.frontBoardRect.x;
  const strategy = resolveBindingStrategy(outerWrap);

  const backZoneRect: Rect2D = {
    x: 0,
    y: 0,
    width: spineZoneStart,
    height: totalHeightMm,
  };
  const spineZoneRect: Rect2D = {
    x: spineZoneStart,
    y: 0,
    width: frontZoneStart - spineZoneStart,
    height: totalHeightMm,
  };
  const frontZoneRect: Rect2D = {
    x: frontZoneStart,
    y: 0,
    width: totalWidthMm - frontZoneStart,
    height: totalHeightMm,
  };

  // On covers with fold-in flaps or top/bottom glue tabs (slip covers & dust jackets), Fit Front/Back
  // and front/back clip masks target the visible cover face instead of spilling onto tuck flaps or glue tabs.
  const backArtworkRect: Rect2D =
    strategy.capabilities.hasFlaps || strategy.capabilities.hasGlueTabs
      ? {
          x: strategy.capabilities.hasFlaps ? bleedMm + outerWrap.backBoardRect.x : 0,
          y: strategy.capabilities.hasGlueTabs ? bleedMm + outerWrap.backBoardRect.y : 0,
          width: strategy.capabilities.hasFlaps ? outerWrap.backBoardRect.width : spineZoneStart,
          height: strategy.capabilities.hasGlueTabs ? outerWrap.backBoardRect.height : totalHeightMm,
        }
      : backZoneRect;

  const spineArtworkRect: Rect2D = strategy.capabilities.hasGlueTabs
    ? {
        x: spineZoneStart,
        y: bleedMm + outerWrap.spineRect.y,
        width: frontZoneStart - spineZoneStart,
        height: outerWrap.spineRect.height,
      }
    : spineZoneRect;

  const frontArtworkRect: Rect2D =
    strategy.capabilities.hasFlaps || strategy.capabilities.hasGlueTabs
      ? {
          x: strategy.capabilities.hasFlaps ? bleedMm + outerWrap.frontBoardRect.x : frontZoneStart,
          y: strategy.capabilities.hasGlueTabs ? bleedMm + outerWrap.frontBoardRect.y : 0,
          width: strategy.capabilities.hasFlaps
            ? outerWrap.frontBoardRect.width
            : totalWidthMm - frontZoneStart,
          height: strategy.capabilities.hasGlueTabs ? outerWrap.frontBoardRect.height : totalHeightMm,
        }
      : frontZoneRect;

  return {
    bleedMm,
    totalWidthMm,
    totalHeightMm,
    pixelWidth: UnitConverter.mmToPixels(totalWidthMm, dpi),
    pixelHeight: UnitConverter.mmToPixels(totalHeightMm, dpi),
    backZoneRect,
    spineZoneRect,
    frontZoneRect,
    backArtworkRect,
    spineArtworkRect,
    frontArtworkRect,
    fullWrapRect: {
      x: 0,
      y: 0,
      width: totalWidthMm,
      height: totalHeightMm,
    },
  };
}

export function resolveZoneClipRect(
  spec: StudioCanvasSpec,
  clipZone: LayerClipZone,
): Rect2D {
  switch (clipZone) {
    case 'front':
      return spec.frontArtworkRect;
    case 'spine':
      return spec.spineArtworkRect;
    case 'back':
      return spec.backArtworkRect;
    case 'none':
      return spec.fullWrapRect;
  }
}

export function resolveQuickFitRect(
  spec: StudioCanvasSpec,
  target: QuickFitTarget,
): Rect2D {
  switch (target) {
    case 'front':
      return spec.frontArtworkRect;
    case 'spine':
      return spec.spineArtworkRect;
    case 'back':
      return spec.backArtworkRect;
    case 'fullWrap':
      return spec.fullWrapRect;
  }
}

export function computeSpineTextPlacements(
  geometry: CaseGeometry,
  studio: CoverStudioState,
): readonly SpineTextPlacement[] {
  const { outerWrap } = geometry;
  const bleedMm = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const { spineText } = studio;
  const title = spineText.title.trim();
  const author = spineText.author.trim();

  if (!title && !author) return [];

  const spineCenterX =
    bleedMm + outerWrap.spineRect.x + outerWrap.spineRect.width / 2 + spineText.opticalNudgeMm;
  const boardTopY = bleedMm + outerWrap.spineRect.y;
  const boardH = outerWrap.spineRect.height;

  const baseFontSizePt = CoverStudioModel.effectiveSpineFontSizePt(
    spineText.fontSizePt,
    outerWrap.spineRect.width,
  );
  const verticalRotDeg: 90 | -90 = spineText.orientation === 'top-to-bottom' ? 90 : -90;
  const isAuthorHorizontal = spineText.authorOrientation === 'horizontal';

  if (spineText.layout === 'inline' && !isAuthorHorizontal) {
    return [
      {
        text: CoverStudioModel.formatInlineSpineText(title, author),
        anchorXMm: spineCenterX,
        anchorYMm: boardTopY + boardH / 2,
        fontSizePt: baseFontSizePt,
        rotationDegCss: verticalRotDeg,
        kind: 'inline',
      },
    ];
  }

  // Stacked layout (or Horizontal author mode): Title upper-center, Author near tail of spine
  const placements: SpineTextPlacement[] = [];
  if (title) {
    placements.push({
      text: title,
      anchorXMm: spineCenterX,
      anchorYMm: boardTopY + boardH * (author ? (isAuthorHorizontal ? 0.42 : 0.36) : 0.5),
      fontSizePt: baseFontSizePt,
      rotationDegCss: verticalRotDeg,
      kind: 'title',
    });
  }

  if (author) {
    const requestedAuthorPt = roundTo(Math.max(6, baseFontSizePt * 0.78), 1);

    if (isAuthorHorizontal) {
      const lines = CoverStudioModel.splitHorizontalAuthorLines(author);
      const horizPt = CoverStudioModel.horizontalAuthorFontSizePt(
        lines,
        requestedAuthorPt,
        outerWrap.spineRect.width,
      );
      const lineHeightMm = UnitConverter.pointsToMm(horizPt) * 1.28;
      const blockCenterY = boardTopY + boardH * (title ? 0.88 : 0.5);
      const firstLineY = blockCenterY - ((lines.length - 1) * lineHeightMm) / 2;

      lines.forEach((line, idx) => {
        placements.push({
          text: line,
          anchorXMm: spineCenterX,
          anchorYMm: roundTo(firstLineY + idx * lineHeightMm, 2),
          fontSizePt: horizPt,
          rotationDegCss: 0,
          kind: 'author',
        });
      });
    } else {
      placements.push({
        text: author,
        anchorXMm: spineCenterX,
        anchorYMm: boardTopY + boardH * (title ? 0.8 : 0.5),
        fontSizePt: requestedAuthorPt,
        rotationDegCss: verticalRotDeg,
        kind: 'author',
      });
    }
  }
  return placements;
}

/** Computes exact multi-line millimeter anchors for a draggable CoverTextLayer. */
export function computeCoverTextLinePlacements(
  layer: CoverTextLayer,
): readonly CoverTextLinePlacement[] {
  const lines = CoverTextLayerModel.displayLines(layer);
  const stepMm = UnitConverter.pointsToMm(layer.fontSizePt) * layer.lineHeight;
  const firstY = layer.yMm - ((lines.length - 1) * stepMm) / 2;

  return lines.map((line, idx) => ({
    text: line,
    anchorXMm: layer.xMm,
    anchorYMm: roundTo(firstY + idx * stepMm, 2),
    fontSizePt: layer.fontSizePt,
    letterSpacingEm: layer.letterSpacingEm,
    align: layer.align,
    color: layer.color,
    fontId: layer.fontId,
  }));
}
