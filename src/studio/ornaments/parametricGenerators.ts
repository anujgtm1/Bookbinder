import {
  fourPointStar,
  leafPetal,
  rectBar,
  rectFrameBars,
  segmentBar,
  type AxisMapper,
} from './primitives';

export type ParametricOrnamentId =
  | 'frame-single-rule'
  | 'frame-double-rule'
  | 'frame-art-deco'
  | 'frame-notched-corner'
  | 'corners-classic-scroll'
  | 'corners-deco-chevron'
  | 'spine-classic-bands'
  | 'spine-title-cartouche'
  | 'spine-head-tail-bands'
  | 'spine-botanical-vine'
  | 'spine-celestial-column'
  | 'spine-diamond-lattice';

export interface ParametricOrnamentContext {
  readonly w: number;
  readonly h: number;
  readonly t: number;
  readonly mapX: AxisMapper;
  readonly mapY: AxisMapper;
}

export type ParametricOrnamentGenerator = (ctx: ParametricOrnamentContext) => readonly string[];

export const PARAMETRIC_ORNAMENT_GENERATORS: Readonly<
  Record<ParametricOrnamentId, ParametricOrnamentGenerator>
> = {
  'frame-single-rule': ({ w, h, t, mapX, mapY }) => rectFrameBars(0, 0, w, h, t, mapX, mapY),

  'frame-double-rule': ({ w, h, t, mapX, mapY }) => {
    const gap = Math.max(2.2, t * 2.8);
    const innerW = Math.max(4, w - gap * 2);
    const innerH = Math.max(4, h - gap * 2);
    return [
      ...rectFrameBars(0, 0, w, h, t, mapX, mapY),
      ...rectFrameBars(gap, gap, innerW, innerH, Math.max(0.35, t * 0.7), mapX, mapY),
    ];
  },

  'frame-art-deco': ({ w, h, t, mapX, mapY }) => {
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
  },

  'frame-notched-corner': ({ w, h, t, mapX, mapY }) => {
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
  },

  'corners-classic-scroll': ({ w, h, t, mapX, mapY }) => {
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
  },

  'corners-deco-chevron': ({ w, h, t, mapX, mapY }) => {
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
  },

  'spine-classic-bands': ({ w, h, t, mapX, mapY }) => {
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
  },

  'spine-title-cartouche': ({ w, h, t, mapX, mapY }) => {
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
  },

  'spine-head-tail-bands': ({ w, h, t, mapX, mapY }) => {
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
  },

  'spine-botanical-vine': ({ w, h, t, mapX, mapY }) => {
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
  },

  'spine-celestial-column': ({ w, h, t, mapX, mapY }) => {
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
  },

  'spine-diamond-lattice': ({ w, h, t, mapX, mapY }) => {
    // Art Deco stacked geometric diamond lattice down the spine
    const cx = w / 2;
    const cells = Math.max(4, Math.min(8, Math.round(h / Math.max(12, w * 1.4))));
    const cellH = (h - t * 2) / cells;
    const halfW = Math.max(2, w / 2 - t * 0.5);
    const paths: string[] = [...rectFrameBars(0, 0, w, h, t, mapX, mapY)];
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
  },
};
