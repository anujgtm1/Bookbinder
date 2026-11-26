import { calculateCaseGeometry } from '@/core/geometry';
import { fmtMm } from '@/lib/svgFormat';
import { computeStudioCanvasSpec, type StudioCanvasSpec } from '@/studio/canvasSpec';
import { getClassicOrnamentSpec } from '@/studio/classicOrnaments';
import {
  COVER_ORNAMENT_BOUNDS,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import type { SavedProjectRecord } from '@/types/projectLibrary';
import {
  SeriesProjectModel,
  type SeriesBandStyle,
  type SeriesBookEntry,
  type SeriesProject,
} from '@/types/seriesSpines';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { isSeriesOriginLayer, type CoverImageLayer } from '@/types/studioLayer';
import { UnitConverter, roundTo } from '@/types/units';

export const SERIES_MANAGED_ID_PREFIX = 'series-' as const;
export const SERIES_PANORAMA_LAYER_ID = 'series-panorama' as const;
export const SERIES_VOLUME_BADGE_LAYER_ID = 'series-vol-badge' as const;
export const SERIES_BANDS_ORNAMENT_ID = 'series-bands' as const;
export const SERIES_SHARED_ORNAMENT_ID = 'series-ornament' as const;

export interface SeriesPanoramaPlacement {
  /** Image layer placement in the book's CoverStudioState mm coordinates */
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface SeriesShelfPanoramaRect {
  /** Full panorama placement in shared shelf mm coordinates (origin at top-left of tallest spine) */
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface SeriesBookLayout {
  readonly index: number;
  readonly book: SeriesBookEntry;
  readonly geometry: CaseGeometry;
  readonly spec: StudioCanvasSpec;
  /** Standing left X on the shared shelf (mm) */
  readonly shelfXMm: number;
  /** Standing top Y on the shared shelf (mm); shelfXMm + spineWidthMm, shelfYMm + spineHeightMm === maxSpineHeightMm */
  readonly shelfYMm: number;
  readonly spineWidthMm: number;
  readonly spineHeightMm: number;
  readonly bgColor: string;
  readonly textColor: string;
  readonly accentColor: string;
  readonly volumeLabel: string;
  readonly requestedTitleSizePt: number;
  readonly effectiveTitleSizePt: number;
  readonly maxTitleSizePt: number;
  readonly isClamped: boolean;
  readonly effectiveAuthorLines: readonly string[];
  readonly effectiveAuthorSizePt: number;
  readonly effectiveVolumeBadgeSizePt: number;
  /** Shared-shelf mm Y coordinates for aligned spine elements */
  readonly headBandYMm: number;
  readonly tailBandYMm: number;
  readonly volumeBadgeYMm: number;
  readonly authorYMm: number;
  readonly ornamentYMm: number;
  readonly titleCenterYMm: number;
  /** Horizontal center X on shelf including per-book optical nudge */
  readonly spineCenterXMm: number;
  /** Exact band bar rects in shelf mm coordinates */
  readonly bandRectsMm: readonly Rect2D[];
  /** Exact shared ornament rect in shelf mm coordinates (null when ornamentId === 'none') */
  readonly ornamentRectMm: Rect2D | null;
  /** Exact panoramic slice placement in this book's CoverStudioState mm coordinates */
  readonly panoramaLayerPlacement: SeriesPanoramaPlacement | null;
}

export interface SeriesShelfLayout {
  readonly books: readonly SeriesBookLayout[];
  readonly totalShelfWidthMm: number;
  readonly maxSpineHeightMm: number;
  readonly minSpineHeightMm: number;
  readonly shelfGapMm: number;
  readonly hasMixedHeights: boolean;
  readonly clampedBookCount: number;
  /** Shared reference horizontal guide lines in shelf mm coordinates for visual alignment inspection */
  readonly guides: {
    readonly headBandYMm: number;
    readonly tailBandYMm: number;
    readonly volumeBadgeYMm: number;
    readonly authorYMm: number;
    readonly ornamentYMm: number;
    readonly shelfBaselineYMm: number;
  };
  readonly panoramaShelfRect: SeriesShelfPanoramaRect | null;
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes exact filled rectangular bar geometry for decorative spine bands in shelf mm coordinates.
 * Shared across the 2D Flat Shelf, 2.5D Shelf, Cover Studio compiler, Cricut HTV SVG, and Proof PDF.
 */
export function computeSeriesBandRectsMm(input: {
  readonly shelfXMm: number;
  readonly spineWidthMm: number;
  readonly headBandYMm: number;
  readonly tailBandYMm: number;
  readonly volumeBadgeYMm: number;
  readonly volumeBadgeSizePt: number;
  readonly hasVolumeLabel: boolean;
  readonly bandStyle: SeriesBandStyle;
}): readonly Rect2D[] {
  const {
    shelfXMm,
    spineWidthMm,
    headBandYMm,
    tailBandYMm,
    volumeBadgeYMm,
    volumeBadgeSizePt,
    hasVolumeLabel,
    bandStyle,
  } = input;

  if (bandStyle === 'none') return [];

  const padX = Math.min(2.2, spineWidthMm * 0.12);
  const barX = shelfXMm + padX;
  const barW = Math.max(2, spineWidthMm - padX * 2);
  const rects: Rect2D[] = [];

  if (bandStyle === 'classic-rules') {
    const t = 0.85;
    rects.push({ x: barX, y: headBandYMm - t / 2, width: barW, height: t });
    rects.push({ x: barX, y: tailBandYMm - t / 2, width: barW, height: t });
    return rects;
  }

  if (bandStyle === 'double-bands') {
    const tThick = 0.95;
    const tThin = 0.5;
    const gap = 2.0;
    rects.push({ x: barX, y: headBandYMm - gap / 2 - tThick / 2, width: barW, height: tThick });
    rects.push({ x: barX, y: headBandYMm + gap / 2 - tThin / 2, width: barW, height: tThin });
    rects.push({ x: barX, y: tailBandYMm - gap / 2 - tThin / 2, width: barW, height: tThin });
    rects.push({ x: barX, y: tailBandYMm + gap / 2 - tThick / 2, width: barW, height: tThick });
    return rects;
  }

  if (bandStyle === 'head-tail-caps') {
    const capH = 2.8;
    const accentT = 0.6;
    const accentGap = 1.6;
    rects.push({ x: barX, y: headBandYMm - capH / 2, width: barW, height: capH });
    rects.push({
      x: barX,
      y: headBandYMm + capH / 2 + accentGap,
      width: barW,
      height: accentT,
    });
    rects.push({
      x: barX,
      y: tailBandYMm - capH / 2 - accentGap - accentT,
      width: barW,
      height: accentT,
    });
    rects.push({ x: barX, y: tailBandYMm - capH / 2, width: barW, height: capH });
    return rects;
  }

  // 'framed-label': head & tail rules + framed cartouche box around volume badge (or upper band)
  const t = 0.75;
  rects.push({ x: barX, y: headBandYMm - t / 2, width: barW, height: t });
  rects.push({ x: barX, y: tailBandYMm - t / 2, width: barW, height: t });

  const boxH = Math.max(
    8,
    Math.min(18, UnitConverter.pointsToMm(volumeBadgeSizePt) * 2.1 + 3.2),
  );
  const boxCenterY = hasVolumeLabel ? volumeBadgeYMm : headBandYMm + boxH / 2 + 4;
  const boxY = boxCenterY - boxH / 2;
  const ft = 0.65;
  // Top, bottom, left, right bars forming a closed cartouche frame
  rects.push({ x: barX, y: boxY, width: barW, height: ft });
  rects.push({ x: barX, y: boxY + boxH - ft, width: barW, height: ft });
  rects.push({ x: barX, y: boxY, width: ft, height: boxH });
  rects.push({ x: barX + barW - ft, y: boxY, width: ft, height: boxH });
  return rects;
}

/**
 * Computes exact physical shelf layout, shared alignment coordinates, font-size clamping,
 * decorative band coordinates, and panoramic artwork slice placements for every volume.
 */
export function computeSeriesShelfLayout(series: SeriesProject): SeriesShelfLayout {
  const { shared } = series;
  const shelfGapMm = Math.max(0, shared.panorama.shelfGapMm);

  const rawBooks = series.books.map((book, index) => {
    const geometry = calculateCaseGeometry(book.parameters);
    const spec = computeStudioCanvasSpec(geometry);
    const spineWidthMm = geometry.outerWrap.spineRect.width;
    const spineHeightMm = geometry.outerWrap.spineRect.height;
    return { index, book, geometry, spec, spineWidthMm, spineHeightMm };
  });

  if (rawBooks.length === 0) {
    return {
      books: [],
      totalShelfWidthMm: 0,
      maxSpineHeightMm: 0,
      minSpineHeightMm: 0,
      shelfGapMm,
      hasMixedHeights: false,
      clampedBookCount: 0,
      guides: {
        headBandYMm: 0,
        tailBandYMm: 0,
        volumeBadgeYMm: 0,
        authorYMm: 0,
        ornamentYMm: 0,
        shelfBaselineYMm: 0,
      },
      panoramaShelfRect: null,
    };
  }

  const maxSpineHeightMm = Math.max(...rawBooks.map((b) => b.spineHeightMm));
  const minSpineHeightMm = Math.min(...rawBooks.map((b) => b.spineHeightMm));
  const hasMixedHeights = maxSpineHeightMm - minSpineHeightMm > 0.5;

  let cursorX = 0;
  const placedBooks = rawBooks.map((item) => {
    const shelfXMm = roundTo(cursorX, 3);
    const shelfYMm = roundTo(maxSpineHeightMm - item.spineHeightMm, 3);
    cursorX += item.spineWidthMm + shelfGapMm;
    return { ...item, shelfXMm, shelfYMm };
  });

  const totalShelfWidthMm = roundTo(
    Math.max(0, cursorX - (rawBooks.length > 0 ? shelfGapMm : 0)),
    3,
  );

  // Compute global panorama placement in shelf mm coordinates
  let panoramaShelfRect: SeriesShelfPanoramaRect | null = null;
  if (
    shared.panorama.dataUrl &&
    shared.panorama.naturalWidth > 0 &&
    shared.panorama.naturalHeight > 0 &&
    totalShelfWidthMm > 0 &&
    maxSpineHeightMm > 0
  ) {
    const natW = shared.panorama.naturalWidth;
    const natH = shared.panorama.naturalHeight;
    const aspect = natW / natH;
    let baseW: number;
    let baseH: number;
    if (shared.panorama.fitMode === 'fit-height') {
      baseH = maxSpineHeightMm;
      baseW = baseH * aspect;
    } else {
      const coverScale = Math.max(totalShelfWidthMm / natW, maxSpineHeightMm / natH);
      baseW = natW * coverScale;
      baseH = natH * coverScale;
    }
    const panoW = baseW * shared.panorama.scale;
    const panoH = baseH * shared.panorama.scale;
    const panoX = (totalShelfWidthMm - panoW) / 2 + shared.panorama.offsetXMm;
    const panoY = (maxSpineHeightMm - panoH) / 2 + shared.panorama.offsetYMm;
    panoramaShelfRect = {
      xMm: roundTo(panoX, 3),
      yMm: roundTo(panoY, 3),
      widthMm: roundTo(panoW, 3),
      heightMm: roundTo(panoH, 3),
    };
  }

  // Reference vertical lines for shelf alignment guides
  const shelfRefTopY = maxSpineHeightMm - minSpineHeightMm;
  const shelfMidY = maxSpineHeightMm - minSpineHeightMm / 2;
  const halfMinH = minSpineHeightMm / 2;

  const computeVerticalAnchors = (bookTopY: number, bookBottomY: number) => {
    if (shared.alignmentAnchor === 'book-top') {
      return {
        headBandYMm: roundTo(clamp(bookTopY + shared.bandHeadOffsetMm, bookTopY + 4, bookBottomY - 4), 2),
        tailBandYMm: roundTo(clamp(bookBottomY - shared.bandTailOffsetMm, bookTopY + 4, bookBottomY - 4), 2),
        volumeBadgeYMm: roundTo(clamp(bookTopY + shared.volumeBadgeOffsetMm, bookTopY + 6, bookBottomY - 6), 2),
        authorYMm: roundTo(clamp(bookBottomY - shared.authorOffsetMm, bookTopY + 8, bookBottomY - 6), 2),
        ornamentYMm: roundTo(clamp(bookBottomY - shared.ornamentOffsetMm, bookTopY + 10, bookBottomY - 8), 2),
      };
    }

    if (shared.alignmentAnchor === 'spine-center') {
      const headOffset = Math.max(18, halfMinH - shared.bandHeadOffsetMm);
      const tailOffset = Math.max(18, halfMinH - shared.bandTailOffsetMm);
      const badgeOffset = Math.max(14, halfMinH - shared.volumeBadgeOffsetMm);
      const authorOffset = Math.max(14, halfMinH - shared.authorOffsetMm);
      const ornOffset = Math.max(6, halfMinH - shared.ornamentOffsetMm);
      return {
        headBandYMm: roundTo(clamp(shelfMidY - headOffset, bookTopY + 4, bookBottomY - 4), 2),
        tailBandYMm: roundTo(clamp(shelfMidY + tailOffset, bookTopY + 4, bookBottomY - 4), 2),
        volumeBadgeYMm: roundTo(clamp(shelfMidY - badgeOffset, bookTopY + 6, bookBottomY - 6), 2),
        authorYMm: roundTo(clamp(shelfMidY + authorOffset, bookTopY + 8, bookBottomY - 6), 2),
        ornamentYMm: roundTo(clamp(shelfMidY + ornOffset, bookTopY + 10, bookBottomY - 8), 2),
      };
    }

    // Default: 'shelf-bottom' — laser-level horizontal alignment across all standing books
    return {
      headBandYMm: roundTo(clamp(shelfRefTopY + shared.bandHeadOffsetMm, bookTopY + 4, bookBottomY - 4), 2),
      tailBandYMm: roundTo(clamp(bookBottomY - shared.bandTailOffsetMm, bookTopY + 4, bookBottomY - 4), 2),
      volumeBadgeYMm: roundTo(clamp(shelfRefTopY + shared.volumeBadgeOffsetMm, bookTopY + 6, bookBottomY - 6), 2),
      authorYMm: roundTo(clamp(bookBottomY - shared.authorOffsetMm, bookTopY + 8, bookBottomY - 6), 2),
      ornamentYMm: roundTo(clamp(bookBottomY - shared.ornamentOffsetMm, bookTopY + 10, bookBottomY - 8), 2),
    };
  };

  let clampedBookCount = 0;

  const books: SeriesBookLayout[] = placedBooks.map((item) => {
    const { index, book, geometry, spec, shelfXMm, shelfYMm, spineWidthMm, spineHeightMm } = item;
    const bookBottomY = shelfYMm + spineHeightMm;

    const bgColor = book.spineBgColorOverride ?? shared.defaultBgColor;
    const textColor = book.textColorOverride ?? shared.defaultTextColor;
    const accentColor = book.accentColorOverride ?? shared.accentColor;

    const volumeLabel = SeriesProjectModel.formatVolumeLabel(
      index,
      shared.volumeNumberStyle,
      book.volumeLabelOverride,
    );

    const requestedTitleSizePt = book.fontSizeOverridePt ?? shared.titleSizePt;
    const maxTitleSizePt = CoverStudioModel.maxSpineFontSizePt(spineWidthMm);
    const effectiveTitleSizePt = CoverStudioModel.effectiveSpineFontSizePt(
      requestedTitleSizePt,
      spineWidthMm,
    );
    const isClamped = requestedTitleSizePt > maxTitleSizePt + 0.05;
    if (isClamped) {
      clampedBookCount += 1;
    }

    const effectiveAuthorLines =
      shared.authorOrientation === 'horizontal'
        ? CoverStudioModel.splitHorizontalAuthorLines(book.author)
        : book.author.trim()
          ? [book.author.trim()]
          : [];

    const effectiveAuthorSizePt =
      shared.authorOrientation === 'horizontal'
        ? CoverStudioModel.horizontalAuthorFontSizePt(
            effectiveAuthorLines,
            shared.authorSizePt,
            spineWidthMm,
          )
        : CoverStudioModel.effectiveSpineFontSizePt(shared.authorSizePt, spineWidthMm);

    const effectiveVolumeBadgeSizePt = volumeLabel
      ? CoverStudioModel.horizontalAuthorFontSizePt(
          [volumeLabel],
          shared.volumeBadgeSizePt,
          spineWidthMm,
        )
      : shared.volumeBadgeSizePt;

    const anchors = computeVerticalAnchors(shelfYMm, bookBottomY);

    // Compute balanced vertical center for the spine title between upper & lower decorative zones
    const upperBoundY =
      volumeLabel || shared.bandStyle !== 'none'
        ? Math.max(
            shared.bandStyle !== 'none' ? anchors.headBandYMm + 6 : shelfYMm + 10,
            volumeLabel ? anchors.volumeBadgeYMm + 8 : shelfYMm + 10,
          )
        : shelfYMm + 12;

    const lowerCandidates: number[] = [bookBottomY - 12];
    if (shared.bandStyle !== 'none') lowerCandidates.push(anchors.tailBandYMm - 6);
    if (book.author.trim() && shared.authorOrientation === 'horizontal') {
      lowerCandidates.push(anchors.authorYMm - 10);
    }
    const ornCategory =
      shared.ornamentId !== 'none' ? getClassicOrnamentSpec(shared.ornamentId).category : null;
    if (shared.ornamentId !== 'none') {
      lowerCandidates.push(anchors.ornamentYMm - (ornCategory === 'spine' ? 14 : 10));
    }
    const lowerBoundY = Math.min(...lowerCandidates);
    const titleCenterYMm =
      lowerBoundY > upperBoundY + 24
        ? roundTo((upperBoundY + lowerBoundY) / 2, 2)
        : roundTo(shelfYMm + spineHeightMm * 0.48, 2);

    const spineCenterXMm = roundTo(shelfXMm + spineWidthMm / 2 + book.opticalNudgeMm, 3);

    const bandRectsMm = computeSeriesBandRectsMm({
      shelfXMm,
      spineWidthMm,
      headBandYMm: anchors.headBandYMm,
      tailBandYMm: anchors.tailBandYMm,
      volumeBadgeYMm: anchors.volumeBadgeYMm,
      volumeBadgeSizePt: effectiveVolumeBadgeSizePt,
      hasVolumeLabel: Boolean(volumeLabel),
      bandStyle: shared.bandStyle,
    });

    let ornamentRectMm: Rect2D | null = null;
    if (shared.ornamentId !== 'none') {
      const isDivider = ornCategory === 'dividers';
      const isSpineColumn = ornCategory === 'spine';
      const maxW = Math.max(6, spineWidthMm - 4.4);
      const ornW = roundTo(Math.min(20, maxW), 2);
      const ornH = roundTo(
        isDivider
          ? Math.max(4.5, ornW * 0.34)
          : isSpineColumn
            ? Math.min(28, Math.max(16, ornW * 1.45))
            : ornW,
        2,
      );
      ornamentRectMm = {
        x: roundTo(spineCenterXMm - ornW / 2, 2),
        y: roundTo(anchors.ornamentYMm - ornH / 2, 2),
        width: ornW,
        height: ornH,
      };
    }

    let panoramaLayerPlacement: SeriesPanoramaPlacement | null = null;
    if (shared.panorama.enabled && panoramaShelfRect) {
      panoramaLayerPlacement = {
        xMm: roundTo(spec.spineBoardRect.x + (panoramaShelfRect.xMm - shelfXMm), 3),
        yMm: roundTo(spec.spineBoardRect.y + (panoramaShelfRect.yMm - shelfYMm), 3),
        widthMm: panoramaShelfRect.widthMm,
        heightMm: panoramaShelfRect.heightMm,
      };
    }

    return {
      index,
      book,
      geometry,
      spec,
      shelfXMm,
      shelfYMm,
      spineWidthMm,
      spineHeightMm,
      bgColor,
      textColor,
      accentColor,
      volumeLabel,
      requestedTitleSizePt,
      effectiveTitleSizePt,
      maxTitleSizePt,
      isClamped,
      effectiveAuthorLines,
      effectiveAuthorSizePt,
      effectiveVolumeBadgeSizePt,
      headBandYMm: anchors.headBandYMm,
      tailBandYMm: anchors.tailBandYMm,
      volumeBadgeYMm: anchors.volumeBadgeYMm,
      authorYMm: anchors.authorYMm,
      ornamentYMm: anchors.ornamentYMm,
      titleCenterYMm,
      spineCenterXMm,
      bandRectsMm,
      ornamentRectMm,
      panoramaLayerPlacement,
    };
  });

  const referenceAnchors = computeVerticalAnchors(shelfRefTopY, maxSpineHeightMm);

  return {
    books,
    totalShelfWidthMm,
    maxSpineHeightMm,
    minSpineHeightMm,
    shelfGapMm,
    hasMixedHeights,
    clampedBookCount,
    guides: {
      headBandYMm: referenceAnchors.headBandYMm,
      tailBandYMm: referenceAnchors.tailBandYMm,
      volumeBadgeYMm: referenceAnchors.volumeBadgeYMm,
      authorYMm: referenceAnchors.authorYMm,
      ornamentYMm: referenceAnchors.ornamentYMm,
      shelfBaselineYMm: maxSpineHeightMm,
    },
    panoramaShelfRect,
  };
}

function buildBandsCustomSvgOrnament(
  bookLayout: SeriesBookLayout,
): CoverOrnamentLayer | null {
  if (bookLayout.bandRectsMm.length === 0) return null;

  const { spec, shelfXMm, shelfYMm, accentColor } = bookLayout;
  const studioRects: Rect2D[] = bookLayout.bandRectsMm.map((r) => ({
    x: spec.spineBoardRect.x + (r.x - shelfXMm),
    y: spec.spineBoardRect.y + (r.y - shelfYMm),
    width: r.width,
    height: r.height,
  }));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of studioRects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }

  const rawW = maxX - minX;
  const rawH = maxY - minY;
  // Ensure bounds exceed COVER_ORNAMENT_BOUNDS.minSizeMm (8 mm) so CoverOrnamentLayerModel.deserialize never clamps
  const widthMm = roundTo(Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, rawW), 2);
  const heightMm = roundTo(Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, rawH), 2);
  const xMm = roundTo(minX - (widthMm - rawW) / 2, 2);
  const yMm = roundTo(minY - (heightMm - rawH) / 2, 2);

  const paths = studioRects.map((r) => {
    const lx1 = r.x - xMm;
    const ly1 = r.y - yMm;
    const lx2 = lx1 + r.width;
    const ly2 = ly1 + r.height;
    return `M ${fmtMm(lx1)} ${fmtMm(ly1)} L ${fmtMm(lx2)} ${fmtMm(ly1)} L ${fmtMm(lx2)} ${fmtMm(ly2)} L ${fmtMm(lx1)} ${fmtMm(ly2)} Z`;
  });

  return {
    id: SERIES_BANDS_ORNAMENT_ID,
    presetId: 'custom-svg',
    zone: 'spine',
    xMm,
    yMm,
    widthMm,
    heightMm,
    color: accentColor,
    strokeWidthMm: 0.5,
    customSvgName: 'Series Spine Bands',
    customSvgPaths: paths,
    customSvgViewBox: { width: widthMm, height: heightMm },
    customSvgRenderMode: 'fill',
    origin: 'series-spine',
  };
}

/**
 * Compiles one book in a SeriesProject into a full CoverStudioState.
 *
 * When `existingStudio` is provided (e.g., updating a book already linked to My Books),
 * all user-authored or detached front/back/spine layers, text layers, ornaments, front/back
 * background colors, and pocket styles are preserved intact while `series-spine` origin
 * elements are cleanly synchronized.
 */
export function compileSeriesBookToCoverStudio(
  series: SeriesProject,
  bookIndex: number,
  existingStudio?: CoverStudioState | null,
): CoverStudioState {
  const layout = computeSeriesShelfLayout(series);
  const bookLayout = layout.books[bookIndex];
  if (!bookLayout) {
    return existingStudio
      ? CoverStudioModel.serialize(existingStudio)
      : CoverStudioModel.createDefault();
  }

  const base = existingStudio
    ? CoverStudioModel.serialize(existingStudio)
    : CoverStudioModel.createDefault();
  const { book, spec, shelfXMm, shelfYMm } = bookLayout;
  const { shared } = series;

  const toStudioX = (shelfX: number) => roundTo(spec.spineBoardRect.x + (shelfX - shelfXMm), 2);
  const toStudioY = (shelfY: number) => roundTo(spec.spineBoardRect.y + (shelfY - shelfYMm), 2);

  // 1. Preserve non-series & detached image layers; prepend deterministic series panorama layer if active
  const preservedImageLayers = base.layers.filter((l) => !isSeriesOriginLayer(l));
  const nextLayers: CoverImageLayer[] = [];
  if (
    shared.panorama.enabled &&
    shared.panorama.dataUrl &&
    bookLayout.panoramaLayerPlacement
  ) {
    nextLayers.push({
      id: SERIES_PANORAMA_LAYER_ID,
      dataUrl: shared.panorama.dataUrl,
      fileName: shared.panorama.fileName ?? 'series-panorama.png',
      naturalWidth: shared.panorama.naturalWidth,
      naturalHeight: shared.panorama.naturalHeight,
      xMm: bookLayout.panoramaLayerPlacement.xMm,
      yMm: bookLayout.panoramaLayerPlacement.yMm,
      widthMm: bookLayout.panoramaLayerPlacement.widthMm,
      heightMm: bookLayout.panoramaLayerPlacement.heightMm,
      clipZone: 'spine',
      ...(shared.panorama.dimOpacity > 0 ? { dimOpacity: shared.panorama.dimOpacity } : {}),
      origin: 'series-spine',
    });
  }
  nextLayers.push(...preservedImageLayers);

  // 2. Preserve non-series & detached text layers; add deterministic volume badge text layer when active
  const preservedTextLayers = base.textLayers.filter((l) => !isSeriesOriginLayer(l));
  const nextTextLayers: CoverTextLayer[] = [...preservedTextLayers];
  if (bookLayout.volumeLabel) {
    nextTextLayers.push({
      id: SERIES_VOLUME_BADGE_LAYER_ID,
      text: bookLayout.volumeLabel,
      zone: 'spine',
      xMm: toStudioX(bookLayout.spineCenterXMm),
      yMm: toStudioY(bookLayout.volumeBadgeYMm),
      fontId: shared.fontId,
      fontSizePt: bookLayout.effectiveVolumeBadgeSizePt,
      letterSpacingEm: 0.08,
      lineHeight: 1.1,
      align: 'center',
      color: bookLayout.accentColor,
      uppercase: shared.volumeNumberStyle === 'roman',
      origin: 'series-spine',
    });
  }

  // 3. Preserve non-series & detached ornaments; add deterministic series bands + shared ornament
  const preservedOrnaments = base.ornaments.filter((o) => !isSeriesOriginLayer(o));
  const nextOrnaments: CoverOrnamentLayer[] = [...preservedOrnaments];

  const bandsOrnament = buildBandsCustomSvgOrnament(bookLayout);
  if (bandsOrnament) {
    nextOrnaments.push(bandsOrnament);
  }

  if (shared.ornamentId !== 'none' && bookLayout.ornamentRectMm) {
    const r = bookLayout.ornamentRectMm;
    const widthMm = roundTo(Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, r.width), 2);
    const heightMm = roundTo(Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, r.height), 2);
    const centerX = toStudioX(r.x + r.width / 2);
    const centerY = toStudioY(r.y + r.height / 2);
    nextOrnaments.push({
      id: SERIES_SHARED_ORNAMENT_ID,
      presetId: shared.ornamentId,
      zone: 'spine',
      xMm: roundTo(centerX - widthMm / 2, 2),
      yMm: roundTo(centerY - heightMm / 2, 2),
      widthMm,
      heightMm,
      color: bookLayout.accentColor,
      strokeWidthMm: 0.65,
      origin: 'series-spine',
    });
  }

  // 4. Preserve existing front/back cover colors on linked books; match spine color on fresh books
  const frontBgColor = existingStudio ? base.frontBgColor : bookLayout.bgColor;
  const backBgColor = existingStudio ? base.backBgColor : bookLayout.bgColor;

  return {
    ...base,
    frontBgColor,
    backBgColor,
    spineBgColor: bookLayout.bgColor,
    layers: nextLayers,
    textLayers: nextTextLayers,
    ornaments: nextOrnaments,
    spineText: {
      title: book.title,
      author: book.author,
      layout: shared.titleLayout,
      orientation: shared.orientation,
      authorOrientation: shared.authorOrientation,
      fontId: shared.fontId,
      customFontName: shared.customFontName,
      fontSizePt: bookLayout.effectiveTitleSizePt,
      textColor: bookLayout.textColor,
      opticalNudgeMm: book.opticalNudgeMm,
    },
  };
}

/**
 * Converts a saved book from My Books into a SeriesBookEntry while preserving
 * its linkedProjectId, physical parameters, title, author, and spine cloth color.
 */
export function createSeriesBookFromSavedRecord(record: SavedProjectRecord): SeriesBookEntry {
  const { project } = record;
  const spineTitle = project.studio.spineText.title.trim();
  const title = spineTitle || project.name.trim() || 'Untitled Book';
  const author = project.studio.spineText.author.trim();

  return SeriesProjectModel.createBookEntry({
    linkedProjectId: record.id,
    title,
    author,
    parameters: project.parameters,
    spineBgColorOverride: project.studio.spineBgColor,
    textColorOverride: project.studio.spineText.textColor,
    opticalNudgeMm: project.studio.spineText.opticalNudgeMm,
  });
}
