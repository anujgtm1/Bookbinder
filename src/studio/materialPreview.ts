import type { CSSProperties } from 'react';

export type SurfaceMaterialId = 'matte-paper' | 'bookcloth-linen' | 'pebbled-leather';

export type FoilFinishId = 'ink' | 'gold-foil' | 'silver-foil' | 'copper-foil';

export interface SurfaceMaterialSpec {
  readonly id: SurfaceMaterialId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}

export interface FoilGradientStop {
  readonly offset: string;
  readonly color: string;
}

export interface FoilFinishSpec {
  readonly id: FoilFinishId;
  readonly label: string;
  readonly shortLabel: string;
  readonly swatchHex: string;
  readonly gradientStops: readonly FoilGradientStop[];
  readonly textShadow: string;
}

export interface FoilSvgGradientDef {
  readonly finishId: Exclude<FoilFinishId, 'ink'>;
  readonly angleDeg: number;
  readonly x1: string;
  readonly y1: string;
  readonly x2: string;
  readonly y2: string;
  readonly stops: readonly FoilGradientStop[];
}

export const SURFACE_MATERIALS: readonly SurfaceMaterialSpec[] = [
  {
    id: 'matte-paper',
    label: 'Matte Cover Paper',
    shortLabel: 'Matte Paper',
    description: 'Smooth uncoated fine art paper with soft diffuse light roll-off.',
  },
  {
    id: 'bookcloth-linen',
    label: 'Woven Bookcloth Linen',
    shortLabel: 'Bookcloth',
    description: 'Fine warp-and-weft woven cloth grain typical of traditional case bindings.',
  },
  {
    id: 'pebbled-leather',
    label: 'Pebbled Leatherette',
    shortLabel: 'Leather',
    description: 'Subtle organic pebble grain with gentle satin sheen across boards and spine.',
  },
] as const;

export const FOIL_FINISHES: readonly FoilFinishSpec[] = [
  {
    id: 'ink',
    label: 'Printed Ink (Flat)',
    shortLabel: 'Flat Ink',
    swatchHex: '#e6dec8',
    gradientStops: [],
    textShadow: 'none',
  },
  {
    id: 'gold-foil',
    label: 'Hot-Stamped Gold Foil',
    shortLabel: 'Gold Foil',
    swatchHex: '#d8b467',
    gradientStops: [
      { offset: '0%', color: '#9c7426' },
      { offset: '24%', color: '#e4c36e' },
      { offset: '46%', color: '#fff1b8' },
      { offset: '68%', color: '#c89b3c' },
      { offset: '86%', color: '#edd07f' },
      { offset: '100%', color: '#8f671e' },
    ],
    textShadow: '0 1px 2px rgba(34, 22, 4, 0.45), 0 0 6px rgba(247, 217, 134, 0.28)',
  },
  {
    id: 'silver-foil',
    label: 'Hot-Stamped Silver Foil',
    shortLabel: 'Silver Foil',
    swatchHex: '#d1d7de',
    gradientStops: [
      { offset: '0%', color: '#7c8590' },
      { offset: '25%', color: '#cfd6de' },
      { offset: '48%', color: '#ffffff' },
      { offset: '70%', color: '#9aa4b0' },
      { offset: '88%', color: '#e4e9ef' },
      { offset: '100%', color: '#6f7782' },
    ],
    textShadow: '0 1px 2px rgba(15, 22, 32, 0.42), 0 0 6px rgba(235, 242, 250, 0.3)',
  },
  {
    id: 'copper-foil',
    label: 'Hot-Stamped Copper Foil',
    shortLabel: 'Copper Foil',
    swatchHex: '#cf8258',
    gradientStops: [
      { offset: '0%', color: '#7a3d20' },
      { offset: '24%', color: '#cf7d52' },
      { offset: '47%', color: '#f8c5a4' },
      { offset: '69%', color: '#b46239' },
      { offset: '87%', color: '#e39b72' },
      { offset: '100%', color: '#6b3319' },
    ],
    textShadow: '0 1px 2px rgba(38, 16, 6, 0.45), 0 0 6px rgba(242, 165, 120, 0.28)',
  },
] as const;

