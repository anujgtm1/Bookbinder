import type {
  ClassicOrnamentCategory,
  ClassicOrnamentId,
  CoverElementZone,
  CoverOrnamentLayer,
} from '@/types/coverElements';
import { roundTo } from '@/types/units';
import { mapNormalizedPathsToMm } from './svgStampParser';

export interface ClassicOrnamentSpec {
  readonly id: ClassicOrnamentId;
  readonly label: string;
  readonly category: ClassicOrnamentCategory;
  readonly defaultZone: CoverElementZone;
  readonly description: string;
}

export const CLASSIC_ORNAMENTS: readonly ClassicOrnamentSpec[] = [
  {
    id: 'frame-single-rule',
    label: 'Single Hairline Frame',
    category: 'frames',
    defaultZone: 'front',
    description: 'Clean minimalist single-rule border',
  },
  {
    id: 'frame-double-rule',
    label: 'Classic Double Rule',
    category: 'frames',
    defaultZone: 'front',
    description: 'Timeless outer + inner blind-tooled frame',
  },
  {
    id: 'frame-art-deco',
    label: 'Art Deco Stepped',
    category: 'frames',
    defaultZone: 'front',
    description: '1920s stepped geometric corner frame',
  },
  {
    id: 'frame-notched-corner',
    label: 'Notched Corner Frame',
    category: 'frames',
    defaultZone: 'front',
    description: 'Inward-notched classic clothbound frame',
  },
  {
    id: 'corners-classic-scroll',
    label: '4-Corner Flourishes',
    category: 'corners',
    defaultZone: 'front',
    description: 'Mirrored vintage corner brackets & diamonds',
  },
  {
    id: 'corners-deco-chevron',
    label: 'Art Deco Corners',
    category: 'corners',
    defaultZone: 'front',
    description: '4 nested geometric chevron corners',
  },
  {
    id: 'divider-diamond-rule',
    label: 'Diamond Title Rule',
    category: 'dividers',
    defaultZone: 'front',
    description: 'Tapered rule with central diamond lozenge',
  },
  {
    id: 'divider-fleuron-leaf',
    label: 'Aldus Fleuron',
    category: 'dividers',
    defaultZone: 'front',
    description: 'Classic bookbindery leaf fleuron divider',
  },
  {
    id: 'divider-celestial-stars',
    label: 'Celestial Trio',
    category: 'dividers',
    defaultZone: 'front',
    description: 'Four-point star & flanking spark stars',
  },
  {
    id: 'emblem-compass-rose',
    label: 'Compass Rose',
    category: 'emblems',
    defaultZone: 'front',
    description: '8-point adventure & classic travel star',
  },
  {
    id: 'emblem-botanical-sprig',
    label: 'Botanical Laurel',
    category: 'emblems',
    defaultZone: 'front',
    description: 'Symmetrical botanical leaf medallion',
  },
  {
    id: 'spine-classic-bands',
    label: '5-Band Spine Rules',
    category: 'spine',
    defaultZone: 'spine',
    description: 'Classic raised-band foil bars across spine',
  },
  {
    id: 'spine-title-cartouche',
    label: 'Spine Title Cartouche',
    category: 'spine',
    defaultZone: 'spine',
    description: 'Gilded double-rule box around upper spine title',
  },
  {
    id: 'spine-head-tail-bands',
    label: 'Head & Tail Spine Bands',
    category: 'spine',
    defaultZone: 'spine',
    description: 'Decorative top/bottom bands leaving center clear for title',
  },
  {
    id: 'spine-botanical-vine',
    label: 'Spine Botanical Vine',
    category: 'spine',
    defaultZone: 'spine',
    description: 'Vertical clothbound vine with paired leaves along spine',
  },
  {
    id: 'spine-celestial-column',
    label: 'Spine Celestial Column',
    category: 'spine',
    defaultZone: 'spine',
    description: 'Vertical column of stars & diamond accents down spine',
  },
  {
    id: 'spine-diamond-lattice',
    label: 'Art Deco Spine Lattice',
    category: 'spine',
    defaultZone: 'spine',
    description: 'Stacked geometric diamond filigree panel along spine',
  },
] as const;

