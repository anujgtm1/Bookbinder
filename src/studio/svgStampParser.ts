import { fmtMm } from '@/lib/svgFormat';
import { normalizeQuarterTurn, type QuarterTurnDeg } from '@/types/studioLayer';
import { roundTo } from '@/types/units';

export type CustomSvgRenderMode = 'fill' | 'stroke' | 'fill-and-stroke';

export interface ParsedSvgStamp {
  readonly viewBoxWidth: number;
  readonly viewBoxHeight: number;
  /** Flattened absolute M/L/Q/C/Z path strings in [0..viewBoxWidth, 0..viewBoxHeight] coordinates */
  readonly paths: readonly string[];
  /** Suggested initial render mode detected from the source SVG's fill/stroke attributes */
  readonly suggestedMode: CustomSvgRenderMode;
}

const COMMAND_RE = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

function tokenizePath(d: string): string[] {
  return d.match(COMMAND_RE) ?? [];
}

/** Converts an SVG elliptical arc into 1..4 cubic Bezier segments (W3C SVG F.6.5). */
function arcToCubicSegments(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  xAxisRotDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number,
): readonly (readonly [number, number, number, number, number, number])[] {
  if (Math.hypot(x2 - x1, y2 - y1) < 1e-6) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-6 || ry < 1e-6) {
    return [[x1, y1, x2, y2, x2, y2]];
  }

  const phi = (xAxisRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const num = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
  const den = Math.max(1e-9, rxSq * y1pSq + rySq * x1pSq);
  const coef = (largeArcFlag === sweepFlag ? -1 : 1) * Math.sqrt(num / den);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angleBetween = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.max(1e-9, Math.hypot(ux, uy) * Math.hypot(vx, vy));
    const clamped = Math.max(-1, Math.min(1, dot / len));
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    return sign * Math.acos(clamped);
  };

  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );

  if (sweepFlag === 0 && dTheta > 0) dTheta -= Math.PI * 2;
  else if (sweepFlag === 1 && dTheta < 0) dTheta += Math.PI * 2;

  const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segCount;
  const alpha = (4 / 3) * Math.tan(delta / 4);

  const mapEllipse = (t: number): [number, number] => {
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    return [cosPhi * ex - sinPhi * ey + cx, sinPhi * ex + cosPhi * ey + cy];
  };
  const mapDeriv = (t: number): [number, number] => {
    const ex = -rx * Math.sin(t);
    const ey = ry * Math.cos(t);
    return [cosPhi * ex - sinPhi * ey, sinPhi * ex + cosPhi * ey];
  };

  const result: [number, number, number, number, number, number][] = [];
  for (let i = 0; i < segCount; i++) {
    const t1 = theta1 + i * delta;
    const t2 = t1 + delta;
    const [p1x, p1y] = mapEllipse(t1);
    const [p2x, p2y] = mapEllipse(t2);
    const [d1x, d1y] = mapDeriv(t1);
    const [d2x, d2y] = mapDeriv(t2);
    result.push([
      p1x + alpha * d1x,
      p1y + alpha * d1y,
      p2x - alpha * d2x,
      p2y - alpha * d2y,
      p2x,
      p2y,
    ]);
  }
  return result;
}

/**
 * Normalizes any SVG path `d` string into pure absolute `M`, `L`, `Q`, `C`, `Z` commands
 * offset by (-vbX, -vbY) so coordinates start cleanly at (0, 0).
 */
