import { BookParametersModel } from '@/types/bookParams';
import {
  DEFAULT_SERIES_PANORAMA,
  DEFAULT_SERIES_SHARED_DESIGN,
  SERIES_SCHEMA_VERSION,
  SeriesProjectModel,
  type SeriesAlignmentAnchor,
  type SeriesBandStyle,
  type SeriesCollectionMode,
  type SeriesOrnamentId,
  type SeriesProject,
  type SeriesVolumeNumberStyle,
} from '@/types/seriesSpines';

export interface SeriesPalettePreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly defaultBgColor: string;
  readonly defaultTextColor: string;
  readonly accentColor: string;
  /** Optional tonal or multi-edition per-book spine colors applied sequentially across the shelf */
  readonly perBookBgColors?: readonly string[];
}

export interface SeriesLabeledOption<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly description: string;
}

export interface SeriesStarterTemplate {
  readonly id: string;
  readonly label: string;
  readonly mode: SeriesCollectionMode;
  readonly description: string;
  readonly build: () => SeriesProject;
}

export const SERIES_PALETTE_PRESETS: readonly SeriesPalettePreset[] = [
  {
    id: 'obsidian-brass',
    label: 'Matching Obsidian & Brass',
    description: 'Deep charcoal bookcloth with antique brass rules and cream lettering',
    defaultBgColor: '#1b222c',
    defaultTextColor: '#f5efe2',
    accentColor: '#d9b566',
  },
  {
    id: 'tonal-forest-gold',
    label: 'Tonal Forest & Gold',
    description: 'Graduated spruce-to-slate bookcloth tones with warm gold foil',
    defaultBgColor: '#1e4238',
    defaultTextColor: '#f5efe2',
    accentColor: '#e0bc6f',
    perBookBgColors: ['#16352d', '#1e463b', '#26564a', '#2b5856', '#214552'],
  },
  {
    id: 'burgundy-cream',
    label: 'Burgundy & Cream',
    description: 'Classic oxblood library cloth with warm cream title stamping',
    defaultBgColor: '#5c1f24',
    defaultTextColor: '#f7f0e2',
    accentColor: '#dfc07c',
  },
  {
    id: 'jewel-editions',
    label: 'Jewel Editions',
    description: 'Coordinated emerald, sapphire, plum, crimson, and amber cloth editions',
    defaultBgColor: '#1f3a52',
    defaultTextColor: '#f6f1e6',
    accentColor: '#e2c074',
    perBookBgColors: ['#1c453b', '#1f3a52', '#4c2647', '#6c2529', '#6e491c'],
  },
  {
    id: 'autumn-linen',
    label: 'Autumn Linen',
    description: 'Earthy russet, ochre, olive, and espresso woven linen palette',
    defaultBgColor: '#4c3224',
    defaultTextColor: '#f6efe2',
    accentColor: '#d9a45b',
    perBookBgColors: ['#3d291f', '#5c3322', '#704424', '#4d5330', '#333b37'],
  },
  {
    id: 'midnight-silver',
    label: 'Midnight & Silver',
    description: 'Nocturnal indigo cloth paired with crisp silver foil rules',
    defaultBgColor: '#172033',
    defaultTextColor: '#eef2f7',
    accentColor: '#c5cdd8',
  },
] as const;

export const SERIES_BAND_OPTIONS: readonly SeriesLabeledOption<SeriesBandStyle>[] = [
  {
    id: 'none',
    label: 'None',
    description: 'Clean unadorned spines without horizontal bands',
  },
  {
    id: 'classic-rules',
    label: 'Classic Rules',
    description: 'Single gilded head and tail rules aligned across every volume',
  },
  {
    id: 'double-bands',
    label: 'Double Bands',
    description: 'Paired raised-band rules at head and tail for archival sets',
  },
  {
    id: 'head-tail-caps',
    label: 'Head & Tail Caps',
    description: 'Bold decorative cap bars flanking the spine title column',
  },
  {
    id: 'framed-label',
    label: 'Framed Label',
    description: 'Gilded head/tail rules plus a classic cartouche box around the badge',
  },
] as const;

