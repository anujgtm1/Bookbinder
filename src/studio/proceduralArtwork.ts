import { contrastRatio, parseHexColor, parseHexRgb, relativeLuminance, rgbToHex } from '@/lib/color';
import {
  getProceduralArtworkSpec,
  type ProceduralArtworkId,
  type ProceduralArtworkIntensity,
} from '@/resources/proceduralArtworks';
import { PRINT_DPI, roundTo } from '@/types/units';

export interface ProceduralArtworkOptions {
  readonly patternId: ProceduralArtworkId;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly baseColor: string;
  readonly accentColor: string;
  readonly secondaryColor?: string;
  readonly seed: number;
  readonly intensity?: ProceduralArtworkIntensity;
}

export interface ProceduralArtworkAsset {
  readonly svg: string;
  readonly dataUrl: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly fileName: string;
}

export const PROCEDURAL_ARTWORK_FILENAME_SUFFIX = ' (Pattern).svg';

export function isProceduralArtworkFileName(fileName: string): boolean {
  return fileName.endsWith(PROCEDURAL_ARTWORK_FILENAME_SUFFIX);
}

export function buildProceduralArtworkFileName(patternId: ProceduralArtworkId): string {
  return `${getProceduralArtworkSpec(patternId).label}${PROCEDURAL_ARTWORK_FILENAME_SUFFIX}`;
}

/** Deterministic Mulberry32 PRNG returning values in [0, 1). */
export function createMulberry32(seed: number): () => number {
  let state = (Math.floor(seed) | 0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const a = parseHexRgb(hexA);
  const b = parseHexRgb(hexB);
  if (!a || !b) return hexA;
  const clamped = Math.max(0, Math.min(1, t));
  return rgbToHex(
    a.r + (b.r - a.r) * clamped,
    a.g + (b.g - a.g) * clamped,
    a.b + (b.b - a.b) * clamped,
  );
}

/** Ensures pattern ink color has legible separation from the base surface color. */
export function resolvePatternAccentColor(baseHex: string, preferredAccentHex: string): string {
  const safeBase = parseHexColor(baseHex, '#1f3a52');
  const safeAccent = parseHexColor(preferredAccentHex, '#d9b566');
  const ratio = contrastRatio(safeAccent, safeBase) ?? 1;
  if (ratio >= 2.2) return safeAccent;
  const rgb = parseHexRgb(safeBase);
  const lum = rgb ? relativeLuminance(rgb) : 0.1;
  return lum > 0.45 ? '#263342' : '#e6c97a';
}

interface PatternContext {
  readonly w: number;
  readonly h: number;
  readonly base: string;
  readonly accent: string;
  readonly secondary: string;
  readonly deep: string;
  readonly highlight: string;
  readonly seed: number;
  readonly intensity: ProceduralArtworkIntensity;
  readonly alphaMain: number;
  readonly alphaSoft: number;
  readonly alphaLine: number;
  readonly rng: () => number;
  readonly uid: string;
}

function buildPatternContext(options: ProceduralArtworkOptions): PatternContext {
  const w = roundTo(Math.max(12, Number.isFinite(options.widthMm) ? options.widthMm : 140), 2);
  const h = roundTo(Math.max(12, Number.isFinite(options.heightMm) ? options.heightMm : 210), 2);
  const base = parseHexColor(options.baseColor, '#1f3a52');
  const accent = resolvePatternAccentColor(base, options.accentColor);
  const baseRgb = parseHexRgb(base);
  const isLightBase = baseRgb ? relativeLuminance(baseRgb) > 0.45 : false;
  const derivedSecondary = options.secondaryColor
    ? parseHexColor(options.secondaryColor, mixHex(base, accent, 0.52))
    : mixHex(base, accent, isLightBase ? 0.55 : 0.48);
  const deep = isLightBase ? mixHex(base, '#161412', 0.24) : mixHex(base, '#05070c', 0.42);
  const highlight = isLightBase ? mixHex(accent, '#ffffff', 0.22) : mixHex(accent, '#ffffff', 0.34);

  const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 1;
  const intensity: ProceduralArtworkIntensity = options.intensity ?? 'subtle';
  const isVivid = intensity === 'vivid';

  return {
    w,
    h,
    base,
    accent,
    secondary: derivedSecondary,
    deep,
    highlight,
    seed,
    intensity,
    alphaMain: isVivid ? 0.72 : 0.28,
    alphaSoft: isVivid ? 0.48 : 0.18,
    alphaLine: isVivid ? 0.84 : 0.32,
    rng: createMulberry32(seed ^ (options.patternId.length * 2654435761)),
    uid: `p${Math.abs(seed) % 999983}`,
  };
}

/** 1. Suminagashi Marble — Japanese concentric ink waves with organic harmonic drift. */
function renderSuminagashiMarble(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, accent, secondary, deep, highlight, alphaMain, alphaSoft, alphaLine, rng } = ctx;
  const parts: string[] = [];
  const diag = Math.hypot(w, h);
  const combAngle = rng() * Math.PI;
  const cosA = Math.cos(combAngle);
  const sinA = Math.sin(combAngle);
  const combFreq = (2 * Math.PI) / Math.max(26, Math.min(w, h) * (0.45 + rng() * 0.35));
  const combAmp = Math.min(w, h) * (0.045 + rng() * 0.045);

  const centerCount = 3 + Math.floor(rng() * 2);
  for (let c = 0; c < centerCount; c++) {
    const cx = w * (0.14 + rng() * 0.72);
    const cy = h * (0.14 + rng() * 0.72);
    const phase1 = rng() * Math.PI * 2;
    const phase2 = rng() * Math.PI * 2;
    const freq1 = 2 + Math.floor(rng() * 3);
    const freq2 = 5 + Math.floor(rng() * 3);
    const ringCount = 13 + Math.floor(rng() * 5);
    const maxR = diag * (0.42 + rng() * 0.34);

    for (let rIdx = ringCount; rIdx >= 1; rIdx--) {
      const t = rIdx / ringCount;
      const baseR = t * maxR;
      const steps = 64;
      const pts: string[] = [];
      for (let s = 0; s < steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        const wobble =
          1 +
          0.11 * Math.sin(freq1 * theta + phase1 + t * 2.2) +
          0.055 * Math.cos(freq2 * theta + phase2 - t * 3.1);
        const rx = cx + Math.cos(theta) * baseR * wobble;
        const ry = cy + Math.sin(theta) * baseR * wobble;
        const proj = rx * cosA + ry * sinA;
        const shift = Math.sin(proj * combFreq + c * 1.4) * combAmp;
        const px = rx - sinA * shift;
        const py = ry + cosA * shift;
        pts.push(`${s === 0 ? 'M' : 'L'} ${fmt(px)} ${fmt(py)}`);
      }
      pts.push('Z');
      const d = pts.join(' ');
      const isBand = rIdx % 3 === 0;
      const strokeColor = rIdx % 2 === 0 ? accent : secondary;
      const fillColor = rIdx % 4 === 0 ? deep : secondary;
      const strokeW = roundTo(Math.max(0.28, (Math.min(w, h) / 170) * (rIdx % 3 === 0 ? 0.9 : 0.45)), 2);

      if (isBand) {
        parts.push(
          `<path d="${d}" fill="${fillColor}" fill-opacity="${fmt(alphaSoft * 0.55)}" stroke="${strokeColor}" stroke-opacity="${fmt(alphaLine * 0.88)}" stroke-width="${fmt(strokeW)}" />`,
        );
      } else {
        parts.push(
          `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-opacity="${fmt(alphaMain * 0.9)}" stroke-width="${fmt(strokeW)}" />`,
        );
      }
    }
  }

  // Delicate combed flow ribbons across full sheet
  const ribbonCount = 7;
  for (let i = 0; i < ribbonCount; i++) {
    const yBase = (h * (i + 0.5)) / ribbonCount;
    const amp = h * (0.04 + rng() * 0.04);
    const ph = rng() * Math.PI * 2;
    const segs: string[] = [];
    for (let s = 0; s <= 32; s++) {
      const x = (w * s) / 32;
      const y = yBase + Math.sin((x / Math.max(20, w)) * Math.PI * 2.5 + ph) * amp;
      segs.push(`${s === 0 ? 'M' : 'L'} ${fmt(x)} ${fmt(y)}`);
    }
    parts.push(
      `<path d="${segs.join(' ')}" fill="none" stroke="${highlight}" stroke-opacity="${fmt(alphaSoft * 0.85)}" stroke-width="${fmt(Math.max(0.25, w / 420))}" />`,
    );
  }

  return { defs: '', body: parts.join('') };
}