export function normalizeSvgPathD(d: string, vbX = 0, vbY = 0): string {
  const tokens = tokenizePath(d);
  if (tokens.length === 0) return '';

  const out: string[] = [];
  let idx = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCtrlX = 0;
  let prevCtrlY = 0;
  let prevCmd = '';

  const hasNum = () => idx < tokens.length && !/^[a-zA-Z]$/.test(tokens[idx]);
  const nextNum = () => Number.parseFloat(tokens[idx++] ?? '0') || 0;
  const mx = (x: number) => fmtMm(x - vbX);
  const my = (y: number) => fmtMm(y - vbY);

  while (idx < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[idx])) {
      cmd = tokens[idx++];
    } else if (!cmd) {
      break;
    }

    const isRel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();

    if (upper === 'Z') {
      out.push('Z');
      cx = sx;
      cy = sy;
      prevCmd = 'Z';
      cmd = '';
      continue;
    }

    if (!hasNum()) break;

    switch (upper) {
      case 'M': {
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        cx = x;
        cy = y;
        sx = x;
        sy = y;
        out.push(`M ${mx(cx)} ${my(cy)}`);
        prevCmd = 'M';
        // Subsequent coordinate pairs after M/m are implicit L/l
        cmd = isRel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        cx = x;
        cy = y;
        out.push(`L ${mx(cx)} ${my(cy)}`);
        prevCmd = 'L';
        break;
      }
      case 'H': {
        const x = nextNum() + (isRel ? cx : 0);
        cx = x;
        out.push(`L ${mx(cx)} ${my(cy)}`);
        prevCmd = 'H';
        break;
      }
      case 'V': {
        const y = nextNum() + (isRel ? cy : 0);
        cy = y;
        out.push(`L ${mx(cx)} ${my(cy)}`);
        prevCmd = 'V';
        break;
      }
      case 'C': {
        const x1 = nextNum() + (isRel ? cx : 0);
        const y1 = nextNum() + (isRel ? cy : 0);
        const x2 = nextNum() + (isRel ? cx : 0);
        const y2 = nextNum() + (isRel ? cy : 0);
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        out.push(`C ${mx(x1)} ${my(y1)} ${mx(x2)} ${my(y2)} ${mx(x)} ${my(y)}`);
        prevCtrlX = x2;
        prevCtrlY = y2;
        cx = x;
        cy = y;
        prevCmd = 'C';
        break;
      }
      case 'S': {
        const x1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cx - prevCtrlX : cx;
        const y1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cy - prevCtrlY : cy;
        const x2 = nextNum() + (isRel ? cx : 0);
        const y2 = nextNum() + (isRel ? cy : 0);
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        out.push(`C ${mx(x1)} ${my(y1)} ${mx(x2)} ${my(y2)} ${mx(x)} ${my(y)}`);
        prevCtrlX = x2;
        prevCtrlY = y2;
        cx = x;
        cy = y;
        prevCmd = 'S';
        break;
      }
      case 'Q': {
        const x1 = nextNum() + (isRel ? cx : 0);
        const y1 = nextNum() + (isRel ? cy : 0);
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        out.push(`Q ${mx(x1)} ${my(y1)} ${mx(x)} ${my(y)}`);
        prevCtrlX = x1;
        prevCtrlY = y1;
        cx = x;
        cy = y;
        prevCmd = 'Q';
        break;
      }
      case 'T': {
        const x1 = prevCmd === 'Q' || prevCmd === 'T' ? 2 * cx - prevCtrlX : cx;
        const y1 = prevCmd === 'Q' || prevCmd === 'T' ? 2 * cy - prevCtrlY : cy;
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        out.push(`Q ${mx(x1)} ${my(y1)} ${mx(x)} ${my(y)}`);
        prevCtrlX = x1;
        prevCtrlY = y1;
        cx = x;
        cy = y;
        prevCmd = 'T';
        break;
      }
      case 'A': {
        const rx = nextNum();
        const ry = nextNum();
        const rot = nextNum();
        const largeArc = nextNum();
        const sweep = nextNum();
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        const cubics = arcToCubicSegments(cx, cy, rx, ry, rot, largeArc, sweep, x, y);
        for (const [c1x, c1y, c2x, c2y, ex, ey] of cubics) {
          out.push(`C ${mx(c1x)} ${my(c1y)} ${mx(c2x)} ${my(c2y)} ${mx(ex)} ${my(ey)}`);
        }
        cx = x;
        cy = y;
        prevCmd = 'A';
        break;
      }
      default:
        idx++;
        break;
    }
  }

  return out.join(' ');
}

function ellipseToPathD(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5522847498;
  const ox = rx * k;
  const oy = ry * k;
  return [
    `M ${fmtMm(cx - rx)} ${fmtMm(cy)}`,
    `C ${fmtMm(cx - rx)} ${fmtMm(cy - oy)} ${fmtMm(cx - ox)} ${fmtMm(cy - ry)} ${fmtMm(cx)} ${fmtMm(cy - ry)}`,
    `C ${fmtMm(cx + ox)} ${fmtMm(cy - ry)} ${fmtMm(cx + rx)} ${fmtMm(cy - oy)} ${fmtMm(cx + rx)} ${fmtMm(cy)}`,
    `C ${fmtMm(cx + rx)} ${fmtMm(cy + oy)} ${fmtMm(cx + ox)} ${fmtMm(cy + ry)} ${fmtMm(cx)} ${fmtMm(cy + ry)}`,
    `C ${fmtMm(cx - ox)} ${fmtMm(cy + ry)} ${fmtMm(cx - rx)} ${fmtMm(cy + oy)} ${fmtMm(cx - rx)} ${fmtMm(cy)}`,
    'Z',
  ].join(' ');
}