export const SERIES_VOLUME_STYLE_OPTIONS: readonly SeriesLabeledOption<SeriesVolumeNumberStyle>[] = [
  {
    id: 'roman',
    label: 'Roman (I, II, III)',
    description: 'Traditional Roman numerals stamped at a shared baseline',
  },
  {
    id: 'arabic',
    label: 'Numbers (1, 2, 3)',
    description: 'Clean numeric volume markers',
  },
  {
    id: 'vol-arabic',
    label: 'Vol. 1, Vol. 2',
    description: 'Editorial volume prefix numbering',
  },
  {
    id: 'book-arabic',
    label: 'Book 1, Book 2',
    description: 'Narrative series book numbering',
  },
  {
    id: 'custom',
    label: 'Custom Labels',
    description: 'Use each volume’s custom label text (e.g. Prologue, Act I)',
  },
  {
    id: 'none',
    label: 'None',
    description: 'Hide volume badges (ideal for mixed personal collections)',
  },
] as const;

export const SERIES_ALIGNMENT_ANCHOR_OPTIONS: readonly SeriesLabeledOption<SeriesAlignmentAnchor>[] =
  [
    {
      id: 'shelf-bottom',
      label: 'Shelf Bottom',
      description: 'Align badges, bands, and authors from the wooden shelf surface upward',
    },
    {
      id: 'book-top',
      label: 'Book Top',
      description: 'Measure offsets downward from each book’s own head cap',
    },
    {
      id: 'spine-center',
      label: 'Spine Center',
      description: 'Center elements relative to the shared shelf vertical midpoint',
    },
  ] as const;

export const SERIES_ORNAMENT_OPTIONS: readonly SeriesLabeledOption<SeriesOrnamentId>[] = [
  {
    id: 'none',
    label: 'None',
    description: 'No shared spine emblem',
  },
  {
    id: 'divider-celestial-stars',
    label: 'Celestial Trio',
    description: 'Four-point star flanked by tiny spark accents',
  },
  {
    id: 'divider-diamond-rule',
    label: 'Diamond Lozenge',
    description: 'Tapered foil diamond accent',
  },
  {
    id: 'divider-fleuron-leaf',
    label: 'Aldus Fleuron',
    description: 'Classic bookbindery leaf fleuron',
  },
  {
    id: 'emblem-compass-rose',
    label: 'Compass Rose',
    description: 'Eight-point adventure compass star',
  },
  {
    id: 'emblem-botanical-sprig',
    label: 'Botanical Laurel',
    description: 'Symmetrical botanical medallion',
  },
  {
    id: 'spine-moon-phases',
    label: 'Spine Moon Phases',
    description: 'Vertical lunar cycle column from waxing crescent to waning moon',
  },
  {
    id: 'spine-deco-sunburst',
    label: 'Deco Sunburst Spine',
    description: 'Stepped Art Deco chevron and sunburst pinnacle spine column',
  },
  {
    id: 'spine-orbital-axis',
    label: 'Spine Orbital Axis',
    description: 'Technical sci-fi axis with ringed planetary nodes and ticks',
  },
  {
    id: 'emblem-crescent-stars',
    label: 'Crescent & Starburst',
    description: 'Waxing crescent moon cradling an 8-point starburst',
  },
  {
    id: 'emblem-filigree-crown',
    label: 'Filigree Crown',
    description: 'Pointed gothic filigree crown with star spire',
  },
  {
    id: 'emblem-deco-sunburst',
    label: 'Deco Sunburst Medallion',
    description: 'Radiating Gatsby fan medallion atop a stepped chevron pedestal',
  },
  {
    id: 'emblem-lunar-moth',
    label: 'Luna Moth',
    description: 'Symmetrical luna moth with crescent wing eyespots',
  },
  {
    id: 'emblem-orbital-rings',
    label: 'Orbital Rings',
    description: 'Tilted planetary rings, shaded sphere, and crosshair axes',
  },
  {
    id: 'emblem-rose-bloom',
    label: 'Woodcut Rose',
    description: 'Layered heraldic blooming rose with slender stem and leaves',
  },
] as const;