/** 2. Cosmic Nebula — layered radial cosmic washes, crisp starfield & constellations. */
function renderCosmicNebula(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, accent, secondary, deep, highlight, alphaMain, alphaSoft, alphaLine, rng, uid } = ctx;
  const defs: string[] = [];
  const body: string[] = [];

  // Deep radial vignette wash
  defs.push(
    `<radialGradient id="${uid}-vignette" cx="50%" cy="45%" r="72%">` +
      `<stop offset="0%" stop-color="${secondary}" stop-opacity="${fmt(alphaSoft * 0.5)}" />` +
      `<stop offset="100%" stop-color="${deep}" stop-opacity="${fmt(alphaMain * 0.65)}" />` +
      `</radialGradient>`,
  );
  body.push(`<rect x="0" y="0" width="${fmt(w)}" height="${fmt(h)}" fill="url(#${uid}-vignette)" />`);

  // Layered nebula clouds
  const cloudCount = 5;
  for (let i = 0; i < cloudCount; i++) {
    const cx = w * (0.12 + rng() * 0.76);
    const cy = h * (0.12 + rng() * 0.76);
    const rx = Math.max(w, h) * (0.24 + rng() * 0.28);
    const ry = rx * (0.65 + rng() * 0.55);
    const gradId = `${uid}-neb-${i}`;
    const cloudColor = i % 2 === 0 ? accent : secondary;
    defs.push(
      `<radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">` +
        `<stop offset="0%" stop-color="${cloudColor}" stop-opacity="${fmt(alphaMain * 0.62)}" />` +
        `<stop offset="55%" stop-color="${secondary}" stop-opacity="${fmt(alphaSoft * 0.42)}" />` +
        `<stop offset="100%" stop-color="${cloudColor}" stop-opacity="0" />` +
        `</radialGradient>`,
    );
    body.push(
      `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="url(#${gradId})" />`,
    );
  }

  // Subtle orbital sweeping arcs
  const arcCount = 3;
  for (let i = 0; i < arcCount; i++) {
    const cx = w * (0.25 + rng() * 0.5);
    const cy = h * (0.25 + rng() * 0.5);
    const r = Math.min(w, h) * (0.22 + i * 0.18 + rng() * 0.08);
    body.push(
      `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="none" stroke="${highlight}" stroke-opacity="${fmt(alphaSoft * 0.65)}" stroke-width="${fmt(Math.max(0.22, Math.min(w, h) / 420))}" stroke-dasharray="${fmt(r * 0.08)} ${fmt(r * 0.06)}" />`,
    );
  }

  // Constellation anchor stars + connecting filaments
  const anchorStars: { readonly x: number; readonly y: number }[] = [];
  const constellationCount = 3;
  for (let g = 0; g < constellationCount; g++) {
    const gx = w * (0.16 + rng() * 0.68);
    const gy = h * (0.16 + rng() * 0.68);
    const spread = Math.min(w, h) * 0.22;
    const nodeCount = 4 + Math.floor(rng() * 3);
    const nodes: { readonly x: number; readonly y: number }[] = [];
    for (let n = 0; n < nodeCount; n++) {
      const pt = {
        x: Math.max(w * 0.05, Math.min(w * 0.95, gx + (rng() - 0.5) * spread * 2)),
        y: Math.max(h * 0.05, Math.min(h * 0.95, gy + (rng() - 0.5) * spread * 2)),
      };
      nodes.push(pt);
      anchorStars.push(pt);
    }
    for (let n = 0; n < nodes.length - 1; n++) {
      body.push(
        `<line x1="${fmt(nodes[n].x)}" y1="${fmt(nodes[n].y)}" x2="${fmt(nodes[n + 1].x)}" y2="${fmt(nodes[n + 1].y)}" stroke="${highlight}" stroke-opacity="${fmt(alphaLine * 0.52)}" stroke-width="${fmt(Math.max(0.2, Math.min(w, h) / 480))}" />`,
      );
    }
  }

  // Crisp 4-point sparkle stars
  const sparkleSizeBase = Math.max(1.2, Math.min(w, h) * 0.022);
  for (let i = 0; i < anchorStars.length; i++) {
    const s = anchorStars[i];
    const r = sparkleSizeBase * (0.75 + rng() * 0.75);
    const inner = r * 0.22;
    const d =
      `M ${fmt(s.x)} ${fmt(s.y - r)} ` +
      `L ${fmt(s.x + inner)} ${fmt(s.y - inner)} ` +
      `L ${fmt(s.x + r)} ${fmt(s.y)} ` +
      `L ${fmt(s.x + inner)} ${fmt(s.y + inner)} ` +
      `L ${fmt(s.x)} ${fmt(s.y + r)} ` +
      `L ${fmt(s.x - inner)} ${fmt(s.y + inner)} ` +
      `L ${fmt(s.x - r)} ${fmt(s.y)} ` +
      `L ${fmt(s.x - inner)} ${fmt(s.y - inner)} Z`;
    body.push(
      `<path d="${d}" fill="${highlight}" fill-opacity="${fmt(alphaLine)}" />`,
    );
  }

  // Multi-size pinpoint starfield
  const starCount = Math.min(180, Math.max(60, Math.round((w * h) / 260)));
  for (let i = 0; i < starCount; i++) {
    const sx = rng() * w;
    const sy = rng() * h;
    const sr = Math.max(0.18, Math.min(w, h) * (0.0014 + rng() * 0.0038));
    const op = alphaSoft + rng() * (alphaLine - alphaSoft);
    body.push(
      `<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(sr)}" fill="${i % 4 === 0 ? accent : highlight}" fill-opacity="${fmt(op)}" />`,
    );
  }

  return { defs: defs.join(''), body: body.join('') };
}

