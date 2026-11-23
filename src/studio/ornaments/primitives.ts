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
