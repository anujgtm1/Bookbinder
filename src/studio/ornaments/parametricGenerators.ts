import {
  arcBand,
  circleDisc,
  cubicRibbon,
  fourPointStar,
  leafPetal,
  lunarPhaseShape,
  polygonPath,
  rectBar,
  rectFrameBars,
  ringBand,
  segmentBar,
  type AxisMapper,
} from './primitives';

export type ParametricOrnamentId =
  | 'frame-single-rule'
  | 'frame-double-rule'
  | 'frame-art-deco'
  | 'frame-notched-corner'
  | 'frame-gothic-arch'
  | 'frame-deco-archway'
  | 'frame-modern-editorial'
  | 'corners-classic-scroll'
  | 'corners-deco-chevron'
  | 'corners-deco-fan'
  | 'corners-botanical-vine'
  | 'spine-classic-bands'
  | 'spine-title-cartouche'
  | 'spine-head-tail-bands'
  | 'spine-botanical-vine'
  | 'spine-celestial-column'
  | 'spine-diamond-lattice'
  | 'spine-moon-phases'
  | 'spine-deco-sunburst'
  | 'spine-orbital-axis';

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

  'frame-gothic-arch': ({ w, h, t, mapX, mapY }) => {
    // Pointed cathedral lancet arch frame with twin vertical shafts & corner diamond finials
    const cx = w / 2;
    const gap = Math.max(2.0, Math.min(w * 0.08, t * 2.8));
    const tInner = Math.max(0.35, t * 0.68);
    const springY = Math.min(h * 0.4, w * 0.52);
    const spandrelArm = Math.min(w * 0.24, springY * 0.58);
    const dR = Math.max(1.3, Math.min(w, h) * 0.045);

    const paths: string[] = [
      // Outer cathedral vertical shafts (from springY to bottom) & bottom rule
      rectBar(0, springY, t, Math.max(1, h - springY), mapX, mapY),
      rectBar(w - t, springY, t, Math.max(1, h - springY), mapX, mapY),
      rectBar(0, h - t, w, t, mapX, mapY),
      // Outer pointed lancet arch curves meeting cleanly at apex (cx, t/2)
      cubicRibbon(
        [t / 2, springY],
        [t / 2, springY * 0.42],
        [cx - w * 0.22, springY * 0.14],
        [cx, t / 2],
        t,
        18,
        mapX,
        mapY,
      ),
      cubicRibbon(
        [w - t / 2, springY],
        [w - t / 2, springY * 0.42],
        [cx + w * 0.22, springY * 0.14],
        [cx, t / 2],
        t,
        18,
        mapX,
        mapY,
      ),
      // Inner nested cathedral arch + shafts + bottom double rule
      rectBar(gap, springY, tInner, Math.max(1, h - springY - gap), mapX, mapY),
      rectBar(w - gap - tInner, springY, tInner, Math.max(1, h - springY - gap), mapX, mapY),
      rectBar(gap, h - gap - tInner, Math.max(1, w - gap * 2), tInner, mapX, mapY),
      cubicRibbon(
        [gap + tInner / 2, springY],
        [gap + tInner / 2, springY * 0.48],
        [cx - (w - gap * 2) * 0.22, gap + springY * 0.14],
        [cx, gap + tInner * 0.7],
        tInner,
        16,
        mapX,
        mapY,
      ),
      cubicRibbon(
        [w - gap - tInner / 2, springY],
        [w - gap - tInner / 2, springY * 0.48],
        [cx + (w - gap * 2) * 0.22, gap + springY * 0.14],
        [cx, gap + tInner * 0.7],
        tInner,
        16,
        mapX,
        mapY,
      ),
      // Upper cathedral spandrel L-brackets framing the pointed arch
      rectBar(0, 0, spandrelArm, tInner, mapX, mapY),
      rectBar(0, 0, tInner, spandrelArm, mapX, mapY),
      rectBar(w - spandrelArm, 0, spandrelArm, tInner, mapX, mapY),
      rectBar(w - tInner, 0, tInner, spandrelArm, mapX, mapY),
      // Corner spandrel & apex Gothic diamond finials
      fourPointStar(spandrelArm * 0.42, spandrelArm * 0.42, dR, dR, 0.3, mapX, mapY),
      fourPointStar(w - spandrelArm * 0.42, spandrelArm * 0.42, dR, dR, 0.3, mapX, mapY),
      fourPointStar(cx, gap + dR * 1.4, dR * 0.85, dR * 1.15, 0.28, mapX, mapY),
      // Subtle spring-line horizontal capitals on left/right shafts
      rectBar(0, springY - t * 0.4, gap + t * 1.5, t * 0.8, mapX, mapY),
      rectBar(w - gap - t * 1.5, springY - t * 0.4, gap + t * 1.5, t * 0.8, mapX, mapY),
    ];

    return paths;
  },

  'frame-deco-archway': ({ w, h, t, mapX, mapY }) => {
    // Stepped Chrysler-style Art Deco archway frame with top/bottom fan accents
    const cx = w / 2;
    const tThin = Math.max(0.35, t * 0.68);
    const s1x = Math.min(w * 0.14, 14);
    const s2x = Math.min(w * 0.28, 28);
    const s1y = Math.min(h * 0.08, 12);
    const s2y = Math.min(h * 0.15, 22);
    const gap = Math.max(1.8, Math.min(w * 0.06, t * 2.4));

    const buildSteppedCrown = (topY: number, dir: 1 | -1): string[] => {
      const yOuter = topY + dir * s2y;
      const yMid = topY + dir * s1y;
      const yPeak = topY;
      const stepPts: [number, number][] = [
        [0, yOuter],
        [s1x, yOuter],
        [s1x, yMid],
        [s2x, yMid],
        [s2x, yPeak],
        [w - s2x, yPeak],
        [w - s2x, yMid],
        [w - s1x, yMid],
        [w - s1x, yOuter],
        [w, yOuter],
      ];
      const out: string[] = [];
      for (let i = 0; i < stepPts.length - 1; i++) {
        out.push(
          segmentBar(
            stepPts[i][0],
            stepPts[i][1],
            stepPts[i + 1][0],
            stepPts[i + 1][1],
            t,
            mapX,
            mapY,
          ),
        );
      }
      // Radiating Deco fan rays tucked beneath the central pinnacle
      const fanR = Math.min(s2y * 0.88, (w - s2x * 2) * 0.42);
      const originY = yPeak + dir * (t * 1.4);
      for (const frac of [-0.55, -0.28, 0, 0.28, 0.55]) {
        const a = Math.PI / 2 + frac * 1.1;
        out.push(
          segmentBar(
            cx,
            originY,
            cx + Math.cos(a) * fanR,
            originY + dir * Math.sin(a) * fanR,
            tThin * 0.9,
            mapX,
            mapY,
          ),
        );
      }
      return out;
    };

    const paths: string[] = [
      // Outer left & right fluted vertical rails between stepped crowns
      rectBar(0, s2y, t, Math.max(1, h - s2y * 2), mapX, mapY),
      rectBar(w - t, s2y, t, Math.max(1, h - s2y * 2), mapX, mapY),
      // Inner vertical hairline rails
      rectBar(gap, s2y + gap, tThin, Math.max(1, h - (s2y + gap) * 2), mapX, mapY),
      rectBar(w - gap - tThin, s2y + gap, tThin, Math.max(1, h - (s2y + gap) * 2), mapX, mapY),
      // Top & bottom stepped Chrysler crowns with fan accents
      ...buildSteppedCrown(t / 2, 1),
      ...buildSteppedCrown(h - t / 2, -1),
    ];

    return paths;
  },

  'frame-modern-editorial': ({ w, h, t, mapX, mapY }) => {
    // Asymmetric Swiss/Bauhaus thick-top + hairline-bottom architectural frame with corner ticks
    const tHeavy = Math.min(w * 0.08, h * 0.08, Math.max(t * 2.4, 1.4));
    const tHair = Math.max(0.35, t * 0.65);
    const tick = Math.min(6, Math.min(w, h) * 0.09);
    const goldenY = h * 0.382;
    const accentBlockW = Math.min(w * 0.14, 16);

    return [
      // Bold top architectural bar + Swiss corner accent block
      rectBar(0, 0, w, tHeavy, mapX, mapY),
      rectBar(0, tHeavy + tHair * 2.2, accentBlockW, tHair * 1.6, mapX, mapY),
      // Crisp hairline bottom rule
      rectBar(0, h - tHair, w, tHair, mapX, mapY),
      // Clean vertical side hairlines
      rectBar(0, tHeavy, tHair, Math.max(1, h - tHeavy), mapX, mapY),
      rectBar(w - tHair, tHeavy, tHair, Math.max(1, h - tHeavy), mapX, mapY),
      // Precision golden-ratio horizontal registration ticks on left & right rails
      rectBar(0, goldenY, tick, tHair, mapX, mapY),
      rectBar(w - tick, goldenY, tick, tHair, mapX, mapY),
      // Bottom corner index ticks
      rectBar(0, h - tick, tHair * 1.4, tick, mapX, mapY),
      rectBar(w - tHair * 1.4, h - tick, tHair * 1.4, tick, mapX, mapY),
      rectBar(w - tick * 1.6, h - tHair * 3.5, tick * 1.6, tHair, mapX, mapY),
    ];
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

  'corners-deco-fan': ({ w, h, t, mapX, mapY }) => {
    // 4 mirrored quarter-circle Gatsby sunburst fan corners
    const rOuter = Math.min(22, Math.min(w, h) * 0.3);
    const rInner = rOuter * 0.56;
    const tThin = Math.max(0.35, t * 0.72);
    const paths: string[] = [];

    const cornerSpecs: readonly (readonly [number, number, number, number, number, number])[] = [
      [0, 0, 1, 1, 0, 90],
      [w, 0, -1, 1, 90, 180],
      [0, h, 1, -1, 270, 360],
      [w, h, -1, -1, 180, 270],
    ];

    for (const [cx, cy, sx, sy, startDeg, endDeg] of cornerSpecs) {
      // Corner anchor L-brackets
      paths.push(
        segmentBar(cx, cy, cx + sx * rOuter, cy, t, mapX, mapY),
        segmentBar(cx, cy, cx, cy + sy * rOuter, t, mapX, mapY),
        // Two concentric quarter-circle Deco fan arcs
        arcBand(
          cx,
          cy,
          rOuter,
          rOuter,
          Math.max(1, rOuter - t),
          Math.max(1, rOuter - t),
          startDeg,
          endDeg,
          14,
          mapX,
          mapY,
        ),
        arcBand(
          cx,
          cy,
          rInner,
          rInner,
          Math.max(0.6, rInner - tThin),
          Math.max(0.6, rInner - tThin),
          startDeg,
          endDeg,
          12,
          mapX,
          mapY,
        ),
      );
      // 5 radiating sunburst rays fanning cleanly across the quarter-circle
      for (let i = 1; i <= 5; i++) {
        const aDeg = startDeg + ((endDeg - startDeg) * i) / 6;
        const rad = (aDeg * Math.PI) / 180;
        const rayLen = i % 2 === 1 ? rOuter * 0.96 : rOuter * 0.78;
        paths.push(
          segmentBar(
            cx + Math.cos(rad) * (t * 0.8),
            cy + Math.sin(rad) * (t * 0.8),
            cx + Math.cos(rad) * rayLen,
            cy + Math.sin(rad) * rayLen,
            tThin,
            mapX,
            mapY,
          ),
        );
      }
    }
    return paths;
  },

  'corners-botanical-vine': ({ w, h, t, mapX, mapY }) => {
    // 4 mirrored curling leaf-and-berry botanical corner sprigs
    const arm = Math.min(24, Math.min(w, h) * 0.32);
    const leafHw = Math.max(1.1, arm * 0.12);
    const berryR = Math.max(0.85, arm * 0.065);
    const stemT = Math.max(0.4, t * 0.82);
    const paths: string[] = [];

    for (const [cx, cy, sx, sy] of [
      [0, 0, 1, 1],
      [w, 0, -1, 1],
      [0, h, 1, -1],
      [w, h, -1, -1],
    ] as const) {
      const px = (u: number) => cx + sx * arm * u;
      const py = (v: number) => cy + sy * arm * v;

      // Sweeping curved corner vine stems along both edges
      paths.push(
        cubicRibbon(
          [px(0.06), py(0.06)],
          [px(0.32), py(0.04)],
          [px(0.64), py(0.18)],
          [px(0.94), py(0.08)],
          stemT,
          12,
          mapX,
          mapY,
        ),
        cubicRibbon(
          [px(0.06), py(0.06)],
          [px(0.04), py(0.32)],
          [px(0.18), py(0.64)],
          [px(0.08), py(0.94)],
          stemT,
          12,
          mapX,
          mapY,
        ),
        // Paired botanical leaves along horizontal & vertical tendrils
        leafPetal(px(0.28), py(0.1), px(0.48), py(0.32), leafHw, mapX, mapY),
        leafPetal(px(0.56), py(0.12), px(0.76), py(0.28), leafHw * 0.88, mapX, mapY),
        leafPetal(px(0.1), py(0.28), px(0.32), py(0.48), leafHw, mapX, mapY),
        leafPetal(px(0.12), py(0.56), px(0.28), py(0.76), leafHw * 0.88, mapX, mapY),
        // Diagonal corner central blossom leaf
        leafPetal(px(0.1), py(0.1), px(0.38), py(0.38), leafHw * 0.95, mapX, mapY),
        // Botanical berries nestled along sprig
        circleDisc(px(0.88), py(0.16), berryR, berryR, mapX, mapY),
        circleDisc(px(0.16), py(0.88), berryR, berryR, mapX, mapY),
        circleDisc(px(0.24), py(0.24), berryR * 1.15, berryR * 1.15, mapX, mapY),
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

  'spine-moon-phases': ({ w, h, t, mapX, mapY }) => {
    // Vertical lunar cycle column (waxing -> full -> waning) with celestial star accents
    const cx = w / 2;
    const r = Math.min(w * 0.38, h * 0.052);
    const starR = Math.max(1.0, r * 0.52);
    const tHair = Math.max(0.35, t * 0.55);
    const paths: string[] = [
      rectBar(0, 0, w, t, mapX, mapY),
      rectBar(0, h - t, w, t, mapX, mapY),
      // Fine central connecting lunar thread
      rectBar(cx - tHair / 2, h * 0.07, tHair, h * 0.86, mapX, mapY),
      // 7 lunar phases stacked evenly from head to tail
      lunarPhaseShape(cx, h * 0.14, r, 'right', 0.45, mapX, mapY),
      lunarPhaseShape(cx, h * 0.26, r, 'right', 0.0, mapX, mapY),
      lunarPhaseShape(cx, h * 0.38, r, 'right', -0.45, mapX, mapY),
      // Central Full Moon (halo ring + luminous disc)
      ringBand(cx, h * 0.5, r * 1.18, r * 1.18, r * 0.92, r * 0.92, mapX, mapY),
      circleDisc(cx, h * 0.5, r * 0.68, r * 0.68, mapX, mapY),
      lunarPhaseShape(cx, h * 0.62, r, 'left', -0.45, mapX, mapY),
      lunarPhaseShape(cx, h * 0.74, r, 'left', 0.0, mapX, mapY),
      lunarPhaseShape(cx, h * 0.86, r, 'left', 0.45, mapX, mapY),
      // Head & tail celestial sparkle stars
      fourPointStar(cx, h * 0.065, starR, starR * 1.2, 0.26, mapX, mapY),
      fourPointStar(cx, h * 0.935, starR, starR * 1.2, 0.26, mapX, mapY),
    ];
    return paths;
  },

  'spine-deco-sunburst': ({ w, h, t, mapX, mapY }) => {
    // Tall stepped Art Deco chevron & sunburst pinnacle spine ornament
    const cx = w / 2;
    const tThin = Math.max(0.35, t * 0.68);
    const fanR = Math.min(w * 0.46, h * 0.09);
    const paths: string[] = [
      // Outer side rails & head/tail bars
      rectBar(0, 0, w, t, mapX, mapY),
      rectBar(0, h - t, w, t, mapX, mapY),
      rectBar(0, 0, tThin, h, mapX, mapY),
      rectBar(w - tThin, 0, tThin, h, mapX, mapY),
    ];

    // Top downward sunburst & bottom upward sunburst
    const topFanY = t * 1.4;
    const botFanY = h - t * 1.4;
    paths.push(
      arcBand(cx, topFanY, fanR, fanR, Math.max(0.6, fanR - tThin), Math.max(0.6, fanR - tThin), 0, 180, 14, mapX, mapY),
      arcBand(cx, botFanY, fanR, fanR, Math.max(0.6, fanR - tThin), Math.max(0.6, fanR - tThin), 180, 360, 14, mapX, mapY),
    );
    for (let i = 1; i <= 5; i++) {
      const topRad = ((180 * i) / 6) * (Math.PI / 180);
      const botRad = (180 + (180 * i) / 6) * (Math.PI / 180);
      paths.push(
        segmentBar(cx, topFanY, cx + Math.cos(topRad) * fanR, topFanY + Math.sin(topRad) * fanR, tThin, mapX, mapY),
        segmentBar(cx, botFanY, cx + Math.cos(botRad) * fanR, botFanY + Math.sin(botRad) * fanR, tThin, mapX, mapY),
      );
    }

    // Stacked stepped Art Deco chevrons & central vertical spear
    const halfW = Math.max(2, w * 0.42);
    const chevronDrop = Math.min(h * 0.055, w * 0.45);
    for (const ratio of [0.22, 0.34, 0.66, 0.78]) {
      const y = h * ratio;
      const dir = ratio < 0.5 ? 1 : -1;
      paths.push(
        segmentBar(cx - halfW, y, cx, y + dir * chevronDrop, tThin, mapX, mapY),
        segmentBar(cx, y + dir * chevronDrop, cx + halfW, y, tThin, mapX, mapY),
      );
    }
    // Central elongated Art Deco diamond medallion
    const medH = Math.min(h * 0.14, w * 1.1);
    paths.push(
      polygonPath(
        [
          [cx, h * 0.5 - medH],
          [cx + halfW * 0.75, h * 0.5],
          [cx, h * 0.5 + medH],
          [cx - halfW * 0.75, h * 0.5],
        ],
        mapX,
        mapY,
      ),
    );
    return paths;
  },

  'spine-orbital-axis': ({ w, h, t, mapX, mapY }) => {
    // Vertical technical sci-fi axis with planetary nodes & graduated ticks
    const cx = w / 2;
    const tHair = Math.max(0.35, t * 0.6);
    const nodeR = Math.min(w * 0.34, h * 0.048);
    const capH = Math.min(h * 0.04, 5);
    const paths: string[] = [
      // Precision top & bottom technical bracket caps
      rectBar(0, 0, w, t, mapX, mapY),
      rectBar(0, 0, tHair, capH, mapX, mapY),
      rectBar(w - tHair, 0, tHair, capH, mapX, mapY),
      rectBar(0, h - t, w, t, mapX, mapY),
      rectBar(0, h - capH, tHair, capH, mapX, mapY),
      rectBar(w - tHair, h - capH, tHair, capH, mapX, mapY),
      // Central precision vertical axis
      rectBar(cx - tHair / 2, t, tHair, Math.max(1, h - t * 2), mapX, mapY),
    ];

    // Graduated technical ruler ticks along axis
    const tickCount = 15;
    for (let i = 1; i < tickCount; i++) {
      const ratio = i / tickCount;
      // Leave breathing room around planetary nodes
      if (Math.abs(ratio - 0.2) < 0.07 || Math.abs(ratio - 0.5) < 0.09 || Math.abs(ratio - 0.8) < 0.07) {
        continue;
      }
      const tickW = i % 2 === 0 ? w * 0.44 : w * 0.26;
      paths.push(rectBar(cx - tickW / 2, h * ratio - tHair / 2, tickW, tHair * 0.85, mapX, mapY));
    }

    // 3 ringed planetary nodes (upper, center hero, lower)
    const nodes: readonly (readonly [number, number])[] = [
      [0.2, nodeR * 0.82],
      [0.5, nodeR * 1.15],
      [0.8, nodeR * 0.82],
    ];
    for (const [ratio, r] of nodes) {
      const ny = h * ratio;
      paths.push(
        ringBand(cx, ny, r, r, Math.max(0.5, r - tHair * 1.2), Math.max(0.5, r - tHair * 1.2), mapX, mapY),
        circleDisc(cx, ny, r * 0.45, r * 0.45, mapX, mapY),
      );
    }
    // Wide equatorial orbital ring around center hero node
    const orbitRx = Math.min(w * 0.48, nodeR * 1.9);
    const orbitRy = Math.max(1.2, nodeR * 0.55);
    paths.push(
      ringBand(
        cx,
        h * 0.5,
        orbitRx,
        orbitRy,
        Math.max(0.5, orbitRx - tHair),
        Math.max(0.3, orbitRy - tHair * 0.7),
        mapX,
        mapY,
      ),
    );
    return paths;
  },
};
