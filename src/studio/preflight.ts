import { BookParametersModel, type BindingStyle, type BookParameters } from '@/types/bookParams';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import type { CoverImageLayer, QuickFitTarget } from '@/types/studioLayer';
import { MM_PER_INCH, PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import { computeStudioCanvasSpec, resolveZoneClipRect } from './renderEngine';

export type PreflightSeverity = 'error' | 'warning' | 'info';
export type PreflightCategory = 'coverage' | 'resolution' | 'typography' | 'structure';

export type PreflightQuickFix =
  | {
      readonly kind: 'fit-layer';
      readonly layerId: string;
      readonly target: QuickFitTarget;
      readonly label: string;
    }
  | {
      readonly kind: 'extend-stub';
      readonly layerId: string;
      readonly side: 'front' | 'back';
      readonly label: string;
    }
  | {
      readonly kind: 'enable-bleed';
      readonly bleedMm: number;
      readonly label: string;
    }
  | {
      readonly kind: 'author-vertical';
      readonly label: string;
    }
  | {
      readonly kind: 'high-contrast-spine-text';
      readonly hexColor: string;
      readonly label: string;
    }
  | {
      readonly kind: 'enable-split-mode';
      readonly label: string;
    }
  | {
      readonly kind: 'select-layer';
      readonly layerId: string;
      readonly label: string;
    }
  | {
      readonly kind: 'switch-binding-style';
      readonly bindingStyle: BindingStyle;
      readonly label: string;
    }
  | {
      readonly kind: 'apply-pocket-proportions';
      readonly label: string;
    };

export interface PreflightHighlight {
  readonly rect: Rect2D;
  readonly label?: string;
  readonly severity: PreflightSeverity;
  /** 'hatch' fills uncovered gap strips; 'outline' frames an existing image/spine without obscuring artwork */
  readonly style?: 'hatch' | 'outline';
}

export interface PreflightIssue {
  readonly id: string;
  readonly severity: PreflightSeverity;
  readonly category: PreflightCategory;
  readonly title: string;
  readonly detail: string;
  readonly layerId?: string;
  readonly highlights: readonly PreflightHighlight[];
  readonly quickFix?: PreflightQuickFix;
}

export interface PreflightCheckSummary {
  readonly id: PreflightCategory;
  readonly label: string;
  readonly status: 'pass' | 'warning' | 'error' | 'skipped';
}

export interface PreflightOptions {
  /** When false, skips print DPI resolution checks. Defaults to true. */
  readonly checkDpi?: boolean;
  /** Set of issue IDs temporarily dismissed by the user ("Ignore for now"). */
  readonly ignoredIssueIds?: ReadonlySet<string>;
}

export interface PreflightReport {
  readonly issues: readonly PreflightIssue[];
  readonly checks: readonly PreflightCheckSummary[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly ignoredCount: number;
  readonly status: 'pass' | 'warning' | 'error';
}

const GAP_TOLERANCE_MM = 0.6;
const COVER_INTENT_MIN_OVERLAP_RATIO = 0.35;
const LOW_DPI_ERROR_THRESHOLD = 150;
const LOW_DPI_WARNING_THRESHOLD = 240;

function rectArea(r: Rect2D): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

function intersectRect(a: Rect2D, b: Rect2D): Rect2D | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function unionRects(rects: readonly Rect2D[]): Rect2D | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

interface UncoveredEdgeStrip {
  readonly edge: 'top' | 'bottom' | 'left' | 'right';
  readonly gapMm: number;
  readonly rect: Rect2D;
}

/**
 * Computes exact uncovered margin strips along requested edges of `target`
 * that are not reached by `covered`.
 */
function computeUncoveredEdges(
  target: Rect2D,
  covered: Rect2D,
  edges: readonly ('top' | 'bottom' | 'left' | 'right')[],
): UncoveredEdgeStrip[] {
  const strips: UncoveredEdgeStrip[] = [];
  const tRight = target.x + target.width;
  const tBottom = target.y + target.height;
  const cRight = covered.x + covered.width;
  const cBottom = covered.y + covered.height;

  if (edges.includes('top')) {
    const gap = Math.min(target.height, Math.max(0, covered.y - target.y));
    if (gap >= GAP_TOLERANCE_MM) {
      strips.push({
        edge: 'top',
        gapMm: roundTo(gap, 1),
        rect: { x: target.x, y: target.y, width: target.width, height: gap },
      });
    }
  }
  if (edges.includes('bottom')) {
    const gap = Math.min(target.height, Math.max(0, tBottom - cBottom));
    if (gap >= GAP_TOLERANCE_MM) {
      strips.push({
        edge: 'bottom',
        gapMm: roundTo(gap, 1),
        rect: { x: target.x, y: tBottom - gap, width: target.width, height: gap },
      });
    }
  }
  if (edges.includes('left')) {
    const gap = Math.min(target.width, Math.max(0, covered.x - target.x));
    if (gap >= GAP_TOLERANCE_MM) {
      strips.push({
        edge: 'left',
        gapMm: roundTo(gap, 1),
        rect: { x: target.x, y: target.y, width: gap, height: target.height },
      });
    }
  }
  if (edges.includes('right')) {
    const gap = Math.min(target.width, Math.max(0, tRight - cRight));
    if (gap >= GAP_TOLERANCE_MM) {
      strips.push({
        edge: 'right',
        gapMm: roundTo(gap, 1),
        rect: { x: tRight - gap, y: target.y, width: gap, height: target.height },
      });
    }
  }
  return strips;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return {
      r: Number.parseInt(normalized[0] + normalized[0], 16),
      g: Number.parseInt(normalized[1] + normalized[1], 16),
      b: Number.parseInt(normalized[2] + normalized[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }
  return null;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export const PreflightEngine = {
  /** Computes WCAG 2.1 contrast ratio between two hex colors (1.0 to 21.0). */
  contrastRatio(hexA: string, hexB: string): number | null {
    const a = parseHexRgb(hexA);
    const b = parseHexRgb(hexB);
    if (!a || !b) return null;
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return roundTo((lighter + 0.05) / (darker + 0.05), 2);
  },

  /** Suggests high-contrast bookbinding ink color (warm cream or lampblack) for a background hex. */
  suggestHighContrastInk(bgHex: string): string {
    const rgb = parseHexRgb(bgHex);
    if (!rgb) return '#f5edd8';
    return relativeLuminance(rgb) < 0.35 ? '#f5edd8' : '#1f1b16';
  },

  /** Computes the effective print DPI (worst axis) of a placed cover image layer. */
  effectiveLayerDpi(layer: CoverImageLayer): number {
    const widthInches = Math.max(0.05, layer.widthMm / MM_PER_INCH);
    const heightInches = Math.max(0.05, layer.heightMm / MM_PER_INCH);
    const dpiX = layer.naturalWidth / widthInches;
    const dpiY = layer.naturalHeight / heightInches;
    return Math.round(Math.min(dpiX, dpiY));
  },

  /** Evaluates all print consistency checks across book parameters, geometry, and cover studio state. */
  evaluate(
    params: BookParameters,
    geometry: CaseGeometry,
    studio: CoverStudioState,
    options: PreflightOptions = {},
  ): PreflightReport {
    const checkDpi = options.checkDpi ?? true;
    const ignoredIds = options.ignoredIssueIds;
    const allIssues: PreflightIssue[] = [];
    const spec = computeStudioCanvasSpec(geometry, PRINT_DPI);
    const canvasRect: Rect2D = {
      x: 0,
      y: 0,
      width: spec.totalWidthMm,
      height: spec.totalHeightMm,
    };

    const frontBoardCanvasRect: Rect2D = {
      x: geometry.outerWrap.frontBoardRect.x + spec.bleedMm,
      y: geometry.outerWrap.frontBoardRect.y + spec.bleedMm,
      width: geometry.outerWrap.frontBoardRect.width,
      height: geometry.outerWrap.frontBoardRect.height,
    };
    const backBoardCanvasRect: Rect2D = {
      x: geometry.outerWrap.backBoardRect.x + spec.bleedMm,
      y: geometry.outerWrap.backBoardRect.y + spec.bleedMm,
      width: geometry.outerWrap.backBoardRect.width,
      height: geometry.outerWrap.backBoardRect.height,
    };
    const spineCanvasRect: Rect2D = {
      x: geometry.outerWrap.spineRect.x + spec.bleedMm,
      y: geometry.outerWrap.spineRect.y + spec.bleedMm,
      width: geometry.outerWrap.spineRect.width,
      height: geometry.outerWrap.spineRect.height,
    };

    // Resolve each layer's effective visible rect (respecting optional zone clip mask)
    const visibleLayers = studio.layers.map((layer) => {
      const rawRect: Rect2D = {
        x: layer.xMm,
        y: layer.yMm,
        width: layer.widthMm,
        height: layer.heightMm,
      };
      const clipRect = resolveZoneClipRect(spec, layer.clipZone);
      const visibleRect = intersectRect(rawRect, clipRect);
      const onCanvasRect = visibleRect ? intersectRect(visibleRect, canvasRect) : null;
      return { layer, rawRect, visibleRect, onCanvasRect };
    });

    // 1. Off-canvas layer checks + Effective DPI checks
    for (const { layer, rawRect, onCanvasRect } of visibleLayers) {
      if (!onCanvasRect || rectArea(onCanvasRect) < 1) {
        allIssues.push({
          id: `off-canvas-${layer.id}`,
          severity: 'warning',
          category: 'coverage',
          layerId: layer.id,
          title: `"${layer.fileName}" is outside the printable wrap`,
          detail:
            'This artwork layer does not intersect the printable cover area and will not appear in print exports.',
          highlights: [],
          quickFix: {
            kind: 'fit-layer',
            layerId: layer.id,
            target: 'front',
            label: 'Fit to Front',
          },
        });
        continue;
      }

      if (!checkDpi) {
        continue;
      }

      const dpi = this.effectiveLayerDpi(layer);
      const maxCrispWidthMm = Math.round((layer.naturalWidth / PRINT_DPI) * MM_PER_INCH);
      const maxCrispHeightMm = Math.round((layer.naturalHeight / PRINT_DPI) * MM_PER_INCH);
      if (dpi < LOW_DPI_ERROR_THRESHOLD) {
        allIssues.push({
          id: `low-dpi-error-${layer.id}`,
          severity: 'error',
          category: 'resolution',
          layerId: layer.id,
          title: `Low print resolution (~${dpi} DPI) on "${layer.fileName}"`,
          detail: `Below 150 DPI may print visibly soft at full size. Crisp at 300 DPI up to ${maxCrispWidthMm} × ${maxCrispHeightMm} mm — shrink the image, click Ignore for now, or upload a higher-res file.`,
          highlights: [
            {
              rect: onCanvasRect,
              label: `${dpi} DPI`,
              severity: 'error',
              style: 'outline',
            },
          ],
          quickFix: {
            kind: 'select-layer',
            layerId: layer.id,
            label: 'Select Layer',
          },
        });
      } else if (dpi < LOW_DPI_WARNING_THRESHOLD) {
        allIssues.push({
          id: `low-dpi-warn-${layer.id}`,
          severity: 'warning',
          category: 'resolution',
          layerId: layer.id,
          title: `Moderate print resolution (~${dpi} DPI) on "${layer.fileName}"`,
          detail: `Crisp at 300 DPI up to ${maxCrispWidthMm} × ${maxCrispHeightMm} mm. Usable as-is, or shrink slightly / click Ignore for now.`,
          highlights: [
            {
              rect: rawRect,
              label: `${dpi} DPI`,
              severity: 'warning',
              style: 'outline',
            },
          ],
          quickFix: {
            kind: 'select-layer',
            layerId: layer.id,
            label: 'Select Layer',
          },
        });
      }
    }

    // 2. Front & Back Cover board + turn-in/bleed coverage checks
    const auditCoverZone = (
      side: 'front' | 'back',
      boardRect: Rect2D,
      zoneRect: Rect2D,
      outerEdges: readonly ('top' | 'bottom' | 'left' | 'right')[],
    ) => {
      const boardArea = rectArea(boardRect);
      const coveringCandidates = visibleLayers
        .map((entry) => {
          const overlap = entry.onCanvasRect ? intersectRect(entry.onCanvasRect, boardRect) : null;
          const overlapRatio = overlap ? rectArea(overlap) / Math.max(1, boardArea) : 0;
          return { ...entry, overlapRatio };
        })
        .filter((entry) => entry.overlapRatio >= COVER_INTENT_MIN_OVERLAP_RATIO);

      if (coveringCandidates.length === 0) return;

      const primary = coveringCandidates.reduce((best, cur) =>
        cur.overlapRatio > best.overlapRatio ? cur : best,
      );
      const combinedCovered = unionRects(
        coveringCandidates
          .map((c) => c.onCanvasRect)
          .filter((r): r is Rect2D => r !== null),
      );
      if (!combinedCovered) return;

      const sideTitle = side === 'front' ? 'Front cover' : 'Back cover';
      const fitLabel = side === 'front' ? 'Fit to Front' : 'Fit to Back';

      // 2a. Check if the physical board face itself has an uncovered gap
      const boardGaps = computeUncoveredEdges(boardRect, combinedCovered, [
        'top',
        'bottom',
        'left',
        'right',
      ]);
      if (boardGaps.length > 0) {
        const edgeSummary = boardGaps.map((g) => `${g.edge} (${g.gapMm} mm)`).join(', ');
        allIssues.push({
          id: `${side}-board-gap`,
          severity: 'error',
          category: 'coverage',
          layerId: primary.layer.id,
          title: `${sideTitle} artwork leaves an uncovered board gap`,
          detail: `Artwork stops short of the ${side} chipboard face on ${edgeSummary}, exposing raw base color on the visible cover.`,
          highlights: boardGaps.map((g) => ({
            rect: g.rect,
            label: `${g.gapMm} mm gap`,
            severity: 'error',
          })),
          quickFix: {
            kind: 'fit-layer',
            layerId: primary.layer.id,
            target: side,
            label: fitLabel,
          },
        });
        return;
      }

      // 2b. Board is covered — verify artwork extends cleanly across outer turn-in + bleed edges
      const turnInGaps = computeUncoveredEdges(zoneRect, combinedCovered, outerEdges);
      if (turnInGaps.length > 0) {
        const edgeSummary = turnInGaps.map((g) => `${g.edge} (${g.gapMm} mm)`).join(', ');
        allIssues.push({
          id: `${side}-turnin-gap`,
          severity: 'warning',
          category: 'coverage',
          layerId: primary.layer.id,
          title: `${sideTitle} stops short of outer turn-in / bleed`,
          detail: `Artwork covers the board face but leaves ${edgeSummary} uncovered along the folded turn-in/bleed edge — risk of a colored seam when wrapped.`,
          highlights: turnInGaps.map((g) => ({
            rect: g.rect,
            label: `${g.gapMm} mm short`,
            severity: 'warning',
          })),
          quickFix: {
            kind: 'extend-stub',
            layerId: primary.layer.id,
            side,
            label: 'Extend Edges to Stub',
          },
        });
      }
    };

    auditCoverZone('front', frontBoardCanvasRect, spec.frontZoneRect, ['top', 'bottom', 'right']);
    auditCoverZone('back', backBoardCanvasRect, spec.backZoneRect, ['top', 'bottom', 'left']);

    // 3. Spine typography contrast, clamping & clearance checks
    const hasSpineText =
      studio.spineText.title.trim().length > 0 || studio.spineText.author.trim().length > 0;
    const spineArea = rectArea(spineCanvasRect);
    const hasArtworkOnSpine = visibleLayers.some((entry) => {
      const ov = entry.onCanvasRect ? intersectRect(entry.onCanvasRect, spineCanvasRect) : null;
      return ov !== null && rectArea(ov) / Math.max(1, spineArea) >= 0.45;
    });

    if (hasSpineText) {
      if (!hasArtworkOnSpine) {
        const ratio = this.contrastRatio(studio.spineText.textColor, studio.spineBgColor);
        if (ratio !== null && ratio < 3.0) {
          const suggestedHex = this.suggestHighContrastInk(studio.spineBgColor);
          allIssues.push({
            id: 'spine-low-contrast-error',
            severity: 'error',
            category: 'typography',
            title: `Spine text contrast is too low (${ratio}:1)`,
            detail:
              'Spine lettering blends into the spine background and may be unreadable once printed.',
            highlights: [
              {
                rect: spineCanvasRect,
                label: `Contrast ${ratio}:1`,
                severity: 'error',
              },
            ],
            quickFix: {
              kind: 'high-contrast-spine-text',
              hexColor: suggestedHex,
              label: 'Use High-Contrast Ink',
            },
          });
        } else if (ratio !== null && ratio < 4.5) {
          const suggestedHex = this.suggestHighContrastInk(studio.spineBgColor);
          allIssues.push({
            id: 'spine-low-contrast-warn',
            severity: 'warning',
            category: 'typography',
            title: `Moderate spine text contrast (${ratio}:1)`,
            detail:
              'Aim for ≥ 4.5:1 contrast so small serif lettering stays crisp on textured bookcloth or matte paper.',
            highlights: [
              {
                rect: spineCanvasRect,
                label: `Contrast ${ratio}:1`,
                severity: 'warning',
              },
            ],
            quickFix: {
              kind: 'high-contrast-spine-text',
              hexColor: suggestedHex,
              label: 'Boost Contrast',
            },
          });
        }
      }

      const maxPt = CoverStudioModel.maxSpineFontSizePt(geometry.outerWrap.spineRect.width);
      if (studio.spineText.fontSizePt > maxPt + 0.1) {
        allIssues.push({
          id: 'spine-font-clamped',
          severity: 'warning',
          category: 'typography',
          title: `Spine font auto-clamped to ${maxPt} pt`,
          detail: `Requested ${studio.spineText.fontSizePt} pt exceeds safe spine width (${roundTo(geometry.outerWrap.spineRect.width, 1)} mm minus 4 mm hinge clearance).`,
          highlights: [
            {
              rect: spineCanvasRect,
              label: `Max ${maxPt} pt`,
              severity: 'warning',
            },
          ],
        });
      }

      if (
        studio.spineText.authorOrientation === 'horizontal' &&
        studio.spineText.author.trim().length > 0
      ) {
        const lines = CoverStudioModel.splitHorizontalAuthorLines(studio.spineText.author);
        const horizPt = CoverStudioModel.horizontalAuthorFontSizePt(
          lines,
          CoverStudioModel.effectiveSpineFontSizePt(
            studio.spineText.fontSizePt,
            geometry.outerWrap.spineRect.width,
          ),
          geometry.outerWrap.spineRect.width,
        );
        if (horizPt < 6.5) {
          allIssues.push({
            id: 'spine-horizontal-author-small',
            severity: 'warning',
            category: 'typography',
            title: `Horizontal author name shrinks to ~${roundTo(horizPt, 1)} pt`,
            detail:
              'This spine is narrow for horizontal lettering; switching Author Writing to Vertical keeps the author name larger and sharper.',
            highlights: [
              {
                rect: spineCanvasRect,
                label: `~${roundTo(horizPt, 1)} pt`,
                severity: 'warning',
              },
            ],
            quickFix: {
              kind: 'author-vertical',
              label: 'Switch to Vertical',
            },
          });
        }
      }

      // Check vertical length of spine text against board height
      const effPt = CoverStudioModel.effectiveSpineFontSizePt(
        studio.spineText.fontSizePt,
        geometry.outerWrap.spineRect.width,
      );
      const combinedChars =
        studio.spineText.layout === 'inline'
          ? [studio.spineText.title.trim(), studio.spineText.author.trim()]
              .filter(Boolean)
              .join(' — ').length
          : studio.spineText.title.trim().length;
      const estimatedSpanMm = combinedChars * UnitConverter.pointsToMm(effPt) * 0.56;
      const safeHeightMm =
        studio.spineText.layout === 'stacked'
          ? geometry.outerWrap.spineRect.height * 0.68
          : geometry.outerWrap.spineRect.height - 20;
      if (estimatedSpanMm > safeHeightMm) {
        allIssues.push({
          id: 'spine-text-length-overflow',
          severity: 'warning',
          category: 'typography',
          title: 'Spine title may crowd the top/bottom edges',
          detail:
            'Your spine text is long relative to the book height at this font size. Consider reducing the font size slightly.',
          highlights: [
            {
              rect: spineCanvasRect,
              label: 'Tight vertical fit',
              severity: 'warning',
            },
          ],
        });
      }
    }

    // 4. Structural, Binding Style & Print Readiness Checks
    const style = params.bindingStyle ?? 'rigid-case';
    if (params.pbThicknessMm < 8 && style === 'rigid-case') {
      allIssues.push({
        id: 'thin-book-rigid-spine',
        severity: 'warning',
        category: 'structure',
        title: `Thin book (${roundTo(params.pbThicknessMm, 1)} mm) — Flexible Spine recommended`,
        detail:
          'Rigid spine boards under 8 mm make thin notebooks stiff and stress the hinges. Switch to Flexible Spine (2-board, no spine strip) or Softcover Jacket — or click Ignore if you prefer a rigid spine.',
        highlights: [],
        quickFix: {
          kind: 'switch-binding-style',
          bindingStyle: 'flexible-spine',
          label: 'Switch to Flexible Spine',
        },
      });
    } else if (params.pbThicknessMm >= 18 && style !== 'rigid-case') {
      allIssues.push({
        id: 'thick-book-non-rigid',
        severity: 'warning',
        category: 'structure',
        title: `Thick book (${roundTo(params.pbThicknessMm, 1)} mm) — Rigid 3-Board Spine recommended`,
        detail:
          'Books 18 mm and thicker hold their shape much better on a shelf with a rigid chipboard spine strip.',
        highlights: [],
        quickFix: {
          kind: 'switch-binding-style',
          bindingStyle: 'rigid-case',
          label: 'Switch to Rigid Spine',
        },
      });
    }

    if (params.pbWidthMm <= 115 && style !== 'softcover-jacket' && params.boardThicknessMm >= 2.0) {
      allIssues.push({
        id: 'pocket-book-thick-board',
        severity: 'warning',
        category: 'structure',
        title: 'Pocket-size book — slimmer 1.5 mm board & 14 mm turn-ins recommended',
        detail:
          'For compact A6 / pocket formats, 2.0 mm greyboard and 18 mm turn-ins can feel bulky. Slimming to 1.5 mm board, 14 mm turn-ins, and tighter overhang gives crisp pocket proportions.',
        highlights: [],
        quickFix: {
          kind: 'apply-pocket-proportions',
          label: 'Use Pocket Proportions',
        },
      });
    }

    if (!params.includeBleed && studio.layers.length > 0) {
      allIssues.push({
        id: 'bleed-disabled',
        severity: 'warning',
        category: 'structure',
        title: 'Outer artwork bleed is turned off',
        detail:
          'Enabling at least 3 mm of bleed prevents accidental white trim slivers along the outer cut edge when hand-cutting.',
        highlights: [],
        quickFix: {
          kind: 'enable-bleed',
          bleedMm: 3,
          label: 'Enable 3 mm Bleed',
        },
      });
    }

    if (!geometry.rollRecommendation.fits && params.splitMode === 'single') {
      allIssues.push({
        id: 'roll-width-exceeded',
        severity: 'warning',
        category: 'structure',
        title: 'Wrap exceeds standard roll printer widths',
        detail:
          'Switch to 3-Piece Quarter-Bound Split to print Front, Back, and Spine panels on desktop sheets.',
        highlights: [],
        quickFix: {
          kind: 'enable-split-mode',
          label: 'Enable 3-Piece Split',
        },
      });
    }

    const paramValidation = BookParametersModel.validate(params);
    paramValidation.errors.forEach((msg, idx) => {
      allIssues.push({
        id: `param-error-${idx}`,
        severity: 'error',
        category: 'structure',
        title: 'Invalid book dimension',
        detail: msg,
        highlights: [],
      });
    });
    paramValidation.warnings.forEach((msg, idx) => {
      allIssues.push({
        id: `param-warn-${idx}`,
        severity: 'warning',
        category: 'structure',
        title: 'Book construction notice',
        detail: msg,
        highlights: [],
      });
    });

    // Partition active vs. temporarily ignored issues
    let ignoredCount = 0;
    const issues: PreflightIssue[] = [];
    for (const issue of allIssues) {
      if (ignoredIds?.has(issue.id)) {
        ignoredCount += 1;
      } else {
        issues.push(issue);
      }
    }

    // Sort errors first, then warnings, then info
    const severityOrder: Record<PreflightSeverity, number> = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const categoryStatus = (cat: PreflightCategory): 'pass' | 'warning' | 'error' | 'skipped' => {
      if (cat === 'resolution' && !checkDpi) return 'skipped';
      const matching = issues.filter((i) => i.category === cat);
      if (matching.some((i) => i.severity === 'error')) return 'error';
      if (matching.some((i) => i.severity === 'warning')) return 'warning';
      return 'pass';
    };

    const checks: PreflightCheckSummary[] = [
      { id: 'coverage', label: 'Cover & Turn-In Coverage', status: categoryStatus('coverage') },
      {
        id: 'resolution',
        label: checkDpi ? '300 DPI Print Resolution' : 'DPI Check (Off)',
        status: categoryStatus('resolution'),
      },
      { id: 'typography', label: 'Spine Contrast & Clearance', status: categoryStatus('typography') },
      { id: 'structure', label: 'Bleed & Structural Fit', status: categoryStatus('structure') },
    ];

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const status: 'pass' | 'warning' | 'error' =
      errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'pass';

    return {
      issues,
      checks,
      errorCount,
      warningCount,
      ignoredCount,
      status,
    };
  },
};
