import { ROLL_TOTAL_MARGIN_MM, STANDARD_ROLL_WIDTHS } from '@/resources/paperSpecs';
import type { BindingStyle, PrintMediaId } from './bookParams';
import { roundTo } from './units';

export { ROLL_TOTAL_MARGIN_MM, STANDARD_ROLL_WIDTHS };

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LineSegment2D {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly label?: string;
}

export type Polygon2D = readonly Point2D[];

export const GeometryPrimitives = {
  rectRight(rect: Rect2D): number {
    return rect.x + rect.width;
  },

  rectBottom(rect: Rect2D): number {
    return rect.y + rect.height;
  },

  rectCenter(rect: Rect2D): Point2D {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  },

  translatePoint(pt: Point2D, dx: number, dy: number): Point2D {
    return { x: pt.x + dx, y: pt.y + dy };
  },

  translatePolygon(polygon: Polygon2D, dx: number, dy: number): Polygon2D {
    return polygon.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
  },

  /** Rotate a point 90° clockwise inside a box of original height `boxHeight`. */
  rotatePoint90CW(pt: Point2D, boxHeight: number): Point2D {
    return { x: boxHeight - pt.y, y: pt.x };
  },

  polygonToSvgPoints(polygon: Polygon2D, decimals = 3): string {
    return polygon
      .map((pt) => `${roundTo(pt.x, decimals)},${roundTo(pt.y, decimals)}`)
      .join(' ');
  },

  polygonToSvgPath(polygon: Polygon2D, decimals = 3): string {
    if (polygon.length === 0) return '';
    const [first, ...rest] = polygon;
    const start = `M ${roundTo(first.x, decimals)} ${roundTo(first.y, decimals)}`;
    const lines = rest
      .map((pt) => `L ${roundTo(pt.x, decimals)} ${roundTo(pt.y, decimals)}`)
      .join(' ');
    return `${start} ${lines} Z`;
  },

  boundingBox(polygon: Polygon2D): Rect2D {
    if (polygon.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of polygon) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  },
} as const;

export interface ChipboardPieceSpec {
  readonly label: string;
  readonly quantity: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface ChipboardCutList {
  readonly coverBoards: ChipboardPieceSpec;
  readonly spineStrip: ChipboardPieceSpec;
  readonly boardThicknessMm: number;
  readonly hingeSpacerMm: number;
}

export type RollFeedOrientation = 'unrotated' | 'rotated-90';

export interface RollWidthOption {
  readonly inches: number;
  readonly widthMm: number;
  readonly label: string;
}

export interface RollRecommendation {
  readonly fits: boolean;
  readonly roll: RollWidthOption | null;
  readonly printableWidthMm: number;
  readonly orientation: RollFeedOrientation;
  readonly usedWidthMm: number;
  readonly spareWidthMm: number;
  readonly summary: string;
}

export type PrintMediaFitStatus =
  | 'fits-1-sheet'
  | 'fits-2-sheet-tile'
  | 'fits-roll'
  | 'does-not-fit';

export interface PrintMediaFitEvaluation {
  readonly mediaId: PrintMediaId;
  readonly mediaLabel: string;
  readonly status: PrintMediaFitStatus;
  /** Concrete PDF page size (mm) when outputting onto a desktop sheet (auto-oriented Portrait or Landscape) */
  readonly sheetPageWidthMm: number | null;
  readonly sheetPageHeightMm: number | null;
  /** For 'fits-2-sheet-tile', number of tiled sheets (2) and overlap width in mm (10 mm) */
  readonly tilePages: 1 | 2;
  readonly tileOverlapMm: number;
  /** Recommended larger PrintMediaId if current media cannot fit on 1 sheet */
  readonly suggestedMediaId: PrintMediaId | null;
  readonly summary: string;
}

export interface OuterWrapGeometry {
  readonly bindingStyle: BindingStyle;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly innerWidthMm: number;
  readonly turnInMm: number;
  /** Integrated flap width on each fore-edge when bindingStyle is 'softcover-jacket' or 'dust-jacket' (0 otherwise) */
  readonly jacketFlapWidthMm: number;
  /** Top & bottom mitered glue tab height on the integrated flaps when bindingStyle === 'softcover-jacket' (0 otherwise) */
  readonly jacketGlueTabHeightMm: number;
  /** 4 trapezoidal glue tab polygons (left-top, right-top, right-bottom, left-bottom) for 1-piece fold-and-glue slip cover */
  readonly jacketGlueTabPolygons: readonly Polygon2D[];
  readonly bleedMm: number;
  readonly includeBleed: boolean;
  readonly miterGapMm: number;
  readonly miterCutLegMm: number;
  readonly outerCutPolygon: Polygon2D;
  /** Score / fold guide segments in wrap-local mm coordinates (turn-ins, spine creases, flaps, glue tabs). */
  readonly foldLines: readonly LineSegment2D[];
  readonly bleedRect: Rect2D;
  readonly backBoardRect: Rect2D;
  readonly leftHingeRect: Rect2D;
  readonly spineRect: Rect2D;
  readonly rightHingeRect: Rect2D;
  readonly frontBoardRect: Rect2D;
}

export interface SplitWrapPanel {
  readonly id: 'back' | 'spine' | 'front';
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly cutPolygon: Polygon2D;
  readonly guideRects: readonly { readonly label: string; readonly rect: Rect2D }[];
}

export interface SpineLinerGeometry {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly boardOverlapMm: number;
  readonly scoreLines: readonly LineSegment2D[];
  readonly spineZoneRect: Rect2D;
  readonly leftHingeZoneRect: Rect2D;
  readonly rightHingeZoneRect: Rect2D;
}

export interface PocketEnvelopeGeometry {
  readonly side: 'front' | 'back';
  readonly label: string;
  readonly pocketWidthMm: number;
  readonly pocketHeightMm: number;
  readonly flapWidthMm: number;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  readonly openEdge: 'left' | 'right';
  readonly outerCutPolygon: Polygon2D;
  readonly faceRect: Rect2D;
  readonly scoreLines: readonly LineSegment2D[];
  readonly glueFlapPolygons: readonly Polygon2D[];
}

export interface CaseGeometry {
  readonly bindingStyle: BindingStyle;
  readonly cutList: ChipboardCutList;
  readonly outerWrap: OuterWrapGeometry;
  readonly splitPanels: readonly SplitWrapPanel[];
  readonly rollRecommendation: RollRecommendation;
  readonly mediaFit: PrintMediaFitEvaluation;
  readonly spineLiner: SpineLinerGeometry;
  readonly frontPocket: PocketEnvelopeGeometry;
  readonly backPocket: PocketEnvelopeGeometry;
}
