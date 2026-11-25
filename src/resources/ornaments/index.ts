import { parseSvgStampText, type ParsedSvgStamp } from '@/studio/svgStampParser';
import type {
  ClassicOrnamentCategory,
  ClassicOrnamentId,
  CoverElementZone,
  OrnamentStyleTag,
} from '@/types/coverElements';
import celestialStarsSvg from './divider-celestial-stars.svg?raw';
import decoFanDividerSvg from './divider-deco-fan.svg?raw';
import diamondRuleSvg from './divider-diamond-rule.svg?raw';
import fleuronLeafSvg from './divider-fleuron-leaf.svg?raw';
import geometricDotsDividerSvg from './divider-geometric-dots.svg?raw';
import swordRuleDividerSvg from './divider-sword-rule.svg?raw';
import vineFlourishDividerSvg from './divider-vine-flourish.svg?raw';
import bauhausArchesSvg from './emblem-bauhaus-arches.svg?raw';
import botanicalSprigSvg from './emblem-botanical-sprig.svg?raw';
import coiledSerpentSvg from './emblem-coiled-serpent.svg?raw';
import compassRoseSvg from './emblem-compass-rose.svg?raw';
import crescentStarsSvg from './emblem-crescent-stars.svg?raw';
import daggerVinesSvg from './emblem-dagger-vines.svg?raw';
import decoSunburstSvg from './emblem-deco-sunburst.svg?raw';
import filigreeCrownSvg from './emblem-filigree-crown.svg?raw';
import lunarMothSvg from './emblem-lunar-moth.svg?raw';
import oliveWreathSvg from './emblem-olive-wreath.svg?raw';
import orbitalRingsSvg from './emblem-orbital-rings.svg?raw';
import roseBloomSvg from './emblem-rose-bloom.svg?raw';
import tarotSunSvg from './emblem-tarot-sun.svg?raw';

export interface ClassicOrnamentSpec {
  readonly id: ClassicOrnamentId;
  readonly label: string;
  readonly category: ClassicOrnamentCategory;
  readonly styleTag: OrnamentStyleTag;
  readonly defaultZone: CoverElementZone;
  readonly description: string;
}

export interface OrnamentStyleFilterSpec {
  readonly id: 'all' | OrnamentStyleTag;
  readonly label: string;
}

export const ORNAMENT_STYLE_FILTERS: readonly OrnamentStyleFilterSpec[] = [
  { id: 'all', label: 'All Styles' },
  { id: 'classic', label: 'Classic' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'art-deco', label: 'Art Deco' },
  { id: 'botanical', label: 'Botanical' },
  { id: 'scifi-modern', label: 'Sci-Fi & Modern' },
] as const;

export type StaticOrnamentId =
  | 'divider-diamond-rule'
  | 'divider-fleuron-leaf'
  | 'divider-celestial-stars'
  | 'divider-sword-rule'
  | 'divider-deco-fan'
  | 'divider-vine-flourish'
  | 'divider-geometric-dots'
  | 'emblem-compass-rose'
  | 'emblem-botanical-sprig'
  | 'emblem-crescent-stars'
  | 'emblem-dagger-vines'
  | 'emblem-coiled-serpent'
  | 'emblem-filigree-crown'
  | 'emblem-tarot-sun'
  | 'emblem-deco-sunburst'
  | 'emblem-lunar-moth'
  | 'emblem-olive-wreath'
  | 'emblem-rose-bloom'
  | 'emblem-orbital-rings'
  | 'emblem-bauhaus-arches';