export function getClassicOrnamentSpec(id: ClassicOrnamentId): ClassicOrnamentSpec {
  if (id === 'custom-svg') {
    return {
      id: 'custom-svg',
      label: 'Custom SVG Stamp',
      category: 'emblems',
      defaultZone: 'front',
      description: 'User-imported vector SVG stamp',
    };
  }
  return CLASSIC_ORNAMENTS.find((o) => o.id === id) ?? CLASSIC_ORNAMENTS[0];
}

export interface OrnamentSvgRenderStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidthMm: number;
}

/** Resolves fill & stroke styling for built-in parametric ornaments and custom imported SVG stamps. */
export function getOrnamentSvgStyle(ornament: CoverOrnamentLayer): OrnamentSvgRenderStyle {
  if (ornament.presetId !== 'custom-svg') {
    return { fill: ornament.color, stroke: 'none', strokeWidthMm: 0 };
  }
  const mode = ornament.customSvgRenderMode ?? 'fill';
  if (mode === 'stroke') {
    return { fill: 'none', stroke: ornament.color, strokeWidthMm: ornament.strokeWidthMm };
  }
  if (mode === 'fill-and-stroke') {
    return { fill: ornament.color, stroke: ornament.color, strokeWidthMm: ornament.strokeWidthMm };
  }
  return { fill: ornament.color, stroke: 'none', strokeWidthMm: 0 };
}

const fmt = (n: number): string => String(roundTo(n, 3));

/** Builds a closed filled rectangle path (`M ... L ... Z`) in absolute coordinates. */
function rectBar(
  x: number,
  y: number,
  w: number,
  h: number,
  mapX: (vx: number) => number,
  mapY: (vy: number) => number,
): string {
  const x1 = mapX(x);
  const x2 = mapX(x + w);
  const y1 = mapY(y);
  const y2 = mapY(y + h);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return `M ${fmt(left)} ${fmt(top)} L ${fmt(right)} ${fmt(top)} L ${fmt(right)} ${fmt(bottom)} L ${fmt(left)} ${fmt(bottom)} Z`;
}

/** Builds a closed filled rectangular hollow frame (`evenodd` outer + inner ring or 4 clean joined bars). */
function rectFrameBars(
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  mapX: (vx: number) => number,
  mapY: (vy: number) => number,
): string[] {
  const thickness = Math.min(t, w * 0.25, h * 0.25);
  return [
    rectBar(x, y, w, thickness, mapX, mapY),
    rectBar(x, y + h - thickness, w, thickness, mapX, mapY),
    rectBar(x, y + thickness, thickness, Math.max(0, h - thickness * 2), mapX, mapY),
    rectBar(
      x + w - thickness,
      y + thickness,
      thickness,
      Math.max(0, h - thickness * 2),
      mapX,
      mapY,
    ),
  ];
}

function polygonPath(
  pts: readonly (readonly [number, number])[],
  mapX: (vx: number) => number,
  mapY: (vy: number) => number,
): string {
  if (pts.length === 0) return '';
  const [first, ...rest] = pts;
  const start = `M ${fmt(mapX(first[0]))} ${fmt(mapY(first[1]))}`;
  const lines = rest.map(([px, py]) => `L ${fmt(mapX(px))} ${fmt(mapY(py))}`).join(' ');
  return `${start} ${lines} Z`;
}

/** Builds a thick closed bar between two points (for diagonal struts/rays in Cricut-ready closed polygons). */
function segmentBar(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  thickness: number,
  mapX: (vx: number) => number,
  mapY: (vy: number) => number,
): string {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return '';
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  return polygonPath(
    [
      [ax + nx, ay + ny],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
      [ax - nx, ay - ny],
    ],
    mapX,
    mapY,
  );
}

/** Builds a pointed 4-point star diamond centered at (cx, cy). */
function fourPointStar(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  waistRatio: number,
  mapX: (vx: number) => number,
  mapY: (vy: number) => number,
): string {
  const wx = rx * waistRatio;
  const wy = ry * waistRatio;
  return polygonPath(
    [
      [cx, cy - ry],
      [cx + wx, cy - wy],
      [cx + rx, cy],
      [cx + wx, cy + wy],
      [cx, cy + ry],
      [cx - wx, cy + wy],
      [cx - rx, cy],
      [cx - wx, cy - wy],
    ],
    mapX,
    mapY,
  );
}

