import { CoverTextLayerModel, type CoverTextLayer } from '@/types/coverElements';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import { CoverStudioModel, type CoverStudioState, type StudioFontId } from '@/types/studio';
import type { LayerClipZone, QuickFitTarget } from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';

export interface StudioCanvasSpec {
  readonly bleedMm: number;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly backZoneRect: Rect2D;
  readonly spineZoneRect: Rect2D;
  readonly frontZoneRect: Rect2D;
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

/** Builds an SVG transform attribute flipping a rectangular layer around its center. */
export function buildLayerFlipTransform(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  flipX?: boolean,
  flipY?: boolean,
): string | undefined {
  if (!flipX && !flipY) return undefined;
  const cx = roundTo(xMm + widthMm / 2, 3);
  const cy = roundTo(yMm + heightMm / 2, 3);
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  return `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`;
}

/** Builds an SVG transform attribute flipping an element around a point (cx, cy). */
export function buildPointFlipTransform(
  cx: number,
  cy: number,
  flipX?: boolean,
  flipY?: boolean,
): string | undefined {
  if (!flipX && !flipY) return undefined;
  const rx = roundTo(cx, 3);
  const ry = roundTo(cy, 3);
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  return `translate(${rx} ${ry}) scale(${sx} ${sy}) translate(${-rx} ${-ry})`;
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

  return {
    bleedMm,
    totalWidthMm,
    totalHeightMm,
    pixelWidth: UnitConverter.mmToPixels(totalWidthMm, dpi),
    pixelHeight: UnitConverter.mmToPixels(totalHeightMm, dpi),
    backZoneRect: {
      x: 0,
      y: 0,
      width: spineZoneStart,
      height: totalHeightMm,
    },
    spineZoneRect: {
      x: spineZoneStart,
      y: 0,
      width: frontZoneStart - spineZoneStart,
      height: totalHeightMm,
    },
    frontZoneRect: {
      x: frontZoneStart,
      y: 0,
      width: totalWidthMm - frontZoneStart,
      height: totalHeightMm,
    },
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
      return spec.frontZoneRect;
    case 'spine':
      return spec.spineZoneRect;
    case 'back':
      return spec.backZoneRect;
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
      return spec.frontZoneRect;
    case 'spine':
      return spec.spineZoneRect;
    case 'back':
      return spec.backZoneRect;
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
