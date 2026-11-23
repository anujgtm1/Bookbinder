import { parseSvgStampText, type ParsedSvgStamp } from '@/studio/svgStampParser';
import type {
  ClassicOrnamentCategory,
  ClassicOrnamentId,
  CoverElementZone,
} from '@/types/coverElements';
import celestialStarsSvg from './divider-celestial-stars.svg?raw';
import diamondRuleSvg from './divider-diamond-rule.svg?raw';
import fleuronLeafSvg from './divider-fleuron-leaf.svg?raw';
import botanicalSprigSvg from './emblem-botanical-sprig.svg?raw';
import compassRoseSvg from './emblem-compass-rose.svg?raw';

export interface ClassicOrnamentSpec {
  readonly id: ClassicOrnamentId;
  readonly label: string;
  readonly category: ClassicOrnamentCategory;
  readonly defaultZone: CoverElementZone;
  readonly description: string;
}

export type StaticOrnamentId =
  | 'divider-diamond-rule'
  | 'divider-fleuron-leaf'
  | 'divider-celestial-stars'
  | 'emblem-compass-rose'
  | 'emblem-botanical-sprig';

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

const STATIC_ORNAMENT_SVG_RAW: Readonly<Record<StaticOrnamentId, string>> = {
  'divider-celestial-stars': celestialStarsSvg,
  'divider-diamond-rule': diamondRuleSvg,
  'divider-fleuron-leaf': fleuronLeafSvg,
  'emblem-botanical-sprig': botanicalSprigSvg,
  'emblem-compass-rose': compassRoseSvg,
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