export const SERIES_STARTER_TEMPLATES: readonly SeriesStarterTemplate[] = [
  {
    id: 'fantasy-trilogy',
    label: 'Fantasy Trilogy (3 Volumes)',
    mode: 'series',
    description: '3 rigid-case volumes (24 / 34 / 44 mm) with Roman numerals and Obsidian & Brass cloth',
    build: (): SeriesProject => {
      const base = BookParametersModel.createDefault();
      return {
        schemaVersion: SERIES_SCHEMA_VERSION,
        id: SeriesProjectModel.createSeriesId(),
        name: 'The Obsidian Chronicles',
        mode: 'series',
        updatedAt: new Date().toISOString(),
        books: [
          SeriesProjectModel.createBookEntry({
            title: 'The Shadow Archive',
            author: 'E. V. Hawthorne',
            parameters: { ...base, pbHeightMm: 216, pbWidthMm: 140, pbThicknessMm: 24 },
          }),
          SeriesProjectModel.createBookEntry({
            title: 'The Gilded Labyrinth',
            author: 'E. V. Hawthorne',
            parameters: { ...base, pbHeightMm: 216, pbWidthMm: 140, pbThicknessMm: 34 },
          }),
          SeriesProjectModel.createBookEntry({
            title: 'The Crown of Ash',
            author: 'E. V. Hawthorne',
            parameters: { ...base, pbHeightMm: 216, pbWidthMm: 140, pbThicknessMm: 44 },
          }),
        ],
        sequences: [],
        shared: {
          ...DEFAULT_SERIES_SHARED_DESIGN,
          fontId: 'eb-garamond',
          titleSizePt: 18,
          authorSizePt: 10.5,
          volumeBadgeSizePt: 13,
          defaultBgColor: '#1b222c',
          defaultTextColor: '#f5efe2',
          accentColor: '#d9b566',
          alignmentAnchor: 'shelf-bottom',
          volumeNumberStyle: 'roman',
          bandStyle: 'classic-rules',
          ornamentId: 'divider-celestial-stars',
          ornamentOffsetMm: 48,
          panorama: { ...DEFAULT_SERIES_PANORAMA },
        },
      };
    },
  },
  {
    id: 'classic-5-volume',
    label: 'Classic 5-Volume Set',
    mode: 'series',
    description: '5 volumes with tonal forest-to-slate bookcloth, double raised bands, and varied thicknesses',
    build: (): SeriesProject => {
      const base = BookParametersModel.createDefault();
      const tonal = SERIES_PALETTE_PRESETS[1];
      const colors = tonal.perBookBgColors ?? [];
      const specs = [
        { title: 'Voyages North', thickness: 20 },
        { title: 'The Sea Atlas', thickness: 24 },
        { title: 'Letters from Kyoto', thickness: 28 },
        { title: 'Winter Observatories', thickness: 32 },
        { title: 'The Meridian Index', thickness: 36 },
      ] as const;

      return {
        schemaVersion: SERIES_SCHEMA_VERSION,
        id: SeriesProjectModel.createSeriesId(),
        name: 'Collected Voyages',
        mode: 'series',
        updatedAt: new Date().toISOString(),
        books: specs.map((spec, idx) =>
          SeriesProjectModel.createBookEntry({
            title: spec.title,
            author: 'A. Lindqvist',
            parameters: { ...base, pbHeightMm: 210, pbWidthMm: 135, pbThicknessMm: spec.thickness },
            spineBgColorOverride: colors[idx] ?? tonal.defaultBgColor,
          }),
        ),
        sequences: [],
        shared: {
          ...DEFAULT_SERIES_SHARED_DESIGN,
          fontId: 'libre-baskerville',
          titleSizePt: 15.5,
          authorSizePt: 9.5,
          volumeBadgeSizePt: 11.5,
          defaultBgColor: tonal.defaultBgColor,
          defaultTextColor: tonal.defaultTextColor,
          accentColor: tonal.accentColor,
          alignmentAnchor: 'shelf-bottom',
          volumeNumberStyle: 'roman',
          bandStyle: 'double-bands',
          ornamentId: 'emblem-compass-rose',
          ornamentOffsetMm: 44,
          panorama: { ...DEFAULT_SERIES_PANORAMA },
        },
      };
    },
  },
  {
    id: 'personal-collection',
    label: 'Personal Collection (Mixed Heights)',
    mode: 'collection',
    description: '3 distinct books with varied authors, heights (198 / 216 / 234 mm), and shelf-bottom alignment',
    build: (): SeriesProject => {
      const base = BookParametersModel.createDefault();
      return {
        schemaVersion: SERIES_SCHEMA_VERSION,
        id: SeriesProjectModel.createSeriesId(),
        name: 'Reading Desk Favorites',
        mode: 'collection',
        updatedAt: new Date().toISOString(),
        books: [
          SeriesProjectModel.createBookEntry({
            title: 'The Paper Garden',
            author: 'C. Sato',
            parameters: {
              ...base,
              bindingStyle: 'flexible-spine',
              pbHeightMm: 198,
              pbWidthMm: 128,
              pbThicknessMm: 22,
            },
            spineBgColorOverride: '#234a3f',
          }),
          SeriesProjectModel.createBookEntry({
            title: 'Twenty Thousand Leagues',
            author: 'Jules Verne',
            parameters: {
              ...base,
              bindingStyle: 'rigid-case',
              pbHeightMm: 216,
              pbWidthMm: 140,
              pbThicknessMm: 32,
            },
            spineBgColorOverride: '#1f3a52',
          }),
          SeriesProjectModel.createBookEntry({
            title: 'Architecture of Light',
            author: 'M. Castellano',
            parameters: {
              ...base,
              bindingStyle: 'rigid-case',
              pbHeightMm: 234,
              pbWidthMm: 152,
              pbThicknessMm: 28,
            },
            spineBgColorOverride: '#5c262b',
          }),
        ],
        sequences: [],
        shared: {
          ...DEFAULT_SERIES_SHARED_DESIGN,
          fontId: 'cormorant-garamond',
          titleSizePt: 18,
          authorSizePt: 10.5,
          volumeBadgeSizePt: 12,
          defaultBgColor: '#1f3a52',
          defaultTextColor: '#f5efe2',
          accentColor: '#d9b566',
          alignmentAnchor: 'shelf-bottom',
          volumeNumberStyle: 'none',
          bandStyle: 'classic-rules',
          bandHeadOffsetMm: 14,
          bandTailOffsetMm: 14,
          ornamentId: 'divider-fleuron-leaf',
          ornamentOffsetMm: 46,
          panorama: { ...DEFAULT_SERIES_PANORAMA },
        },
      };
    },
  },
] as const;