/** Builds a pointed almond/leaf shape from base (bx, by) to tip (tx, ty). */
function leafPetal(
  bx: number,
  by: number,
  tx: number,
  ty: number,
  halfWidth: number,
  mapX: (vx: number) => number,
  mapY: (vy: number) => number,
): string {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return '';
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const midX = bx + ux * (len * 0.48);
  const midY = by + uy * (len * 0.48);

  const c1x = midX + nx * halfWidth;
  const c1y = midY + ny * halfWidth;
  const c2x = midX - nx * halfWidth;
  const c2y = midY - ny * halfWidth;

  return `M ${fmt(mapX(bx))} ${fmt(mapY(by))} Q ${fmt(mapX(c1x))} ${fmt(mapY(c1y))} ${fmt(mapX(tx))} ${fmt(mapY(ty))} Q ${fmt(mapX(c2x))} ${fmt(mapY(c2y))} ${fmt(mapX(bx))} ${fmt(mapY(by))} Z`;
}

/**
 * Generates pure closed filled SVG path strings (`M ... L/Q ... Z`) in absolute millimeter coordinates
 * for any classic bookbindery ornament.
 *
 * Because every rule, frame, corner, and emblem is emitted as a closed filled contour (never a bare
 * thin stroke), the exact same output renders identically on the 2D SVG canvas, 3D book preview,
 * 300 DPI Print PDF, Affinity SVG, AND Cricut / Silhouette / ScanNCut HTV cutting mats!
 */
