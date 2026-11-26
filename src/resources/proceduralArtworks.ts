export const PROCEDURAL_ARTWORK_IDS = [
  'suminagashi-marble',
  'cosmic-nebula',
  'art-deco-fans',
  'seigaiha-waves',
  'kumiko-lattice',
  'bauhaus-poster',
  'topographic-contours',
  'botanical-medallion-tile',
  'retro-horizon-grid',
] as const;

export type ProceduralArtworkId = (typeof PROCEDURAL_ARTWORK_IDS)[number];

export type ProceduralArtworkIntensity = 'subtle' | 'vivid';

export type ProceduralArtworkTarget = 'fullWrap' | 'front' | 'back' | 'spine';

export interface ProceduralArtworkSpec {
  readonly id: ProceduralArtworkId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly defaultIntensity: ProceduralArtworkIntensity;
  readonly recommendedForEndpapers: boolean;
}

const PROCEDURAL_ARTWORK_REGISTRY: Readonly<Record<ProceduralArtworkId, ProceduralArtworkSpec>> = {
  'suminagashi-marble': {
    id: 'suminagashi-marble',
    label: 'Suminagashi Marble',
    shortLabel: 'Suminagashi',
    description: 'Japanese marbled concentric ink waves with organic harmonic drift',
    defaultIntensity: 'subtle',
    recommendedForEndpapers: true,
  },
  'cosmic-nebula': {
    id: 'cosmic-nebula',
    label: 'Cosmic Nebula',
    shortLabel: 'Nebula',
    description: 'Layered radial cosmic washes, multi-size starfield & constellation lines',
    defaultIntensity: 'subtle',
    recommendedForEndpapers: true,
  },
  'art-deco-fans': {
    id: 'art-deco-fans',
    label: 'Art Deco Fans',
    shortLabel: 'Deco Fans',
    description: 'Seamless 1920s gilded scalloped fan lattice with fine metallic hairlines',
    defaultIntensity: 'subtle',
    recommendedForEndpapers: true,
  },
  'seigaiha-waves': {
    id: 'seigaiha-waves',
    label: 'Seigaiha Waves',
    shortLabel: 'Seigaiha',
    description: 'Classic Japanese overlapping concentric wave arcs',
    defaultIntensity: 'subtle',
    recommendedForEndpapers: true,
  },
  'kumiko-lattice': {
    id: 'kumiko-lattice',
    label: 'Kumiko Star Lattice',
    shortLabel: 'Kumiko',
    description: 'Crisp Japanese Asanoha geometric star-grid',
    defaultIntensity: 'subtle',
    recommendedForEndpapers: true,
  },
  'bauhaus-poster': {
    id: 'bauhaus-poster',
    label: 'Bauhaus Modern',
    shortLabel: 'Bauhaus',
    description: 'Bold Mid-Century quarter-circles, arches, blocks & diagonal accents',
    defaultIntensity: 'vivid',
    recommendedForEndpapers: false,
  },
  'topographic-contours': {
    id: 'topographic-contours',
    label: 'Topographic Contours',
    shortLabel: 'Topographic',
    description: 'Flowing duotone elevation contour curves from seeded harmonic fields',
    defaultIntensity: 'subtle',
    recommendedForEndpapers: true,
  },
  'botanical-medallion-tile': {
    id: 'botanical-medallion-tile',
    label: 'Clothbound Botanical',
    shortLabel: 'Botanical',
    description: 'Clothbound diamond trellis with repeating leaves & floral rosettes',
    defaultIntensity: 'subtle',
    recommendedForEndpapers: true,
  },
  'retro-horizon-grid': {
    id: 'retro-horizon-grid',
    label: 'Retro Horizon Grid',
    shortLabel: 'Horizon',
    description: 'Synthwave perspective grid, striped sun disc & duotone sky gradient',
    defaultIntensity: 'vivid',
    recommendedForEndpapers: false,
  },
} as const;

export const PROCEDURAL_ARTWORKS: readonly ProceduralArtworkSpec[] = PROCEDURAL_ARTWORK_IDS.map(
  (id) => PROCEDURAL_ARTWORK_REGISTRY[id],
);

export const PROCEDURAL_ARTWORK_TARGETS: readonly {
  readonly id: ProceduralArtworkTarget;
  readonly label: string;
}[] = [
  { id: 'fullWrap', label: 'Full Cover' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'spine', label: 'Spine' },
] as const;

export function getProceduralArtworkSpec(id: ProceduralArtworkId): ProceduralArtworkSpec {
  return PROCEDURAL_ARTWORK_REGISTRY[id];
}