/** 3. Art Deco Fans — seamless 1920s gilded scalloped fan lattice with radiating metallic hairlines. */
function renderArtDecoFans(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, base, accent, secondary, deep, alphaMain, alphaSoft, alphaLine, rng } = ctx;
  const scaleMod = 0.88 + rng() * 0.26;
  const fanR = Math.max(12, Math.min(28, Math.min(w, h) * 0.16 * scaleMod));
  const colStep = fanR * 2;
  const rowStep = fanR * 0.92;
  const strokeW = roundTo(Math.max(0.24, fanR * 0.022), 2);
  const parts: string[] = [];

  const rows = Math.ceil(h / rowStep) + 2;
  const cols = Math.ceil(w / colStep) + 2;
  const spokes = 7;

  for (let row = -1; row <= rows; row++) {
    const cy = row * rowStep + fanR;
    const xOffset = row % 2 === 0 ? 0 : fanR;
    for (let col = -1; col <= cols; col++) {
      const cx = col * colStep + xOffset;
      // Base fan backdrop (masks overlapped lower row cleanly)
      const outerPath =
        `M ${fmt(cx - fanR)} ${fmt(cy)} ` +
        `A ${fmt(fanR)} ${fmt(fanR)} 0 0 1 ${fmt(cx + fanR)} ${fmt(cy)} Z`;
      parts.push(
        `<path d="${outerPath}" fill="${mixHex(base, deep, 0.22)}" stroke="${accent}" stroke-opacity="${fmt(alphaLine)}" stroke-width="${fmt(strokeW * 1.15)}" />`,
      );

      // Inner nested scalloped rings
      for (const ratio of [0.76, 0.52, 0.28]) {
        const rr = fanR * ratio;
        const arcPath =
          `M ${fmt(cx - rr)} ${fmt(cy)} ` +
          `A ${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(cx + rr)} ${fmt(cy)}`;
        parts.push(
          `<path d="${arcPath}" fill="${ratio === 0.52 ? secondary : 'none'}" fill-opacity="${fmt(alphaSoft * 0.32)}" stroke="${accent}" stroke-opacity="${fmt(alphaMain)}" stroke-width="${fmt(strokeW * 0.85)}" />`,
        );
      }

      // Radiating Art Deco sunburst ribs
      for (let k = 1; k < spokes; k++) {
        const angle = Math.PI + (k / spokes) * Math.PI;
        const x1 = cx + Math.cos(angle) * fanR * 0.28;
        const y1 = cy + Math.sin(angle) * fanR * 0.28;
        const x2 = cx + Math.cos(angle) * fanR;
        const y2 = cy + Math.sin(angle) * fanR;
        parts.push(
          `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${accent}" stroke-opacity="${fmt(alphaMain * 0.9)}" stroke-width="${fmt(strokeW * 0.75)}" />`,
        );
      }

      // Central gilded pearl dot
      parts.push(
        `<circle cx="${fmt(cx)}" cy="${fmt(cy - fanR * 0.14)}" r="${fmt(fanR * 0.06)}" fill="${accent}" fill-opacity="${fmt(alphaLine)}" />`,
      );
    }
  }

  return { defs: '', body: parts.join('') };
}