export const CLASSIC_ORNAMENTS: readonly ClassicOrnamentSpec[] = [
  // Frames (7)
  {
    id: 'frame-single-rule',
    label: 'Single Hairline Frame',
    category: 'frames',
    styleTag: 'classic',
    defaultZone: 'front',
    description: 'Clean minimalist single-rule border',
  },
  {
    id: 'frame-double-rule',
    label: 'Classic Double Rule',
    category: 'frames',
    styleTag: 'classic',
    defaultZone: 'front',
    description: 'Timeless outer + inner blind-tooled frame',
  },
  {
    id: 'frame-art-deco',
    label: 'Art Deco Stepped',
    category: 'frames',
    styleTag: 'art-deco',
    defaultZone: 'front',
    description: '1920s stepped geometric corner frame',
  },
  {
    id: 'frame-notched-corner',
    label: 'Notched Corner Frame',
    category: 'frames',
    styleTag: 'classic',
    defaultZone: 'front',
    description: 'Inward-notched classic clothbound frame',
  },
  {
    id: 'frame-gothic-arch',
    label: 'Gothic Lancet Arch',
    category: 'frames',
    styleTag: 'fantasy',
    defaultZone: 'front',
    description: 'Pointed cathedral arch frame with twin vertical shafts & diamond finials',
  },
  {
    id: 'frame-deco-archway',
    label: 'Deco Stepped Archway',
    category: 'frames',
    styleTag: 'art-deco',
    defaultZone: 'front',
    description: 'Stepped Chrysler-style Art Deco archway frame with sunburst fan accents',
  },
  {
    id: 'frame-modern-editorial',
    label: 'Modern Editorial Grid',
    category: 'frames',
    styleTag: 'scifi-modern',
    defaultZone: 'front',
    description: 'Asymmetric Swiss/Bauhaus thick-top + hairline-bottom architectural frame',
  },

  // Corners (4)
  {
    id: 'corners-classic-scroll',
    label: '4-Corner Flourishes',
    category: 'corners',
    styleTag: 'classic',
    defaultZone: 'front',
    description: 'Mirrored vintage corner brackets & diamonds',
  },
  {
    id: 'corners-deco-chevron',
    label: 'Art Deco Corners',
    category: 'corners',
    styleTag: 'art-deco',
    defaultZone: 'front',
    description: '4 nested geometric chevron corners',
  },
  {
    id: 'corners-deco-fan',
    label: 'Deco Sunburst Fans',
    category: 'corners',
    styleTag: 'art-deco',
    defaultZone: 'front',
    description: '4 mirrored quarter-circle Gatsby sunburst fan corners',
  },
  {
    id: 'corners-botanical-vine',
    label: 'Botanical Vine Corners',
    category: 'corners',
    styleTag: 'botanical',
    defaultZone: 'front',
    description: '4 mirrored curling leaf-and-berry botanical corner sprigs',
  },

  // Dividers (7)
  {
    id: 'divider-diamond-rule',
    label: 'Diamond Title Rule',
    category: 'dividers',
    styleTag: 'classic',
    defaultZone: 'front',
    description: 'Tapered rule with central diamond lozenge',
  },
  {
    id: 'divider-fleuron-leaf',
    label: 'Aldus Fleuron',
    category: 'dividers',
    styleTag: 'classic',
    defaultZone: 'front',
    description: 'Classic bookbindery leaf fleuron divider',
  },
  {
    id: 'divider-celestial-stars',
    label: 'Celestial Trio',
    category: 'dividers',
    styleTag: 'fantasy',
    defaultZone: 'front',
    description: 'Four-point star & flanking spark stars',
  },
  {
    id: 'divider-sword-rule',
    label: 'Fantasy Sword Rule',
    category: 'dividers',
    styleTag: 'fantasy',
    defaultZone: 'front',
    description: 'Crisp horizontal miniature fantasy sword divider',
  },
  {
    id: 'divider-deco-fan',
    label: 'Art Deco Wing Divider',
    category: 'dividers',
    styleTag: 'art-deco',
    defaultZone: 'front',
    description: 'Winged geometric diamond and stepped fan title divider',
  },
  {
    id: 'divider-vine-flourish',
    label: 'Botanical Vine Flourish',
    category: 'dividers',
    styleTag: 'botanical',
    defaultZone: 'front',
    description: 'Sinuous double-curl botanical vine divider with leaves & berries',
  },
  {
    id: 'divider-geometric-dots',
    label: 'Geometric Dot Axis',
    category: 'dividers',
    styleTag: 'scifi-modern',
    defaultZone: 'front',
    description: 'Tapered modernist bar with graduated dot constellation',
  },

  // Emblems (13)
  {
    id: 'emblem-compass-rose',
    label: 'Compass Rose',
    category: 'emblems',
    styleTag: 'classic',
    defaultZone: 'front',
    description: '8-point adventure & classic travel star',
  },
  {
    id: 'emblem-botanical-sprig',
    label: 'Botanical Laurel',
    category: 'emblems',
    styleTag: 'botanical',
    defaultZone: 'front',
    description: 'Symmetrical botanical leaf medallion',
  },
  {
    id: 'emblem-crescent-stars',
    label: 'Crescent & Starburst',
    category: 'emblems',
    styleTag: 'fantasy',
    defaultZone: 'front',
    description: 'Waxing crescent moon cradling an 8-point starburst & constellation stars',
  },
  {
    id: 'emblem-dagger-vines',
    label: 'Thorny Dagger',
    category: 'emblems',
    styleTag: 'fantasy',
    defaultZone: 'front',
    description: 'Ornate fantasy dagger entwined with curling thorny vines & leaves',
  },
  {
    id: 'emblem-coiled-serpent',
    label: 'Ouroboros Serpent',
    category: 'emblems',
    styleTag: 'fantasy',
    defaultZone: 'front',
    description: 'Symmetrical coiled serpent medallion enclosing an arcane star',
  },
  {
    id: 'emblem-filigree-crown',
    label: 'Filigree Crown',
    category: 'emblems',
    styleTag: 'fantasy',
    defaultZone: 'front',
    description: 'Regal pointed gothic filigree crown with star spire & jeweled band',
  },
  {
    id: 'emblem-tarot-sun',
    label: 'Tarot Sunburst',
    category: 'emblems',
    styleTag: 'fantasy',
    defaultZone: 'front',
    description: 'Alternating straight & flame tarot sun rays with central star eye',
  },
  {
    id: 'emblem-deco-sunburst',
    label: 'Deco Sunburst Medallion',
    category: 'emblems',
    styleTag: 'art-deco',
    defaultZone: 'front',
    description: 'Radiating Gatsby fan medallion atop a stepped chevron pedestal',
  },
  {
    id: 'emblem-lunar-moth',
    label: 'Luna Moth',
    category: 'emblems',
    styleTag: 'botanical',
    defaultZone: 'front',
    description: 'Symmetrical luna moth with crescent wing eyespots & moon crown',
  },
  {
    id: 'emblem-olive-wreath',
    label: 'Laurel Wreath Ring',
    category: 'emblems',
    styleTag: 'botanical',
    defaultZone: 'front',
    description: 'Circular botanical laurel wreath ideal for framing crests & monograms',
  },
  {
    id: 'emblem-rose-bloom',
    label: 'Woodcut Rose',
    category: 'emblems',
    styleTag: 'botanical',
    defaultZone: 'front',
    description: 'Layered heraldic blooming rose with slender stem & twin leaves',
  },
  {
    id: 'emblem-orbital-rings',
    label: 'Orbital Rings',
    category: 'emblems',
    styleTag: 'scifi-modern',
    defaultZone: 'front',
    description: 'Tilted planetary rings, shaded sphere, orbiting moons & crosshair axes',
  },
  {
    id: 'emblem-bauhaus-arches',
    label: 'Bauhaus Arches',
    category: 'emblems',
    styleTag: 'scifi-modern',
    defaultZone: 'front',
    description: 'Interlocking geometric portal arches, sphere & half-moon emblem',
  },

  // Spine Ornaments (9)
  {
    id: 'spine-classic-bands',
    label: '5-Band Spine Rules',
    category: 'spine',
    styleTag: 'classic',
    defaultZone: 'spine',
    description: 'Classic raised-band foil bars across spine',
  },
  {
    id: 'spine-title-cartouche',
    label: 'Spine Title Cartouche',
    category: 'spine',
    styleTag: 'classic',
    defaultZone: 'spine',
    description: 'Gilded double-rule box around upper spine title',
  },
  {
    id: 'spine-head-tail-bands',
    label: 'Head & Tail Spine Bands',
    category: 'spine',
    styleTag: 'classic',
    defaultZone: 'spine',
    description: 'Decorative top/bottom bands leaving center clear for title',
  },
  {
    id: 'spine-botanical-vine',
    label: 'Spine Botanical Vine',
    category: 'spine',
    styleTag: 'botanical',
    defaultZone: 'spine',
    description: 'Vertical clothbound vine with paired leaves along spine',
  },
  {
    id: 'spine-celestial-column',
    label: 'Spine Celestial Column',
    category: 'spine',
    styleTag: 'fantasy',
    defaultZone: 'spine',
    description: 'Vertical column of stars & diamond accents down spine',
  },
  {
    id: 'spine-diamond-lattice',
    label: 'Art Deco Spine Lattice',
    category: 'spine',
    styleTag: 'art-deco',
    defaultZone: 'spine',
    description: 'Stacked geometric diamond filigree panel along spine',
  },
  {
    id: 'spine-moon-phases',
    label: 'Spine Moon Phases',
    category: 'spine',
    styleTag: 'fantasy',
    defaultZone: 'spine',
    description: 'Vertical lunar cycle column from waxing crescent to waning moon',
  },
  {
    id: 'spine-deco-sunburst',
    label: 'Deco Sunburst Spine',
    category: 'spine',
    styleTag: 'art-deco',
    defaultZone: 'spine',
    description: 'Tall stepped Art Deco chevron & sunburst pinnacle spine ornament',
  },
  {
    id: 'spine-orbital-axis',
    label: 'Spine Orbital Axis',
    category: 'spine',
    styleTag: 'scifi-modern',
    defaultZone: 'spine',
    description: 'Vertical technical sci-fi axis with ringed planetary nodes & ticks',
  },
] as const;