export function buildOrnamentClosedPaths(
  ornament: CoverOrnamentLayer,
  transform?: {
    readonly originXMm?: number;
    readonly originYMm?: number;
    readonly canvasWidthMm?: number;
    readonly mirrorX?: boolean;
  },
): readonly string[] {
  const ox = transform?.originXMm ?? 0;
  const oy = transform?.originYMm ?? 0;
  const mirrorX = transform?.mirrorX ?? false;
  const canvasW = transform?.canvasWidthMm ?? 0;

  const w = ornament.widthMm;
  const h = ornament.heightMm;
  const t = Math.max(0.35, ornament.strokeWidthMm);

  const mapX = (localX: number): number => {
    const lx = ornament.flipX ? w - localX : localX;
    const raw = ornament.xMm + lx - ox;
    return mirrorX ? canvasW - raw : raw;
  };
  const mapY = (localY: number): number => {
    const ly = ornament.flipY ? h - localY : localY;
    return ornament.yMm + ly - oy;
  };

  switch (ornament.presetId) {
    case 'frame-single-rule':
      return rectFrameBars(0, 0, w, h, t, mapX, mapY);

    case 'frame-double-rule': {
      const gap = Math.max(2.2, t * 2.8);
      const innerW = Math.max(4, w - gap * 2);
      const innerH = Math.max(4, h - gap * 2);
      return [
        ...rectFrameBars(0, 0, w, h, t, mapX, mapY),
        ...rectFrameBars(gap, gap, innerW, innerH, Math.max(0.35, t * 0.7), mapX, mapY),
      ];
    }

    case 'frame-art-deco': {
      const step = Math.min(11, Math.min(w, h) * 0.14);
      const innerGap = Math.max(2.0, t * 2.4);
      const paths: string[] = [
        ...rectFrameBars(0, 0, w, h, t, mapX, mapY),
        ...rectFrameBars(
          innerGap,
          innerGap,
          Math.max(4, w - innerGap * 2),
          Math.max(4, h - innerGap * 2),
          Math.max(0.35, t * 0.65),
          mapX,
          mapY,
        ),
      ];
      // Stepped Art Deco corner squares in all 4 corners
      const corners: readonly (readonly [number, number])[] = [
        [0, 0],
        [w - step, 0],
        [0, h - step],
        [w - step, h - step],
      ];
      for (const [cx, cy] of corners) {
        paths.push(...rectFrameBars(cx, cy, step, step, Math.max(0.35, t * 0.8), mapX, mapY));
      }
      return paths;
    }

    case 'frame-notched-corner': {
      const n = Math.min(10, Math.min(w, h) * 0.13);
      const paths: string[] = [
        // Top & bottom edges stopping at corner notches
        rectBar(n, 0, Math.max(1, w - n * 2), t, mapX, mapY),
        rectBar(n, h - t, Math.max(1, w - n * 2), t, mapX, mapY),
        // Left & right edges stopping at corner notches
        rectBar(0, n, t, Math.max(1, h - n * 2), mapX, mapY),
        rectBar(w - t, n, t, Math.max(1, h - n * 2), mapX, mapY),
        // Inward stepped notches at all 4 corners
        rectBar(0, n, n, t, mapX, mapY),
        rectBar(n - t, 0, t, n, mapX, mapY),
        rectBar(w - n, n, n, t, mapX, mapY),
        rectBar(w - n, 0, t, n, mapX, mapY),
        rectBar(0, h - n - t, n, t, mapX, mapY),
        rectBar(n - t, h - n, t, n, mapX, mapY),
        rectBar(w - n, h - n - t, n, t, mapX, mapY),
        rectBar(w - n, h - n, t, n, mapX, mapY),
      ];
      // Tiny decorative diamond in each corner notch
      const dR = Math.max(1.2, n * 0.28);
      for (const [dx, dy] of [
        [n * 0.45, n * 0.45],
        [w - n * 0.45, n * 0.45],
        [n * 0.45, h - n * 0.45],
        [w - n * 0.45, h - n * 0.45],
      ] as const) {
        paths.push(fourPointStar(dx, dy, dR, dR, 0.45, mapX, mapY));
      }
      return paths;
    }

    case 'corners-classic-scroll': {
      const arm = Math.min(22, Math.min(w, h) * 0.28);
      const inner = arm * 0.52;
      const dR = Math.max(1.4, arm * 0.12);
      const paths: string[] = [];
      const cornerTransforms: readonly (readonly [number, number, number, number])[] = [
        [0, 0, 1, 1],
        [w, 0, -1, 1],
        [0, h, 1, -1],
        [w, h, -1, -1],
      ];
      for (const [cx, cy, sx, sy] of cornerTransforms) {
        // Outer L-bracket
        paths.push(
          segmentBar(cx, cy, cx + sx * arm, cy, t, mapX, mapY),
          segmentBar(cx, cy, cx, cy + sy * arm, t, mapX, mapY),
          // Inner nested L-bracket
          segmentBar(
            cx + sx * (t * 3),
            cy + sy * (t * 3),
            cx + sx * (t * 3 + inner),
            cy + sy * (t * 3),
            t * 0.72,
            mapX,
            mapY,
          ),
          segmentBar(
            cx + sx * (t * 3),
            cy + sy * (t * 3),
            cx + sx * (t * 3),
            cy + sy * (t * 3 + inner),
            t * 0.72,
            mapX,
            mapY,
          ),
          // Corner floral diamond & diagonal sprig
          fourPointStar(cx + sx * (arm * 0.34), cy + sy * (arm * 0.34), dR, dR, 0.35, mapX, mapY),
          leafPetal(
            cx + sx * (arm * 0.42),
            cy + sy * (arm * 0.42),
            cx + sx * (arm * 0.8),
            cy + sy * (arm * 0.8),
            dR * 0.75,
            mapX,
            mapY,
          ),
        );
      }
      return paths;
    }

    case 'corners-deco-chevron': {
      const arm = Math.min(20, Math.min(w, h) * 0.25);
      const paths: string[] = [];
      for (const [cx, cy, sx, sy] of [
        [0, 0, 1, 1],
        [w, 0, -1, 1],
        [0, h, 1, -1],
        [w, h, -1, -1],
      ] as const) {
        paths.push(
          segmentBar(cx, cy, cx + sx * arm, cy, t, mapX, mapY),
          segmentBar(cx, cy, cx, cy + sy * arm, t, mapX, mapY),
          segmentBar(cx + sx * (arm * 0.72), cy, cx, cy + sy * (arm * 0.72), t * 0.85, mapX, mapY),
          segmentBar(cx + sx * (arm * 0.44), cy, cx, cy + sy * (arm * 0.44), t * 0.7, mapX, mapY),
        );
      }
      return paths;
    }

    case 'divider-diamond-rule': {
      const cy = h / 2;
      const cx = w / 2;
      const rx = Math.min(w * 0.14, h * 0.65);
      const ry = Math.min(h * 0.46, rx * 0.7);
      const gap = rx + Math.max(1.5, t * 2);
      const sideLen = Math.max(2, cx - gap);
      return [
        // Left & right tapered bars
        polygonPath(
          [
            [0, cy],
            [sideLen, cy - t * 0.65],
            [sideLen, cy + t * 0.65],
          ],
          mapX,
          mapY,
        ),
        polygonPath(
          [
            [w, cy],
            [w - sideLen, cy - t * 0.65],
            [w - sideLen, cy + t * 0.65],
          ],
          mapX,
          mapY,
        ),
        // Central diamond lozenge
        fourPointStar(cx, cy, rx, ry, 0.5, mapX, mapY),
      ];
    }

    case 'divider-fleuron-leaf': {
      const cy = h / 2;
      const cx = w / 2;
      const leafLen = Math.min(w * 0.2, h * 0.9);
      const wingW = leafLen * 0.34;
      const barStart = leafLen * 1.15;
      const paths: string[] = [
        // Central vertical bud + left/right paired Aldus leaves
        leafPetal(cx, cy + h * 0.32, cx, cy - h * 0.44, wingW * 0.75, mapX, mapY),
        leafPetal(cx, cy, cx - leafLen, cy - h * 0.18, wingW * 0.7, mapX, mapY),
        leafPetal(cx, cy, cx + leafLen, cy - h * 0.18, wingW * 0.7, mapX, mapY),
        leafPetal(cx, cy + h * 0.08, cx - leafLen * 0.72, cy + h * 0.34, wingW * 0.5, mapX, mapY),
        leafPetal(cx, cy + h * 0.08, cx + leafLen * 0.72, cy + h * 0.34, wingW * 0.5, mapX, mapY),
      ];
      if (cx - barStart > 3) {
        paths.push(
          rectBar(0, cy - t / 2, cx - barStart, t, mapX, mapY),
          rectBar(cx + barStart, cy - t / 2, cx - barStart, t, mapX, mapY),
        );
      }
      return paths;
    }

    case 'divider-celestial-stars': {
      const cy = h / 2;
      const cx = w / 2;
      const mainR = Math.min(h * 0.48, w * 0.12);
      const sideR = mainR * 0.62;
      const offset = Math.min(w * 0.28, mainR * 3.1);
      const outerOffset = Math.min(w * 0.43, offset * 1.65);
      const dotR = sideR * 0.45;
      return [
        fourPointStar(cx, cy, mainR, mainR, 0.22, mapX, mapY),
        fourPointStar(cx - offset, cy, sideR, sideR, 0.24, mapX, mapY),
        fourPointStar(cx + offset, cy, sideR, sideR, 0.24, mapX, mapY),
        fourPointStar(cx - outerOffset, cy, dotR, dotR, 0.42, mapX, mapY),
        fourPointStar(cx + outerOffset, cy, dotR, dotR, 0.42, mapX, mapY),
      ];
    }

    case 'emblem-compass-rose': {
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) * 0.48;
      const diagR = r * 0.68;
      const waist = r * 0.16;
      const dWaist = diagR * 0.14;
      const c45 = Math.SQRT1_2;
      return [
        // Cardinal 4-point star
        fourPointStar(cx, cy, r, r, 0.18, mapX, mapY),
        // Diagonal 4-point star (rotated 45°)
        polygonPath(
          [
            [cx + diagR * c45, cy - diagR * c45],
            [cx + dWaist, cy],
            [cx + diagR * c45, cy + diagR * c45],
            [cx, cy + dWaist],
            [cx - diagR * c45, cy + diagR * c45],
            [cx - dWaist, cy],
            [cx - diagR * c45, cy - diagR * c45],
            [cx, cy - dWaist],
          ],
          mapX,
          mapY,
        ),
        // Subtle outer compass ticks (N/E/S/W)
        rectBar(cx - waist * 0.2, 0, waist * 0.4, r * 0.12, mapX, mapY),
        rectBar(cx - waist * 0.2, h - r * 0.12, waist * 0.4, r * 0.12, mapX, mapY),
      ];
    }

    case 'emblem-botanical-sprig': {
      const cx = w / 2;
      const stemTop = h * 0.1;
      const stemBot = h * 0.92;
      const span = Math.min(w, h) * 0.42;
      const leafW = span * 0.28;
      return [
        // Central stem
        rectBar(cx - t * 0.45, stemTop + h * 0.08, t * 0.9, stemBot - stemTop - h * 0.08, mapX, mapY),
        // Top crown leaf
        leafPetal(cx, h * 0.28, cx, stemTop * 0.4, leafW * 0.78, mapX, mapY),
        // Upper pair
        leafPetal(cx, h * 0.36, cx - span * 0.72, h * 0.2, leafW * 0.75, mapX, mapY),
        leafPetal(cx, h * 0.36, cx + span * 0.72, h * 0.2, leafW * 0.75, mapX, mapY),
        // Middle pair
        leafPetal(cx, h * 0.56, cx - span * 0.92, h * 0.38, leafW * 0.85, mapX, mapY),
        leafPetal(cx, h * 0.56, cx + span * 0.92, h * 0.38, leafW * 0.85, mapX, mapY),
        // Lower pair
        leafPetal(cx, h * 0.76, cx - span * 0.78, h * 0.6, leafW * 0.78, mapX, mapY),
        leafPetal(cx, h * 0.76, cx + span * 0.78, h * 0.6, leafW * 0.78, mapX, mapY),
      ];
    }

    case 'spine-classic-bands': {
      // Classic 5 raised-band horizontal foil double rules across spine height
      const bandPositions = [0.02, 0.24, 0.48, 0.72, 0.95];
      const gap = Math.max(1.2, t * 1.8);
      const paths: string[] = [];
      for (const ratio of bandPositions) {
        const y = h * ratio;
        paths.push(rectBar(0, y, w, t, mapX, mapY));
        if (y + gap + t * 0.6 <= h) {
          paths.push(rectBar(0, y + gap, w, Math.max(0.35, t * 0.6), mapX, mapY));
        }
      }
      return paths;
    }

    case 'spine-title-cartouche': {
      // Classic gilded rectangular title frame in upper half + head/tail accent bars & diamonds
      const boxY = h * 0.14;
      const boxH = h * 0.36;
      const innerGap = Math.max(1.1, t * 1.7);
      const cx = w / 2;
      const dR = Math.min(w * 0.26, 3.2);
      return [
        rectBar(0, 0, w, t, mapX, mapY),
        rectBar(0, h - t, w, t, mapX, mapY),
        ...rectFrameBars(0, boxY, w, boxH, t, mapX, mapY),
        ...(w > innerGap * 3 && boxH > innerGap * 3
          ? rectFrameBars(
              innerGap,
              boxY + innerGap,
              w - innerGap * 2,
              boxH - innerGap * 2,
              Math.max(0.35, t * 0.65),
              mapX,
              mapY,
            )
          : []),
        fourPointStar(cx, boxY * 0.5, dR, dR * 1.25, 0.35, mapX, mapY),
        fourPointStar(cx, boxY + boxH + (h - (boxY + boxH)) * 0.5, dR, dR * 1.25, 0.35, mapX, mapY),
      ];
    }

    case 'spine-head-tail-bands': {
      // Decorative triple rules + central diamond at head and tail, leaving middle clear for vertical spine title
      const cx = w / 2;
      const bandGap = Math.max(1.4, t * 2.2);
      const dR = Math.min(w * 0.28, 3.0);
      const headDiamondY = bandGap * 2.6 + dR;
      const tailDiamondY = h - bandGap * 2.6 - dR;
      return [
        // Head triple band + diamond finial
        rectBar(0, 0, w, t, mapX, mapY),
        rectBar(0, bandGap, w, Math.max(0.35, t * 0.65), mapX, mapY),
        rectBar(0, bandGap * 1.9, w, Math.max(0.35, t * 0.65), mapX, mapY),
        fourPointStar(cx, headDiamondY, dR, dR * 1.2, 0.3, mapX, mapY),
        // Tail triple band + diamond finial
        fourPointStar(cx, tailDiamondY, dR, dR * 1.2, 0.3, mapX, mapY),
        rectBar(0, h - bandGap * 1.9 - t * 0.65, w, Math.max(0.35, t * 0.65), mapX, mapY),
        rectBar(0, h - bandGap - t * 0.65, w, Math.max(0.35, t * 0.65), mapX, mapY),
        rectBar(0, h - t, w, t, mapX, mapY),
      ];
    }

    case 'spine-botanical-vine': {
      // Vertical bindery vine with paired leaves running down the spine
      const cx = w / 2;
      const span = Math.min(w * 0.48, 12);
      const leafW = Math.max(1.1, span * 0.34);
      const paths: string[] = [
        rectBar(cx - t * 0.42, h * 0.06, t * 0.84, h * 0.88, mapX, mapY),
        leafPetal(cx, h * 0.08, cx, h * 0.01, leafW * 0.8, mapX, mapY),
        leafPetal(cx, h * 0.92, cx, h * 0.99, leafW * 0.8, mapX, mapY),
      ];
      const tiers = [0.18, 0.34, 0.5, 0.66, 0.82];
      for (const ratio of tiers) {
        const y = h * ratio;
        const lift = Math.min(h * 0.055, span * 1.15);
        paths.push(
          leafPetal(cx, y, cx - span, y - lift, leafW, mapX, mapY),
          leafPetal(cx, y, cx + span, y - lift, leafW, mapX, mapY),
        );
      }
      return paths;
    }

    case 'spine-celestial-column': {
      // Vertical column of celestial 4-point stars & delicate connecting rules
      const cx = w / 2;
      const bigR = Math.min(w * 0.44, h * 0.065);
      const smR = bigR * 0.55;
      const paths: string[] = [
        rectBar(0, 0, w, t, mapX, mapY),
        rectBar(0, h - t, w, t, mapX, mapY),
      ];
      const majorYs = [0.14, 0.5, 0.86];
      const minorYs = [0.26, 0.38, 0.62, 0.74];
      for (const r of majorYs) {
        paths.push(fourPointStar(cx, h * r, bigR, bigR * 1.25, 0.22, mapX, mapY));
      }
      for (const r of minorYs) {
        paths.push(fourPointStar(cx, h * r, smR, smR * 1.2, 0.32, mapX, mapY));
      }
      return paths;
    }

    case 'spine-diamond-lattice': {
      // Art Deco stacked geometric diamond lattice down the spine
      const cx = w / 2;
      const cells = Math.max(4, Math.min(8, Math.round(h / Math.max(12, w * 1.4))));
      const cellH = (h - t * 2) / cells;
      const halfW = Math.max(2, w / 2 - t * 0.5);
      const paths: string[] = [
        ...rectFrameBars(0, 0, w, h, t, mapX, mapY),
      ];
      for (let i = 0; i < cells; i++) {
        const yTop = t + i * cellH;
        const yMid = yTop + cellH / 2;
        const yBot = yTop + cellH;
        paths.push(
          segmentBar(cx, yTop, cx + halfW, yMid, t * 0.72, mapX, mapY),
          segmentBar(cx + halfW, yMid, cx, yBot, t * 0.72, mapX, mapY),
          segmentBar(cx, yBot, cx - halfW, yMid, t * 0.72, mapX, mapY),
          segmentBar(cx - halfW, yMid, cx, yTop, t * 0.72, mapX, mapY),
        );
      }
      return paths;
    }

    case 'custom-svg': {
      if (!ornament.customSvgPaths || ornament.customSvgPaths.length === 0) return [];
      const vbW = ornament.customSvgViewBox?.width ?? 100;
      const vbH = ornament.customSvgViewBox?.height ?? 100;
      return mapNormalizedPathsToMm(
        ornament.customSvgPaths,
        vbW,
        vbH,
        { xMm: ornament.xMm, yMm: ornament.yMm, widthMm: ornament.widthMm, heightMm: ornament.heightMm },
        { ...transform, flipX: ornament.flipX, flipY: ornament.flipY },
      );
    }
  }
}

/** Joins all closed contours of an ornament into a single compound SVG `d` string. */
export function buildOrnamentCompoundPath(
  ornament: CoverOrnamentLayer,
  transform?: {
    readonly originXMm?: number;
    readonly originYMm?: number;
    readonly canvasWidthMm?: number;
    readonly mirrorX?: boolean;
  },
): string {
  return buildOrnamentClosedPaths(ornament, transform).filter(Boolean).join(' ');
}