/** 4. Seigaiha Waves — classic Japanese overlapping concentric wave arcs. */
function renderSeigaihaWaves(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, base, accent, secondary, deep, alphaMain, alphaSoft, alphaLine, rng } = ctx;
  const scaleMod = 0.86 + rng() * 0.28;
  const radius = Math.max(10, Math.min(24, Math.min(w, h) * 0.13 * scaleMod));
  const colStep = radius * 2;
  const rowStep = radius * 0.52;
  const strokeW = roundTo(Math.max(0.24, radius * 0.036), 2);
  const parts: string[] = [];

  const rows = Math.ceil(h / rowStep) + 3;
  const cols = Math.ceil(w / colStep) + 2;
  const ringRatios = [1.0, 0.8, 0.6, 0.4, 0.2] as const;

  for (let row = -1; row <= rows; row++) {
    const cy = row * rowStep;
    const xOffset = row % 2 === 0 ? 0 : radius;
    for (let col = -1; col <= cols; col++) {
      const cx = col * colStep + xOffset;
      for (let i = 0; i < ringRatios.length; i++) {
        const rr = radius * ringRatios[i];
        const fill =
          i === 0
            ? base
            : i % 2 === 1
              ? mixHex(base, secondary, alphaSoft * 0.9)
              : mixHex(base, deep, 0.14);
        parts.push(
          `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(rr)}" fill="${fill}" stroke="${i === 0 ? accent : i % 2 === 0 ? accent : secondary}" stroke-opacity="${fmt(i === 0 ? alphaLine : alphaMain)}" stroke-width="${fmt(strokeW)}" />`,
        );
      }
    }
  }

  return { defs: '', body: parts.join('') };
}

/** 5. Kumiko Star Lattice — crisp Japanese Asanoha (hemp-leaf) geometric star-grid. */
function renderKumikoLattice(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, accent, secondary, highlight, alphaMain, alphaSoft, alphaLine, rng } = ctx;
  const scaleMod = 0.86 + rng() * 0.28;
  const r = Math.max(12, Math.min(26, Math.min(w, h) * 0.14 * scaleMod));
  const dx = r * Math.sqrt(3);
  const dy = r * 1.5;
  const strokeW = roundTo(Math.max(0.22, r * 0.025), 2);
  const parts: string[] = [];

  const rows = Math.ceil(h / dy) + 2;
  const cols = Math.ceil(w / dx) + 2;

  for (let row = -1; row <= rows; row++) {
    const cy = row * dy;
    const xOffset = row % 2 === 0 ? 0 : dx / 2;
    for (let col = -1; col <= cols; col++) {
      const cx = col * dx + xOffset;
      const verts: { readonly x: number; readonly y: number }[] = [];
      for (let k = 0; k < 6; k++) {
        const angle = (k * Math.PI) / 3 - Math.PI / 2;
        verts.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        });
      }

      // Outer hexagon
      const hexD =
        verts.map((v, idx) => `${idx === 0 ? 'M' : 'L'} ${fmt(v.x)} ${fmt(v.y)}`).join(' ') + ' Z';
      parts.push(
        `<path d="${hexD}" fill="none" stroke="${accent}" stroke-opacity="${fmt(alphaLine * 0.9)}" stroke-width="${fmt(strokeW * 1.1)}" />`,
      );

      // 6 equilateral triangles subdivided into 3 Asanoha star facets each
      for (let k = 0; k < 6; k++) {
        const a = verts[k];
        const b = verts[(k + 1) % 6];
        const subX = (cx + a.x + b.x) / 3;
        const subY = (cy + a.y + b.y) / 3;

        // Subtle alternating facet fill for woven woodblock depth
        const facetD = `M ${fmt(cx)} ${fmt(cy)} L ${fmt(a.x)} ${fmt(a.y)} L ${fmt(subX)} ${fmt(subY)} Z`;
        parts.push(
          `<path d="${facetD}" fill="${k % 2 === 0 ? secondary : highlight}" fill-opacity="${fmt(alphaSoft * 0.42)}" />`,
        );

        // Radiating ribs from center + inner kite edges
        parts.push(
          `<path d="M ${fmt(cx)} ${fmt(cy)} L ${fmt(a.x)} ${fmt(a.y)} M ${fmt(cx)} ${fmt(cy)} L ${fmt(subX)} ${fmt(subY)} M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(subX)} ${fmt(subY)} L ${fmt(b.x)} ${fmt(b.y)}" fill="none" stroke="${accent}" stroke-opacity="${fmt(alphaMain)}" stroke-width="${fmt(strokeW * 0.85)}" />`,
        );
      }
    }
  }

  return { defs: '', body: parts.join('') };
}