export const SAMPLE_PANORAMA_NATURAL_WIDTH = 1800;
export const SAMPLE_PANORAMA_NATURAL_HEIGHT = 600;

/**
 * Generates a crisp, wide procedural SVG data URL (1800x600) depicting gilded alpine peaks,
 * stepped mist ridges, a crescent moon, and constellations over twilight indigo so users can
 * preview continuous panoramic spine artwork with one click and zero external network fetches.
 */
export function createSamplePanoramaDataUrl(): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SAMPLE_PANORAMA_NATURAL_WIDTH}" height="${SAMPLE_PANORAMA_NATURAL_HEIGHT}" viewBox="0 0 1800 600">`,
    '<defs>',
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#0d1628"/>',
    '<stop offset="48%" stop-color="#192a47"/>',
    '<stop offset="78%" stop-color="#3a455e"/>',
    '<stop offset="100%" stop-color="#15202e"/>',
    '</linearGradient>',
    '<linearGradient id="gold-ridge" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0%" stop-color="#c99e4c"/>',
    '<stop offset="50%" stop-color="#f0d28b"/>',
    '<stop offset="100%" stop-color="#b98a3a"/>',
    '</linearGradient>',
    '<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#e8c982" stop-opacity="0.22"/>',
    '<stop offset="100%" stop-color="#0e1726" stop-opacity="0"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="1800" height="600" fill="url(#sky)"/>',
    // Subtle celestial rings & constellation lines
    '<g stroke="#e6c478" stroke-opacity="0.45" fill="none" stroke-width="1.4">',
    '<circle cx="900" cy="170" r="118" stroke-dasharray="6 8"/>',
    '<circle cx="900" cy="170" r="164" stroke-opacity="0.24"/>',
    '<polyline points="170,130 285,95 415,155 560,110 690,175"/>',
    '<polyline points="1110,165 1255,102 1410,148 1545,92 1670,142"/>',
    '</g>',
    // Gilded crescent moon at center-sky
    '<path d="M908 106 A64 64 0 1 0 908 234 A48 48 0 1 1 908 106 Z" fill="#f1d58c"/>',
    // Star field
    '<g fill="#f6e3b0">',
    '<circle cx="170" cy="130" r="4"/><circle cx="285" cy="95" r="3.2"/><circle cx="415" cy="155" r="4.5"/>',
    '<circle cx="560" cy="110" r="3.5"/><circle cx="690" cy="175" r="3"/><circle cx="1110" cy="165" r="3.5"/>',
    '<circle cx="1255" cy="102" r="4.2"/><circle cx="1410" cy="148" r="3.4"/><circle cx="1545" cy="92" r="4.5"/>',
    '<circle cx="1670" cy="142" r="3.2"/><circle cx="340" cy="215" r="2.2"/><circle cx="775" cy="82" r="2.6"/>',
    '<circle cx="1025" cy="78" r="2.6"/><circle cx="1330" cy="205" r="2.2"/><circle cx="95" cy="82" r="2.4"/>',
    '<circle cx="1730" cy="78" r="2.5"/>',
    '</g>',
    // Distant mountain silhouette
    '<path d="M0 430 L160 320 L310 385 L520 265 L700 370 L900 225 L1120 365 L1315 255 L1510 375 L1675 305 L1800 390 L1800 600 L0 600 Z" fill="#1e314d"/>',
    // Gilded ridge highlight line
    '<path d="M0 430 L160 320 L310 385 L520 265 L700 370 L900 225 L1120 365 L1315 255 L1510 375 L1675 305 L1800 390" fill="none" stroke="url(#gold-ridge)" stroke-width="4.5"/>',
    // Midground alpine peaks
    '<path d="M0 495 L220 365 L410 455 L635 335 L820 440 L1020 320 L1235 445 L1440 340 L1640 440 L1800 380 L1800 600 L0 600 Z" fill="#152338"/>',
    '<path d="M0 495 L220 365 L410 455 L635 335 L820 440 L1020 320 L1235 445 L1440 340 L1640 440 L1800 380" fill="none" stroke="#d8b263" stroke-opacity="0.7" stroke-width="2.5"/>',
    // Golden horizon mist veil
    '<rect x="0" y="395" width="1800" height="125" fill="url(#mist)"/>',
    // Foreground dark ridge & tranquil water reflection lines
    '<path d="M0 540 L290 470 L570 530 L900 455 L1210 528 L1520 468 L1800 530 L1800 600 L0 600 Z" fill="#0d1624"/>',
    '<g stroke="#e0be72" stroke-opacity="0.35" stroke-width="2">',
    '<line x1="120" y1="562" x2="480" y2="562"/>',
    '<line x1="640" y1="572" x2="1160" y2="572"/>',
    '<line x1="1310" y1="562" x2="1690" y2="562"/>',
    '</g>',
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