export function isSurfaceMaterialId(value: unknown): value is SurfaceMaterialId {
  return (
    value === 'matte-paper' || value === 'bookcloth-linen' || value === 'pebbled-leather'
  );
}

export function isFoilFinishId(value: unknown): value is FoilFinishId {
  return (
    value === 'ink' ||
    value === 'gold-foil' ||
    value === 'silver-foil' ||
    value === 'copper-foil'
  );
}

export function getSurfaceMaterialSpec(id: SurfaceMaterialId): SurfaceMaterialSpec {
  return SURFACE_MATERIALS.find((item) => item.id === id) ?? SURFACE_MATERIALS[0];
}

export function getFoilFinishSpec(id: FoilFinishId): FoilFinishSpec {
  return FOIL_FINISHES.find((item) => item.id === id) ?? FOIL_FINISHES[0];
}

/**
 * Returns a pure non-printing CSS overlay style simulating physical bookbinding cover stock
 * (matte paper sheen, woven bookcloth crosshatch, or pebbled leather grain) for 2D/3D previews.
 */
export function getSurfaceOverlayStyle(material: SurfaceMaterialId): CSSProperties {
  // IMPORTANT: Never use `mixBlendMode` or `opacity < 1` here — inside CSS 3D
  // `preserve-3d` faces (`Book3DPreview`), non-normal blend modes / group opacity
  // create isolated compositing layers that break `backface-visibility: hidden`
  // and cause outer cover art to bleed through the opened inside cover.
  if (material === 'bookcloth-linen') {
    return {
      pointerEvents: 'none',
      backgroundImage: [
        'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.075) 0px, rgba(255, 255, 255, 0.075) 1px, transparent 1px, transparent 3px)',
        'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.11) 0px, rgba(0, 0, 0, 0.11) 1px, transparent 1px, transparent 3px)',
        'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.025) 0px, rgba(255, 255, 255, 0.025) 2px, rgba(0, 0, 0, 0.03) 2px, rgba(0, 0, 0, 0.03) 4px)',
      ].join(', '),
      backgroundSize: '3px 3px, 3px 3px, 8px 8px',
      opacity: 1,
    };
  }

  if (material === 'pebbled-leather') {
    return {
      pointerEvents: 'none',
      backgroundImage: [
        'radial-gradient(circle at 25% 30%, rgba(255, 255, 255, 0.12) 0px, rgba(255, 255, 255, 0.035) 1.6px, rgba(0, 0, 0, 0.11) 2.8px, transparent 3.6px)',
        'radial-gradient(circle at 75% 70%, rgba(255, 255, 255, 0.095) 0px, rgba(0, 0, 0, 0.1) 2.2px, transparent 3.4px)',
        'linear-gradient(125deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 42%, rgba(0, 0, 0, 0.14) 100%)',
      ].join(', '),
      backgroundSize: '7px 7px, 11px 11px, 100% 100%',
      backgroundPosition: '0 0, 3px 5px, 0 0',
      opacity: 1,
    };
  }

  // 'matte-paper'
  return {
    pointerEvents: 'none',
    backgroundImage: [
      'linear-gradient(135deg, rgba(255, 255, 255, 0.045) 0%, rgba(255, 255, 255, 0) 48%, rgba(0, 0, 0, 0.04) 100%)',
      'radial-gradient(rgba(0, 0, 0, 0.03) 0.6px, transparent 0.6px)',
    ].join(', '),
    backgroundSize: '100% 100%, 4px 4px',
    opacity: 1,
  };
}

/**
 * Returns diagonal linearGradient coordinates and metallic stops for hot-stamped foil
 * shimmer on 3D book preview lettering & vector ornaments (`null` for flat `'ink'`).
 */
export function getFoilSvgGradientDef(finish: FoilFinishId): FoilSvgGradientDef | null {
  if (finish === 'ink') {
    return null;
  }
  const spec = getFoilFinishSpec(finish);
  return {
    finishId: finish,
    angleDeg: 135,
    x1: '0%',
    y1: '0%',
    x2: '100%',
    y2: '100%',
    stops: spec.gradientStops,
  };
}