/** 6. Bauhaus Modern — bold Mid-Century / Swiss quarter-circles, arches, blocks & diagonal accents. */
function renderBauhausPoster(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, accent, secondary, deep, highlight, alphaMain, alphaSoft, alphaLine, rng } = ctx;
  const cols = w > h * 1.25 ? 6 : 4;
  const cellW = w / cols;
  const rows = Math.max(3, Math.round(h / cellW));
  const cellH = h / rows;
  const strokeW = roundTo(Math.max(0.3, Math.min(cellW, cellH) * 0.018), 2);
  const parts: string[] = [];

  const palette = [accent, secondary, deep, highlight] as const;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellW;
      const y = row * cellH;
      const shape = Math.floor(rng() * 7);
      const fill = palette[Math.floor(rng() * palette.length)];
      const op = shape % 2 === 0 ? alphaMain : alphaSoft * 1.15;

      if (shape === 0) {
        // Quarter-circle sweeping from one of 4 corners
        const corner = Math.floor(rng() * 4);
        const rx = cellW;
        const ry = cellH;
        let d: string;
        if (corner === 0) {
          d = `M ${fmt(x)} ${fmt(y)} L ${fmt(x + cellW)} ${fmt(y)} A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x)} ${fmt(y + cellH)} Z`;
        } else if (corner === 1) {
          d = `M ${fmt(x + cellW)} ${fmt(y)} L ${fmt(x + cellW)} ${fmt(y + cellH)} A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x)} ${fmt(y)} Z`;
        } else if (corner === 2) {
          d = `M ${fmt(x + cellW)} ${fmt(y + cellH)} L ${fmt(x)} ${fmt(y + cellH)} A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + cellW)} ${fmt(y)} Z`;
        } else {
          d = `M ${fmt(x)} ${fmt(y + cellH)} L ${fmt(x)} ${fmt(y)} A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + cellW)} ${fmt(y + cellH)} Z`;
        }
        parts.push(`<path d="${d}" fill="${fill}" fill-opacity="${fmt(op)}" />`);
      } else if (shape === 1) {
        // Swiss architectural arch
        const r = cellW / 2;
        const archD =
          `M ${fmt(x)} ${fmt(y + cellH)} ` +
          `L ${fmt(x)} ${fmt(y + r)} ` +
          `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x + cellW)} ${fmt(y + r)} ` +
          `L ${fmt(x + cellW)} ${fmt(y + cellH)} Z`;
        parts.push(`<path d="${archD}" fill="${fill}" fill-opacity="${fmt(op)}" />`);
      } else if (shape === 2) {
        // Diagonal split triangle
        const flip = rng() > 0.5;
        const d = flip
          ? `M ${fmt(x)} ${fmt(y)} L ${fmt(x + cellW)} ${fmt(y)} L ${fmt(x + cellW)} ${fmt(y + cellH)} Z`
          : `M ${fmt(x)} ${fmt(y)} L ${fmt(x + cellW)} ${fmt(y + cellH)} L ${fmt(x)} ${fmt(y + cellH)} Z`;
        parts.push(`<path d="${d}" fill="${fill}" fill-opacity="${fmt(op)}" />`);
      } else if (shape === 3) {
        // Concentric target circle
        const cx = x + cellW / 2;
        const cy = y + cellH / 2;
        const r = Math.min(cellW, cellH) * 0.42;
        parts.push(
          `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${fill}" fill-opacity="${fmt(op)}" />`,
        );
        parts.push(
          `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r * 0.46)}" fill="none" stroke="${accent}" stroke-opacity="${fmt(alphaLine)}" stroke-width="${fmt(strokeW * 1.4)}" />`,
        );
      } else if (shape === 4) {
        // Parallel modernist stripes
        const stripeCount = 4;
        const horizontal = rng() > 0.5;
        for (let k = 0; k < stripeCount; k++) {
          if (horizontal) {
            const sy = y + (k + 0.5) * (cellH / stripeCount);
            parts.push(
              `<line x1="${fmt(x)}" y1="${fmt(sy)}" x2="${fmt(x + cellW)}" y2="${fmt(sy)}" stroke="${accent}" stroke-opacity="${fmt(alphaLine * 0.85)}" stroke-width="${fmt(strokeW * 1.6)}" />`,
            );
          } else {
            const sx = x + (k + 0.5) * (cellW / stripeCount);
            parts.push(
              `<line x1="${fmt(sx)}" y1="${fmt(y)}" x2="${fmt(sx)}" y2="${fmt(y + cellH)}" stroke="${accent}" stroke-opacity="${fmt(alphaLine * 0.85)}" stroke-width="${fmt(strokeW * 1.6)}" />`,
            );
          }
        }
      } else if (shape === 5) {
        // Half-block + dot counterpoint
        const topHalf = rng() > 0.5;
        parts.push(
          `<rect x="${fmt(x)}" y="${fmt(topHalf ? y : y + cellH / 2)}" width="${fmt(cellW)}" height="${fmt(cellH / 2)}" fill="${fill}" fill-opacity="${fmt(op * 0.85)}" />`,
        );
        parts.push(
          `<circle cx="${fmt(x + cellW / 2)}" cy="${fmt(topHalf ? y + cellH * 0.75 : y + cellH * 0.25)}" r="${fmt(Math.min(cellW, cellH) * 0.14)}" fill="${highlight}" fill-opacity="${fmt(alphaLine)}" />`,
        );
      }
      // shape === 6 leaves breathing negative space for crisp Swiss balance

      // Subtle Swiss modular grid hairlines
      parts.push(
        `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(cellW)}" height="${fmt(cellH)}" fill="none" stroke="${accent}" stroke-opacity="${fmt(alphaSoft * 0.55)}" stroke-width="${fmt(strokeW * 0.65)}" />`,
      );
    }
  }

  return { defs: '', body: parts.join('') };
}