function numAttr(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name);
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Parses an uploaded `.svg` document string into clean normalized absolute `M/L/Q/C/Z` vector paths
 * (skipping `<defs>`, `<clipPath>`, `<mask>`, `<script>`, `<style>`) ready for 1:1 mm scaling,
 * foil recoloring, optional line-weight thickening, PDF vector drawing, and Cricut HTV export.
 */
export function parseSvgStampText(svgText: string): ParsedSvgStamp | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.querySelector('svg');
  if (!root || doc.querySelector('parsererror')) return null;

  let vbX = 0;
  let vbY = 0;
  let vbW = 100;
  let vbH = 100;

  const vbAttr = root.getAttribute('viewBox');
  if (vbAttr) {
    const nums = vbAttr
      .trim()
      .split(/[\s,]+/)
      .map((s) => Number.parseFloat(s));
    if (nums.length === 4 && nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0) {
      [vbX, vbY, vbW, vbH] = nums;
    }
  } else {
    const attrW = numAttr(root, 'width', 100);
    const attrH = numAttr(root, 'height', 100);
    if (attrW > 0 && attrH > 0) {
      vbW = attrW;
      vbH = attrH;
    }
  }

  const paths: string[] = [];
  let strokeOnlyCount = 0;
  let filledCount = 0;

  const SKIP_TAGS = new Set(['defs', 'clippath', 'mask', 'pattern', 'script', 'style', 'symbol', 'title', 'desc']);

  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    const fillAttr = (node.getAttribute('fill') ?? '').trim().toLowerCase();
    const strokeAttr = (node.getAttribute('stroke') ?? '').trim().toLowerCase();
    const isStrokeOnly = fillAttr === 'none' && strokeAttr !== '' && strokeAttr !== 'none';

    let rawD = '';
    if (tag === 'path') {
      rawD = node.getAttribute('d') ?? '';
    } else if (tag === 'rect') {
      const x = numAttr(node, 'x');
      const y = numAttr(node, 'y');
      const w = numAttr(node, 'width');
      const h = numAttr(node, 'height');
      if (w > 0 && h > 0) {
        rawD = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
      }
    } else if (tag === 'circle') {
      const cx = numAttr(node, 'cx');
      const cy = numAttr(node, 'cy');
      const r = numAttr(node, 'r');
      if (r > 0) rawD = ellipseToPathD(cx, cy, r, r);
    } else if (tag === 'ellipse') {
      const cx = numAttr(node, 'cx');
      const cy = numAttr(node, 'cy');
      const rx = numAttr(node, 'rx');
      const ry = numAttr(node, 'ry');
      if (rx > 0 && ry > 0) rawD = ellipseToPathD(cx, cy, rx, ry);
    } else if (tag === 'line') {
      const x1 = numAttr(node, 'x1');
      const y1 = numAttr(node, 'y1');
      const x2 = numAttr(node, 'x2');
      const y2 = numAttr(node, 'y2');
      rawD = `M ${x1} ${y1} L ${x2} ${y2}`;
    } else if (tag === 'polygon' || tag === 'polyline') {
      const pts = (node.getAttribute('points') ?? '')
        .trim()
        .split(/[\s,]+/)
        .map((s) => Number.parseFloat(s))
        .filter(Number.isFinite);
      if (pts.length >= 4) {
        const segs: string[] = [`M ${pts[0]} ${pts[1]}`];
        for (let i = 2; i + 1 < pts.length; i += 2) {
          segs.push(`L ${pts[i]} ${pts[i + 1]}`);
        }
        if (tag === 'polygon') segs.push('Z');
        rawD = segs.join(' ');
      }
    }

    if (rawD) {
      const normalized = normalizeSvgPathD(rawD, vbX, vbY);
      if (normalized) {
        paths.push(normalized);
        if (isStrokeOnly || tag === 'line' || tag === 'polyline') {
          strokeOnlyCount++;
        } else {
          filledCount++;
        }
      }
    }

    for (const child of Array.from(node.children)) {
      walk(child);
    }
  };

  walk(root);

  if (paths.length === 0) return null;

  const suggestedMode: CustomSvgRenderMode =
    strokeOnlyCount > 0 && filledCount === 0
      ? 'stroke'
      : strokeOnlyCount > 0 && filledCount > 0
        ? 'fill-and-stroke'
        : 'fill';

  return {
    viewBoxWidth: roundTo(vbW, 3),
    viewBoxHeight: roundTo(vbH, 3),
    paths,
    suggestedMode,
  };
}