const STATIC_ORNAMENT_SVG_RAW: Readonly<Record<StaticOrnamentId, string>> = {
  'divider-celestial-stars': celestialStarsSvg,
  'divider-deco-fan': decoFanDividerSvg,
  'divider-diamond-rule': diamondRuleSvg,
  'divider-fleuron-leaf': fleuronLeafSvg,
  'divider-geometric-dots': geometricDotsDividerSvg,
  'divider-sword-rule': swordRuleDividerSvg,
  'divider-vine-flourish': vineFlourishDividerSvg,
  'emblem-bauhaus-arches': bauhausArchesSvg,
  'emblem-botanical-sprig': botanicalSprigSvg,
  'emblem-coiled-serpent': coiledSerpentSvg,
  'emblem-compass-rose': compassRoseSvg,
  'emblem-crescent-stars': crescentStarsSvg,
  'emblem-dagger-vines': daggerVinesSvg,
  'emblem-deco-sunburst': decoSunburstSvg,
  'emblem-filigree-crown': filigreeCrownSvg,
  'emblem-lunar-moth': lunarMothSvg,
  'emblem-olive-wreath': oliveWreathSvg,
  'emblem-orbital-rings': orbitalRingsSvg,
  'emblem-rose-bloom': roseBloomSvg,
  'emblem-tarot-sun': tarotSunSvg,
};

const parsedStampCache = new Map<StaticOrnamentId, ParsedSvgStamp | null>();

export function isStaticOrnamentId(id: ClassicOrnamentId): id is StaticOrnamentId {
  return id in STATIC_ORNAMENT_SVG_RAW;
}

/** Lazily parses and caches one of the bundled static `.svg` ornament assets. */
export function getStaticOrnamentStamp(id: StaticOrnamentId): ParsedSvgStamp | null {
  if (parsedStampCache.has(id)) {
    return parsedStampCache.get(id) ?? null;
  }
  const parsed = parseSvgStampText(STATIC_ORNAMENT_SVG_RAW[id]);
  parsedStampCache.set(id, parsed);
  return parsed;
}