/** 7. Topographic Contours — flowing duotone elevation contour curves from seeded harmonic fields. */
function renderTopographicContours(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, accent, secondary, highlight, alphaMain, alphaSoft, alphaLine, rng } = ctx;
  // Seeded multi-harmonic 2D elevation field
  const waves = Array.from({ length: 5 }, () => ({
    kx: (1.2 + rng() * 2.6) * (rng() > 0.5 ? 1 : -1),
    ky: (1.2 + rng() * 2.6) * (rng() > 0.5 ? 1 : -1),
    phase: rng() * Math.PI * 2,
    amp: 0.45 + rng() * 0.75,
  }));

  const gridCols = 34;
  const gridRows = Math.max(24, Math.min(48, Math.round((gridCols * h) / Math.max(10, w))));
  const values: number[][] = [];
  let minV = Infinity;
  let maxV = -Infinity;

  for (let r = 0; r <= gridRows; r++) {
    const rowVals: number[] = [];
    const ny = (r / gridRows) * Math.PI * 2;
    for (let c = 0; c <= gridCols; c++) {
      const nx = (c / gridCols) * Math.PI * 2;
      let v = 0;
      for (const wave of waves) {
        v += Math.sin(nx * wave.kx + ny * wave.ky + wave.phase) * wave.amp;
      }
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
      rowVals.push(v);
    }
    values.push(rowVals);
  }

  const levels = 11;
  const dx = w / gridCols;
  const dy = h / gridRows;
  const baseStroke = Math.max(0.24, Math.min(w, h) / 360);
  const parts: string[] = [];

  const interp = (a: number, b: number, level: number): number => {
    const denom = b - a;
    if (Math.abs(denom) < 1e-6) return 0.5;
    return Math.max(0, Math.min(1, (level - a) / denom));
  };

  for (let l = 1; l <= levels; l++) {
    const level = minV + ((maxV - minV) * l) / (levels + 1);
    const segs: string[] = [];

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const v0 = values[r][c];
        const v1 = values[r][c + 1];
        const v2 = values[r + 1][c + 1];
        const v3 = values[r + 1][c];

        const x0 = c * dx;
        const y0 = r * dy;
        const crossings: [number, number][] = [];

        if ((v0 < level) !== (v1 < level)) {
          crossings.push([x0 + interp(v0, v1, level) * dx, y0]);
        }
        if ((v1 < level) !== (v2 < level)) {
          crossings.push([x0 + dx, y0 + interp(v1, v2, level) * dy]);
        }
        if ((v3 < level) !== (v2 < level)) {
          crossings.push([x0 + interp(v3, v2, level) * dx, y0 + dy]);
        }
        if ((v0 < level) !== (v3 < level)) {
          crossings.push([x0, y0 + interp(v0, v3, level) * dy]);
        }

        if (crossings.length === 2) {
          segs.push(
            `M ${fmt(crossings[0][0])} ${fmt(crossings[0][1])} L ${fmt(crossings[1][0])} ${fmt(crossings[1][1])}`,
          );
        } else if (crossings.length === 4) {
          segs.push(
            `M ${fmt(crossings[0][0])} ${fmt(crossings[0][1])} L ${fmt(crossings[1][0])} ${fmt(crossings[1][1])} ` +
              `M ${fmt(crossings[2][0])} ${fmt(crossings[2][1])} L ${fmt(crossings[3][0])} ${fmt(crossings[3][1])}`,
          );
        }
      }
    }

    if (segs.length > 0) {
      const isIndexContour = l % 3 === 0;
      const stroke = isIndexContour ? accent : l % 2 === 0 ? highlight : secondary;
      const op = isIndexContour ? alphaLine : alphaMain * 0.85;
      const sw = isIndexContour ? baseStroke * 1.55 : baseStroke * 0.85;
      parts.push(
        `<path d="${segs.join(' ')}" fill="none" stroke="${stroke}" stroke-opacity="${fmt(op)}" stroke-width="${fmt(sw)}" stroke-linecap="round" />`,
      );
    }
  }

  // Subtle cartographic hairline crosshairs
  const tickCount = 4;
  for (let i = 0; i < tickCount; i++) {
    const tx = w * (0.18 + rng() * 0.64);
    const ty = h * (0.18 + rng() * 0.64);
    const arm = Math.max(1.8, Math.min(w, h) * 0.02);
    parts.push(
      `<path d="M ${fmt(tx - arm)} ${fmt(ty)} L ${fmt(tx + arm)} ${fmt(ty)} M ${fmt(tx)} ${fmt(ty - arm)} L ${fmt(tx)} ${fmt(ty + arm)}" fill="none" stroke="${accent}" stroke-opacity="${fmt(alphaSoft * 1.1)}" stroke-width="${fmt(baseStroke)}" />`,
    );
  }

  return { defs: '', body: parts.join('') };
}

