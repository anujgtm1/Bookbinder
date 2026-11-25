import { fmtMm } from '@/lib/svgFormat';

export type AxisMapper = (v: number) => number;

/** Builds a closed filled rectangle path (`M ... L ... Z`) in absolute coordinates. */
export function rectBar(
  x: number,
  y: number,
  w: number,
  h: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
): string {
  const x1 = mapX(x);
  const x2 = mapX(x + w);
  const y1 = mapY(y);
  const y2 = mapY(y + h);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return `M ${fmtMm(left)} ${fmtMm(top)} L ${fmtMm(right)} ${fmtMm(top)} L ${fmtMm(right)} ${fmtMm(bottom)} L ${fmtMm(left)} ${fmtMm(bottom)} Z`;
}

/** Builds a closed filled rectangular hollow frame from 4 clean joined bars. */
export function rectFrameBars(
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
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

/** Builds a closed polygon SVG path (`M ... L ... Z`) from local coordinate pairs. */
export function polygonPath(
  pts: readonly (readonly [number, number])[],
  mapX: AxisMapper,
  mapY: AxisMapper,
): string {
  if (pts.length === 0) return '';
  const [first, ...rest] = pts;
  const start = `M ${fmtMm(mapX(first[0]))} ${fmtMm(mapY(first[1]))}`;
  const lines = rest.map(([px, py]) => `L ${fmtMm(mapX(px))} ${fmtMm(mapY(py))}`).join(' ');
  return `${start} ${lines} Z`;
}

/** Builds a thick closed bar between two points (for diagonal struts/rays in Cricut-ready polygons). */
export function segmentBar(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  thickness: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
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
export function fourPointStar(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  waistRatio: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
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
export function leafPetal(
  bx: number,
  by: number,
  tx: number,
  ty: number,
  halfWidth: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
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

  return `M ${fmtMm(mapX(bx))} ${fmtMm(mapY(by))} Q ${fmtMm(mapX(c1x))} ${fmtMm(mapY(c1y))} ${fmtMm(mapX(tx))} ${fmtMm(mapY(ty))} Q ${fmtMm(mapX(c2x))} ${fmtMm(mapY(c2y))} ${fmtMm(mapX(bx))} ${fmtMm(mapY(by))} Z`;
}

/** Builds a closed filled ellipse via 4 cubic Beziers (CW by default, CCW when `ccw` is true). */
export function circleDisc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
  ccw = false,
): string {
  if (rx <= 1e-4 || ry <= 1e-4) return '';
  const k = 0.5522847498;
  const kx = rx * k;
  const ky = ry * k;
  const p = (x: number, y: number) => `${fmtMm(mapX(x))} ${fmtMm(mapY(y))}`;
  if (!ccw) {
    return [
      `M ${p(cx, cy - ry)}`,
      `C ${p(cx + kx, cy - ry)} ${p(cx + rx, cy - ky)} ${p(cx + rx, cy)}`,
      `C ${p(cx + rx, cy + ky)} ${p(cx + kx, cy + ry)} ${p(cx, cy + ry)}`,
      `C ${p(cx - kx, cy + ry)} ${p(cx - rx, cy + ky)} ${p(cx - rx, cy)}`,
      `C ${p(cx - rx, cy - ky)} ${p(cx - kx, cy - ry)} ${p(cx, cy - ry)}`,
      'Z',
    ].join(' ');
  }
  return [
    `M ${p(cx, cy - ry)}`,
    `C ${p(cx - kx, cy - ry)} ${p(cx - rx, cy - ky)} ${p(cx - rx, cy)}`,
    `C ${p(cx - rx, cy + ky)} ${p(cx - kx, cy + ry)} ${p(cx, cy + ry)}`,
    `C ${p(cx + kx, cy + ry)} ${p(cx + rx, cy + ky)} ${p(cx + rx, cy)}`,
    `C ${p(cx + rx, cy - ky)} ${p(cx + kx, cy - ry)} ${p(cx, cy - ry)}`,
    'Z',
  ].join(' ');
}

/** Builds a hollow elliptical ring (CW outer + CCW inner) valid under both nonzero and evenodd fill rules. */
export function ringBand(
  cx: number,
  cy: number,
  outerRx: number,
  outerRy: number,
  innerRx: number,
  innerRy: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
): string {
  const outer = circleDisc(cx, cy, outerRx, outerRy, mapX, mapY, false);
  const inner = circleDisc(cx, cy, Math.max(0.1, innerRx), Math.max(0.1, innerRy), mapX, mapY, true);
  return outer && inner ? `${outer} ${inner}` : outer;
}

/** Builds a closed filled elliptical arc band between `startDeg` and `endDeg`. */
export function arcBand(
  cx: number,
  cy: number,
  rxOut: number,
  ryOut: number,
  rxIn: number,
  ryIn: number,
  startDeg: number,
  endDeg: number,
  steps: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
): string {
  const safeSteps = Math.max(4, steps);
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= safeSteps; i++) {
    const rad = ((startDeg + ((endDeg - startDeg) * i) / safeSteps) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    outer.push([cx + cos * rxOut, cy + sin * ryOut]);
    inner.push([cx + cos * rxIn, cy + sin * ryIn]);
  }
  return polygonPath([...outer, ...inner.reverse()], mapX, mapY);
}

/** Builds a closed thick ribbon along a cubic Bezier curve (p0 → p1 → p2 → p3). */
export function cubicRibbon(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  thickness: number,
  steps: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
): string {
  const safeSteps = Math.max(6, steps);
  const spine: [number, number][] = [];
  for (let i = 0; i <= safeSteps; i++) {
    const u = i / safeSteps;
    const mu = 1 - u;
    const x =
      mu * mu * mu * p0[0] +
      3 * mu * mu * u * p1[0] +
      3 * mu * u * u * p2[0] +
      u * u * u * p3[0];
    const y =
      mu * mu * mu * p0[1] +
      3 * mu * mu * u * p1[1] +
      3 * mu * u * u * p2[1] +
      u * u * u * p3[1];
    spine.push([x, y]);
  }
  const half = thickness / 2;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= safeSteps; i++) {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(safeSteps, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.max(1e-5, Math.hypot(dx, dy));
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    left.push([spine[i][0] + nx, spine[i][1] + ny]);
    right.push([spine[i][0] - nx, spine[i][1] - ny]);
  }
  return polygonPath([...left, ...right.reverse()], mapX, mapY);
}

/**
 * Builds a single closed lunar phase silhouette centered at `(cx, cy)` with radius `r`.
 * `terminatorXRatio` in `[-1..1]` controls the inner edge curvature across the disc;
 * `side` selects whether the illuminated limb faces `'left'` (waning) or `'right'` (waxing).
 */
export function lunarPhaseShape(
  cx: number,
  cy: number,
  r: number,
  side: 'left' | 'right',
  terminatorXRatio: number,
  mapX: AxisMapper,
  mapY: AxisMapper,
): string {
  const steps = 16;
  const pts: [number, number][] = [];
  const limbSign = side === 'right' ? 1 : -1;
  // Outer semicircle from top (-pi/2) to bottom (+pi/2)
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps;
    pts.push([cx + limbSign * Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  // Inner terminator returning from bottom (+pi/2) to top (-pi/2)
  for (let i = steps; i >= 0; i--) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps;
    pts.push([cx + limbSign * Math.cos(a) * r * terminatorXRatio, cy + Math.sin(a) * r]);
  }
  return polygonPath(pts, mapX, mapY);
}