/**
 * Scales normalized absolute M/L/Q/C/Z SVG path strings into exact 1:1 mm canvas coordinates
 * with zero SVG `transform` attributes (100% compatible with Cricut Design Space & pdf-lib).
 */
export function mapNormalizedPathsToMm(
  paths: readonly string[],
  viewBoxWidth: number,
  viewBoxHeight: number,
  targetRect: { readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number },
  transform?: {
    readonly originXMm?: number;
    readonly originYMm?: number;
    readonly canvasWidthMm?: number;
    readonly mirrorX?: boolean;
    readonly flipX?: boolean;
    readonly flipY?: boolean;
    readonly rotationDeg?: QuarterTurnDeg;
  },
): readonly string[] {
  const ox = transform?.originXMm ?? 0;
  const oy = transform?.originYMm ?? 0;
  const mirrorX = transform?.mirrorX ?? false;
  const flipX = transform?.flipX ?? false;
  const flipY = transform?.flipY ?? false;
  const rot = normalizeQuarterTurn(transform?.rotationDeg);
  const canvasW = transform?.canvasWidthMm ?? 0;
  const scaleX = targetRect.widthMm / Math.max(1e-4, viewBoxWidth);
  const scaleY = targetRect.heightMm / Math.max(1e-4, viewBoxHeight);
  const cx = targetRect.xMm + targetRect.widthMm / 2;
  const cy = targetRect.yMm + targetRect.heightMm / 2;

  const mapPair = (px: number, py: number): string => {
    const fx = flipX ? viewBoxWidth - px : px;
    const fy = flipY ? viewBoxHeight - py : py;
    const localX = targetRect.xMm + fx * scaleX;
    const localY = targetRect.yMm + fy * scaleY;

    let worldX = localX;
    let worldY = localY;
    if (rot !== 0) {
      const dx = localX - cx;
      const dy = localY - cy;
      if (rot === 90) {
        worldX = cx - dy;
        worldY = cy + dx;
      } else if (rot === 180) {
        worldX = cx - dx;
        worldY = cy - dy;
      } else {
        worldX = cx + dy;
        worldY = cy - dx;
      }
    }

    const shiftedX = worldX - ox;
    const finalX = mirrorX ? canvasW - shiftedX : shiftedX;
    const finalY = worldY - oy;
    return `${fmtMm(finalX)} ${fmtMm(finalY)}`;
  };

  return paths.map((d) => {
    const tokens = tokenizePath(d);
    const out: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const cmd = tokens[i++];
      if (cmd === 'Z') {
        out.push('Z');
      } else if (cmd === 'M' || cmd === 'L') {
        const x = Number.parseFloat(tokens[i++] ?? '0');
        const y = Number.parseFloat(tokens[i++] ?? '0');
        out.push(`${cmd} ${mapPair(x, y)}`);
      } else if (cmd === 'Q') {
        const x1 = Number.parseFloat(tokens[i++] ?? '0');
        const y1 = Number.parseFloat(tokens[i++] ?? '0');
        const x = Number.parseFloat(tokens[i++] ?? '0');
        const y = Number.parseFloat(tokens[i++] ?? '0');
        out.push(`Q ${mapPair(x1, y1)} ${mapPair(x, y)}`);
      } else if (cmd === 'C') {
        const x1 = Number.parseFloat(tokens[i++] ?? '0');
        const y1 = Number.parseFloat(tokens[i++] ?? '0');
        const x2 = Number.parseFloat(tokens[i++] ?? '0');
        const y2 = Number.parseFloat(tokens[i++] ?? '0');
        const x = Number.parseFloat(tokens[i++] ?? '0');
        const y = Number.parseFloat(tokens[i++] ?? '0');
        out.push(`C ${mapPair(x1, y1)} ${mapPair(x2, y2)} ${mapPair(x, y)}`);
      }
    }
    return out.join(' ');
  });
}