/** 8. Clothbound Botanical — Penguin Clothbound–inspired diamond trellis with leaves & rosettes. */
function renderBotanicalMedallionTile(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, accent, secondary, highlight, alphaMain, alphaSoft, alphaLine, rng } = ctx;
  const scaleMod = 0.88 + rng() * 0.24;
  const cellW = Math.max(18, Math.min(34, Math.min(w, h) * 0.2 * scaleMod));
  const cellH = cellW * 1.28;
  const strokeW = roundTo(Math.max(0.24, cellW * 0.018), 2);
  const parts: string[] = [];

  const cols = Math.ceil(w / cellW) + 2;
  const rows = Math.ceil(h / cellH) + 2;

  for (let row = -1; row <= rows; row++) {
    for (let col = -1; col <= cols; col++) {
      const cx = col * cellW + (row % 2 === 0 ? 0 : cellW / 2);
      const cy = row * cellH;
      const hw = cellW / 2;
      const hh = cellH / 2;

      // Flowing ogee / diamond trellis frame
      const trellisD =
        `M ${fmt(cx)} ${fmt(cy - hh)} ` +
        `Q ${fmt(cx + hw * 0.58)} ${fmt(cy - hh * 0.35)} ${fmt(cx + hw)} ${fmt(cy)} ` +
        `Q ${fmt(cx + hw * 0.58)} ${fmt(cy + hh * 0.35)} ${fmt(cx)} ${fmt(cy + hh)} ` +
        `Q ${fmt(cx - hw * 0.58)} ${fmt(cy + hh * 0.35)} ${fmt(cx - hw)} ${fmt(cy)} ` +
        `Q ${fmt(cx - hw * 0.58)} ${fmt(cy - hh * 0.35)} ${fmt(cx)} ${fmt(cy - hh)} Z`;
      parts.push(
        `<path d="${trellisD}" fill="none" stroke="${accent}" stroke-opacity="${fmt(alphaMain * 0.9)}" stroke-width="${fmt(strokeW)}" />`,
      );

      // Symmetrical 8-petal floral rosette medallion in center of diamond
      const petalR = Math.min(hw, hh) * 0.48;
      const petalCount = 8;
      const rosetteSegs: string[] = [];
      for (let p = 0; p < petalCount; p++) {
        const a = (p / petalCount) * Math.PI * 2;
        const aLeft = a - 0.28;
        const aRight = a + 0.28;
        const tipX = cx + Math.cos(a) * petalR;
        const tipY = cy + Math.sin(a) * petalR;
        const c1x = cx + Math.cos(aLeft) * petalR * 0.62;
        const c1y = cy + Math.sin(aLeft) * petalR * 0.62;
        const c2x = cx + Math.cos(aRight) * petalR * 0.62;
        const c2y = cy + Math.sin(aRight) * petalR * 0.62;
        rosetteSegs.push(
          `M ${fmt(cx)} ${fmt(cy)} Q ${fmt(c1x)} ${fmt(c1y)} ${fmt(tipX)} ${fmt(tipY)} Q ${fmt(c2x)} ${fmt(c2y)} ${fmt(cx)} ${fmt(cy)} Z`,
        );
      }
      parts.push(
        `<path d="${rosetteSegs.join(' ')}" fill="${secondary}" fill-opacity="${fmt(alphaSoft * 0.85)}" stroke="${accent}" stroke-opacity="${fmt(alphaLine * 0.9)}" stroke-width="${fmt(strokeW * 0.72)}" />`,
      );
      parts.push(
        `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(petalR * 0.2)}" fill="${highlight}" fill-opacity="${fmt(alphaLine)}" />`,
      );

      // Paired leaves at top & side trellis vertices
      const leafL = cellW * 0.16;
      const topY = cy - hh;
      const leavesD =
        `M ${fmt(cx)} ${fmt(topY)} Q ${fmt(cx + leafL * 0.7)} ${fmt(topY - leafL * 0.55)} ${fmt(cx + leafL)} ${fmt(topY)} Q ${fmt(cx + leafL * 0.7)} ${fmt(topY + leafL * 0.55)} ${fmt(cx)} ${fmt(topY)} Z ` +
        `M ${fmt(cx)} ${fmt(topY)} Q ${fmt(cx - leafL * 0.7)} ${fmt(topY - leafL * 0.55)} ${fmt(cx - leafL)} ${fmt(topY)} Q ${fmt(cx - leafL * 0.7)} ${fmt(topY + leafL * 0.55)} ${fmt(cx)} ${fmt(topY)} Z`;
      parts.push(
        `<path d="${leavesD}" fill="${accent}" fill-opacity="${fmt(alphaMain * 0.85)}" />`,
      );
    }
  }

  return { defs: '', body: parts.join('') };
}

/** 9. Retro Horizon Grid — synthwave perspective grid, striped sun/moon disc & duotone sky gradient. */
function renderRetroHorizonGrid(ctx: PatternContext): { defs: string; body: string } {
  const { w, h, base, accent, secondary, deep, highlight, alphaMain, alphaSoft, alphaLine, rng, uid } = ctx;
  const horizonY = h * (0.56 + (rng() - 0.5) * 0.08);
  const sunCx = w * (0.5 + (rng() - 0.5) * 0.08);
  const sunR = Math.min(w * 0.34, horizonY * 0.62);
  const sunCy = horizonY - sunR * 0.34;
  const strokeW = roundTo(Math.max(0.24, Math.min(w, h) / 360), 2);

  const defs: string[] = [
    `<linearGradient id="${uid}-sky" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${deep}" stop-opacity="${fmt(alphaMain * 0.65)}" />` +
      `<stop offset="72%" stop-color="${secondary}" stop-opacity="${fmt(alphaSoft * 0.55)}" />` +
      `<stop offset="100%" stop-color="${accent}" stop-opacity="${fmt(alphaMain * 0.58)}" />` +
      `</linearGradient>`,
    `<linearGradient id="${uid}-sun" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${highlight}" stop-opacity="${fmt(alphaLine)}" />` +
      `<stop offset="65%" stop-color="${accent}" stop-opacity="${fmt(alphaMain * 0.95)}" />` +
      `<stop offset="100%" stop-color="${secondary}" stop-opacity="${fmt(alphaSoft * 0.85)}" />` +
      `</linearGradient>`,
    `<clipPath id="${uid}-sun-clip"><rect x="0" y="0" width="${fmt(w)}" height="${fmt(horizonY)}" /></clipPath>`,
  ];

  const body: string[] = [];

  // Sky wash above horizon
  body.push(`<rect x="0" y="0" width="${fmt(w)}" height="${fmt(horizonY)}" fill="url(#${uid}-sky)" />`);

  // Subtle retro upper-sky star dots
  const skyStars = 28;
  for (let i = 0; i < skyStars; i++) {
    const sx = rng() * w;
    const sy = rng() * (horizonY * 0.82);
    const sr = Math.max(0.2, Math.min(w, h) * (0.0018 + rng() * 0.0028));
    body.push(
      `<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(sr)}" fill="${highlight}" fill-opacity="${fmt(alphaMain * 0.85)}" />`,
    );
  }

  // Striped retro sun disc clipped cleanly at the horizon
  const sunGroup: string[] = [
    `<circle cx="${fmt(sunCx)}" cy="${fmt(sunCy)}" r="${fmt(sunR)}" fill="url(#${uid}-sun)" />`,
  ];
  const stripeCount = 6;
  for (let i = 0; i < stripeCount; i++) {
    const t = i / stripeCount;
    const bandY = sunCy + sunR * (0.08 + t * 0.72);
    const bandH = sunR * (0.025 + t * 0.055);
    sunGroup.push(
      `<rect x="${fmt(sunCx - sunR - 1)}" y="${fmt(bandY)}" width="${fmt(sunR * 2 + 2)}" height="${fmt(bandH)}" fill="${base}" />`,
    );
  }
  body.push(`<g clip-path="url(#${uid}-sun-clip)">${sunGroup.join('')}</g>`);

  // Ground plane wash below horizon
  body.push(
    `<rect x="0" y="${fmt(horizonY)}" width="${fmt(w)}" height="${fmt(h - horizonY)}" fill="${deep}" fill-opacity="${fmt(alphaSoft * 0.72)}" />`,
  );

  // Horizon laser line
  body.push(
    `<line x1="0" y1="${fmt(horizonY)}" x2="${fmt(w)}" y2="${fmt(horizonY)}" stroke="${highlight}" stroke-opacity="${fmt(alphaLine)}" stroke-width="${fmt(strokeW * 1.9)}" />`,
  );

  // Perspective converging grid rays from vanishing point on horizon
  const rayCount = 14;
  for (let i = -rayCount; i <= rayCount; i++) {
    const spread = (i / rayCount) * w * 2.1;
    const bottomX = sunCx + spread;
    body.push(
      `<line x1="${fmt(sunCx)}" y1="${fmt(horizonY)}" x2="${fmt(bottomX)}" y2="${fmt(h)}" stroke="${accent}" stroke-opacity="${fmt(alphaMain * 0.85)}" stroke-width="${fmt(strokeW)}" />`,
    );
  }

  // Exponentially spaced perspective depth lines
  const depthLines = 11;
  for (let i = 1; i <= depthLines; i++) {
    const t = (i / depthLines) ** 2.15;
    const y = horizonY + t * (h - horizonY);
    const op = alphaSoft + t * (alphaLine - alphaSoft);
    body.push(
      `<line x1="0" y1="${fmt(y)}" x2="${fmt(w)}" y2="${fmt(y)}" stroke="${accent}" stroke-opacity="${fmt(op)}" stroke-width="${fmt(strokeW * (0.75 + t * 0.7))}" />`,
    );
  }

  return { defs: defs.join(''), body: body.join('') };
}

type PatternRenderer = (ctx: PatternContext) => { readonly defs: string; readonly body: string };

const PATTERN_RENDERERS: Readonly<Record<ProceduralArtworkId, PatternRenderer>> = {
  'suminagashi-marble': renderSuminagashiMarble,
  'cosmic-nebula': renderCosmicNebula,
  'art-deco-fans': renderArtDecoFans,
  'seigaiha-waves': renderSeigaihaWaves,
  'kumiko-lattice': renderKumikoLattice,
  'bauhaus-poster': renderBauhausPoster,
  'topographic-contours': renderTopographicContours,
  'botanical-medallion-tile': renderBotanicalMedallionTile,
  'retro-horizon-grid': renderRetroHorizonGrid,
};

/** Computes natural pixel dimensions at 300 DPI for a millimeter surface. */
export function computeProceduralNaturalSize(
  widthMm: number,
  heightMm: number,
  dpi = PRINT_DPI,
): { readonly naturalWidth: number; readonly naturalHeight: number } {
  const safeW = Math.max(12, Number.isFinite(widthMm) ? widthMm : 140);
  const safeH = Math.max(12, Number.isFinite(heightMm) ? heightMm : 210);
  return {
    naturalWidth: Math.max(150, Math.round((safeW / 25.4) * dpi)),
    naturalHeight: Math.max(150, Math.round((safeH / 25.4) * dpi)),
  };
}

/**
 * Generates a deterministic, self-contained vector SVG string for one of the 9 built-in
 * procedural bookbinding patterns, sized cleanly to `widthMm × heightMm`.
 */
export function generateProceduralArtworkSvg(options: ProceduralArtworkOptions): string {
  const ctx = buildPatternContext(options);
  const { naturalWidth, naturalHeight } = computeProceduralNaturalSize(ctx.w, ctx.h);
  const renderer = PATTERN_RENDERERS[options.patternId];
  const { defs, body } = renderer(ctx);
  const clipId = `${ctx.uid}-frame`;
  const allDefs = `<clipPath id="${clipId}"><rect x="0" y="0" width="${fmt(ctx.w)}" height="${fmt(ctx.h)}" /></clipPath>${defs}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${naturalWidth}" height="${naturalHeight}" viewBox="0 0 ${fmt(ctx.w)} ${fmt(ctx.h)}" preserveAspectRatio="xMidYMid slice">` +
    `<defs>${allDefs}</defs>` +
    `<g clip-path="url(#${clipId})">` +
    `<rect x="0" y="0" width="${fmt(ctx.w)}" height="${fmt(ctx.h)}" fill="${ctx.base}" />` +
    `${body}` +
    `</g>` +
    `</svg>`
  );
}

/** Encodes a generated procedural SVG string as an inline UTF-8 `data:image/svg+xml` URL. */
export function toProceduralArtworkDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Generates a complete procedural artwork asset ready for CoverImageLayer creation & 300 DPI Preflight. */
export function createProceduralArtworkAsset(
  options: ProceduralArtworkOptions,
): ProceduralArtworkAsset {
  const svg = generateProceduralArtworkSvg(options);
  const { naturalWidth, naturalHeight } = computeProceduralNaturalSize(
    options.widthMm,
    options.heightMm,
  );
  return {
    svg,
    dataUrl: toProceduralArtworkDataUrl(svg),
    naturalWidth,
    naturalHeight,
    fileName: buildProceduralArtworkFileName(options.patternId),
  };
}
