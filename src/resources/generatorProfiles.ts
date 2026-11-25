import type { ClassicOrnamentId } from '@/types/coverElements';
import type { CuratedFontId } from '@/types/studio';
import type { ProceduralArtworkId } from './proceduralArtworks';

export const CONCRETE_DESIGN_GENRE_IDS = [
  'fantasy',
  'scifi',
  'gothic',
  'romance',
  'thriller',
  'art-deco',
  'botanical',
  'modern-retro',
] as const;

export type ConcreteDesignGenreId = (typeof CONCRETE_DESIGN_GENRE_IDS)[number];

export type DesignGenreId = 'surprise' | ConcreteDesignGenreId;

export interface DesignGenreOption {
  readonly id: DesignGenreId;
  readonly label: string;
}

export const DESIGN_GENRE_OPTIONS: readonly DesignGenreOption[] = [
  { id: 'surprise', label: 'Surprise' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'scifi', label: 'Sci-Fi' },
  { id: 'gothic', label: 'Gothic' },
  { id: 'romance', label: 'Romance' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'art-deco', label: 'Art Deco' },
  { id: 'botanical', label: 'Botanical' },
  { id: 'modern-retro', label: 'Modern' },
] as const;

export const COMPOSITION_ARCHETYPE_IDS = [
  'classic-framed',
  'tarot-arch',
  'art-deco-opulence',
  'botanical-medallion',
  'bold-poster',
  'scifi-orbital',
  'swiss-editorial',
] as const;

export type CompositionArchetypeId = (typeof COMPOSITION_ARCHETYPE_IDS)[number];

export interface CompositionArchetypeSpec {
  readonly id: CompositionArchetypeId;
  readonly label: string;
}

export const COMPOSITION_ARCHETYPES: Readonly<
  Record<CompositionArchetypeId, CompositionArchetypeSpec>
> = {
  'classic-framed': { id: 'classic-framed', label: 'Classic Framed Edition' },
  'tarot-arch': { id: 'tarot-arch', label: 'Cathedral / Tarot Arch' },
  'art-deco-opulence': { id: 'art-deco-opulence', label: 'Art Deco Opulence' },
  'botanical-medallion': { id: 'botanical-medallion', label: 'Botanical Medallion' },
  'bold-poster': { id: 'bold-poster', label: 'Bold Typographic Poster' },
  'scifi-orbital': { id: 'scifi-orbital', label: 'Sci-Fi Orbital' },
  'swiss-editorial': { id: 'swiss-editorial', label: 'Swiss Asymmetric Editorial' },
} as const;

export interface GenrePaletteSpec {
  readonly name: string;
  readonly frontBg: string;
  readonly spineBg: string;
  readonly backBg: string;
  readonly foil: string;
  readonly inkAccent: string;
  readonly pocketBg: string;
}

export interface GenreSampleCopy {
  readonly title: string;
  readonly author: string;
  readonly blurb: string;
}

export interface GenreProfileSpec {
  readonly id: ConcreteDesignGenreId;
  readonly label: string;
  readonly tagline: string;
  readonly palettes: readonly GenrePaletteSpec[];
  readonly titleFonts: readonly CuratedFontId[];
  readonly authorFonts: readonly CuratedFontId[];
  readonly frames: readonly ClassicOrnamentId[];
  readonly corners: readonly ClassicOrnamentId[];
  readonly emblems: readonly ClassicOrnamentId[];
  readonly dividers: readonly ClassicOrnamentId[];
  readonly spineOrnaments: readonly ClassicOrnamentId[];
  readonly proceduralArtworks: readonly ProceduralArtworkId[];
  readonly archetypes: readonly CompositionArchetypeId[];
  readonly samples: readonly GenreSampleCopy[];
}

export const GENRE_PROFILES: Readonly<Record<ConcreteDesignGenreId, GenreProfileSpec>> = {
  fantasy: {
    id: 'fantasy',
    label: 'Fantasy',
    tagline: 'Gilded myth, arcane crests & collector clothbound editions',
    palettes: [
      {
        name: 'Starlit Indigo & Gold',
        frontBg: '#16243b',
        spineBg: '#16243b',
        backBg: '#16243b',
        foil: '#e6c97a',
        inkAccent: '#f5efe2',
        pocketBg: '#f4eee1',
      },
      {
        name: 'Quarter-Bound Dragonblood',
        frontBg: '#1c2b26',
        spineBg: '#4c181d',
        backBg: '#1c2b26',
        foil: '#ebd18a',
        inkAccent: '#f6f0e4',
        pocketBg: '#efe5d0',
      },
      {
        name: 'Obsidian Crown',
        frontBg: '#18181f',
        spineBg: '#18181f',
        backBg: '#18181f',
        foil: '#e8c86c',
        inkAccent: '#f2ece1',
        pocketBg: '#e8dfd0',
      },
      {
        name: 'Enchanted Moss & Brass',
        frontBg: '#1a382e',
        spineBg: '#142a22',
        backBg: '#1a382e',
        foil: '#ead086',
        inkAccent: '#f6f1e6',
        pocketBg: '#f3ecd8',
      },
      {
        name: 'Illuminated Vellum Duotone',
        frontBg: '#f2eadb',
        spineBg: '#271c36',
        backBg: '#f2eadb',
        foil: '#231830',
        inkAccent: '#1b1615',
        pocketBg: '#e7ddc9',
      },
    ],
    titleFonts: [
      'cinzel-decorative',
      'almendra-display',
      'uncial-antiqua',
      'cormorant-garamond',
      'eb-garamond',
    ],
    authorFonts: ['eb-garamond', 'cormorant-garamond', 'lora', 'libre-baskerville'],
    frames: ['frame-gothic-arch', 'frame-double-rule', 'frame-notched-corner'],
    corners: ['corners-classic-scroll', 'corners-botanical-vine'],
    emblems: [
      'emblem-crescent-stars',
      'emblem-dagger-vines',
      'emblem-coiled-serpent',
      'emblem-filigree-crown',
      'emblem-tarot-sun',
      'emblem-compass-rose',
    ],
    dividers: ['divider-celestial-stars', 'divider-sword-rule', 'divider-diamond-rule'],
    spineOrnaments: ['spine-celestial-column', 'spine-moon-phases', 'spine-classic-bands'],
    proceduralArtworks: ['cosmic-nebula', 'suminagashi-marble', 'topographic-contours'],
    archetypes: ['tarot-arch', 'classic-framed', 'botanical-medallion'],
    samples: [
      {
        title: 'Crown of Starlight',
        author: 'Eleanor Vance',
        blurb: 'A mythic tale of forgotten kingdoms,\nstarlit oaths, and an ancient crown.',
      },
      {
        title: 'The Serpent and the Thorn',
        author: 'Rowan Ashford',
        blurb: 'Beneath the silver canopy lies\na labyrinth guarded by old magic.',
      },
      {
        title: 'Chronicles of the Sun Spire',
        author: 'Julian Hale',
        blurb: 'Bound in gilded cloth — a collector’s\nedition of the northern realm.',
      },
    ],
  },

  scifi: {
    id: 'scifi',
    label: 'Sci-Fi',
    tagline: 'Orbital geometry, deep-space telemetry & modernist precision',
    palettes: [
      {
        name: 'Deep Space Telemetry',
        frontBg: '#0f172a',
        spineBg: '#0f172a',
        backBg: '#0f172a',
        foil: '#dce8f8',
        inkAccent: '#f4f7fb',
        pocketBg: '#e4ebf5',
      },
      {
        name: 'Quarter-Bound Solar Probe',
        frontBg: '#121926',
        spineBg: '#1f364d',
        backBg: '#121926',
        foil: '#f2ca6b',
        inkAccent: '#edf2f7',
        pocketBg: '#e6ecf2',
      },
      {
        name: 'Event Horizon Slate',
        frontBg: '#171a21',
        spineBg: '#171a21',
        backBg: '#171a21',
        foil: '#b8e0f5',
        inkAccent: '#f0f4f8',
        pocketBg: '#e5eaef',
      },
      {
        name: 'Orbital Blueprint Paper',
        frontBg: '#edf1f5',
        spineBg: '#102136',
        backBg: '#edf1f5',
        foil: '#102136',
        inkAccent: '#141e2b',
        pocketBg: '#dfe6ee',
      },
      {
        name: 'Martian Dusk',
        frontBg: '#2b1918',
        spineBg: '#1a1418',
        backBg: '#2b1918',
        foil: '#f2cba0',
        inkAccent: '#f8efe6',
        pocketBg: '#efe4d8',
      },
    ],
    titleFonts: ['orbitron', 'audiowide', 'syne', 'montserrat'],
    authorFonts: ['inter', 'montserrat', 'syne', 'orbitron'],
    frames: ['frame-modern-editorial', 'frame-single-rule', 'frame-art-deco'],
    corners: ['corners-deco-chevron'],
    emblems: ['emblem-orbital-rings', 'emblem-bauhaus-arches', 'emblem-compass-rose'],
    dividers: ['divider-geometric-dots', 'divider-diamond-rule'],
    spineOrnaments: ['spine-orbital-axis', 'spine-head-tail-bands'],
    proceduralArtworks: ['cosmic-nebula', 'retro-horizon-grid', 'topographic-contours', 'kumiko-lattice'],
    archetypes: ['scifi-orbital', 'swiss-editorial', 'bold-poster'],
    samples: [
      {
        title: 'Kepler Station',
        author: 'Soren Lindqvist',
        blurb: 'Forty light-years from home,\nthe last signal begins to repeat.',
      },
      {
        title: 'The Orbital Atlas',
        author: 'Nadia Okafor',
        blurb: 'Star charts and dispatches from\nthe outer Helios frontier.',
      },
      {
        title: 'Echoes of Hyperion',
        author: 'Marcus Chen',
        blurb: 'A speculative anthology across\nfractured horizons of time.',
      },
    ],
  },

  gothic: {
    id: 'gothic',
    label: 'Gothic',
    tagline: 'Cathedral arches, blackletter elegance & dark academia cloth',
    palettes: [
      {
        name: 'Cathedral Oxblood',
        frontBg: '#3e1519',
        spineBg: '#3e1519',
        backBg: '#3e1519',
        foil: '#ebd18a',
        inkAccent: '#f6f0e4',
        pocketBg: '#ebe2d4',
      },
      {
        name: 'Nocturne Velvet & Silver',
        frontBg: '#141318',
        spineBg: '#141318',
        backBg: '#141318',
        foil: '#dce2ea',
        inkAccent: '#f3f4f6',
        pocketBg: '#e4e2de',
      },
      {
        name: 'Quarter-Bound Crypt Plum',
        frontBg: '#231629',
        spineBg: '#151218',
        backBg: '#231629',
        foil: '#e8cb7e',
        inkAccent: '#f5efe4',
        pocketBg: '#ebe4da',
      },
      {
        name: 'Dark Academia Cypress',
        frontBg: '#17231e',
        spineBg: '#2c1c16',
        backBg: '#17231e',
        foil: '#e5c77a',
        inkAccent: '#f4eee2',
        pocketBg: '#eae2d2',
      },
      {
        name: 'Archival Bone & Ink',
        frontBg: '#eee7da',
        spineBg: '#1c1817',
        backBg: '#eee7da',
        foil: '#181615',
        inkAccent: '#181615',
        pocketBg: '#e2d9c8',
      },
    ],
    titleFonts: ['unifrakturmaguntia', 'pirata-one', 'cormorant-garamond', 'cinzel-decorative'],
    authorFonts: ['eb-garamond', 'libre-baskerville', 'cormorant-garamond'],
    frames: ['frame-gothic-arch', 'frame-double-rule', 'frame-notched-corner'],
    corners: ['corners-classic-scroll'],
    emblems: [
      'emblem-lunar-moth',
      'emblem-dagger-vines',
      'emblem-coiled-serpent',
      'emblem-rose-bloom',
      'emblem-crescent-stars',
    ],
    dividers: ['divider-fleuron-leaf', 'divider-celestial-stars', 'divider-sword-rule'],
    spineOrnaments: ['spine-moon-phases', 'spine-classic-bands', 'spine-title-cartouche'],
    proceduralArtworks: ['suminagashi-marble', 'cosmic-nebula', 'kumiko-lattice'],
    archetypes: ['tarot-arch', 'classic-framed'],
    samples: [
      {
        title: 'The Bell of St. Jude',
        author: 'Clara Blackwood',
        blurb: 'Candlelit corridors, winter fog,\nand secrets sealed behind iron doors.',
      },
      {
        title: 'Nocturne in Ash',
        author: 'Edgar Morley',
        blurb: 'Collected letters from the library\nof the old highland abbey.',
      },
      {
        title: 'House of the Moth',
        author: 'Beatrice Thorne',
        blurb: 'An atmospheric gothic chronicle\nbound in archival cloth.',
      },
    ],
  },

  romance: {
    id: 'romance',
    label: 'Romance',
    tagline: 'Calligraphic scripts, woodcut roses & luminous gilded foils',
    palettes: [
      {
        name: 'Burgundy Rose & Champagne',
        frontBg: '#511c29',
        spineBg: '#511c29',
        backBg: '#511c29',
        foil: '#f2d99b',
        inkAccent: '#faf2e8',
        pocketBg: '#f6ede4',
      },
      {
        name: 'Midnight Velvet & Blush Gold',
        frontBg: '#1b2036',
        spineBg: '#1b2036',
        backBg: '#1b2036',
        foil: '#f2d0b6',
        inkAccent: '#f9f1ea',
        pocketBg: '#f5ece6',
      },
      {
        name: 'Quarter-Bound Garden Sage',
        frontBg: '#1f3b34',
        spineBg: '#4c202a',
        backBg: '#1f3b34',
        foil: '#f3d8a0',
        inkAccent: '#f8f2e8',
        pocketBg: '#f4eee2',
      },
      {
        name: 'Ivory Letterpress & Claret',
        frontBg: '#f6efe4',
        spineBg: '#4d1c27',
        backBg: '#f6efe4',
        foil: '#4d1c27',
        inkAccent: '#231619',
        pocketBg: '#eee4d6',
      },
      {
        name: 'Plum Dusk & Ivory',
        frontBg: '#321c38',
        spineBg: '#321c38',
        backBg: '#321c38',
        foil: '#f6e7cb',
        inkAccent: '#faf5ec',
        pocketBg: '#f3ece4',
      },
    ],
    titleFonts: ['great-vibes', 'pinyon-script', 'playfair-display', 'cormorant-garamond', 'fraunces'],
    authorFonts: ['cormorant-garamond', 'lora', 'playfair-display', 'eb-garamond'],
    frames: ['frame-double-rule', 'frame-notched-corner', 'frame-single-rule'],
    corners: ['corners-botanical-vine', 'corners-classic-scroll'],
    emblems: ['emblem-rose-bloom', 'emblem-olive-wreath', 'emblem-lunar-moth', 'emblem-crescent-stars'],
    dividers: ['divider-vine-flourish', 'divider-fleuron-leaf', 'divider-celestial-stars'],
    spineOrnaments: ['spine-botanical-vine', 'spine-head-tail-bands', 'spine-classic-bands'],
    proceduralArtworks: ['suminagashi-marble', 'botanical-medallion-tile', 'seigaiha-waves'],
    archetypes: ['botanical-medallion', 'classic-framed', 'tarot-arch'],
    samples: [
      {
        title: 'Letters in Autumn',
        author: 'Camille Laurent',
        blurb: 'Two strangers, a coastal bookshop,\nand a season neither will forget.',
      },
      {
        title: 'The Glass Conservatory',
        author: 'Evelyn Hart',
        blurb: 'Where winter roses bloom beneath\na vaulted ceiling of rain.',
      },
      {
        title: 'Waltz at Midnight',
        author: 'Sophia Mercer',
        blurb: 'A timeless keepsake romance\nstamped in luminous foil.',
      },
    ],
  },

  thriller: {
    id: 'thriller',
    label: 'Thriller',
    tagline: 'High-contrast noir typography, stark rules & sharp tension',
    palettes: [
      {
        name: 'Noir Charcoal & Vermilion',
        frontBg: '#161618',
        spineBg: '#161618',
        backBg: '#161618',
        foil: '#f5efe2',
        inkAccent: '#f2f2f0',
        pocketBg: '#e6e3dc',
      },
      {
        name: 'Quarter-Bound Crimson Case',
        frontBg: '#1a1c20',
        spineBg: '#5e1919',
        backBg: '#1a1c20',
        foil: '#f6d67a',
        inkAccent: '#f4f4f2',
        pocketBg: '#e8e2d8',
      },
      {
        name: 'Cold Case Navy',
        frontBg: '#101d2e',
        spineBg: '#101d2e',
        backBg: '#101d2e',
        foil: '#eef2f7',
        inkAccent: '#f4f7fa',
        pocketBg: '#e2e8ef',
      },
      {
        name: 'Dossier Kraft Duotone',
        frontBg: '#ede4d3',
        spineBg: '#1a1816',
        backBg: '#ede4d3',
        foil: '#181615',
        inkAccent: '#181615',
        pocketBg: '#e2d7c2',
      },
      {
        name: 'Asphalt & Amber Signal',
        frontBg: '#1e2022',
        spineBg: '#1e2022',
        backBg: '#1e2022',
        foil: '#f0c65c',
        inkAccent: '#f5f2eb',
        pocketBg: '#e7e4dc',
      },
    ],
    titleFonts: ['bebas-neue', 'special-elite', 'montserrat', 'inter'],
    authorFonts: ['inter', 'montserrat', 'libre-baskerville', 'special-elite'],
    frames: ['frame-modern-editorial', 'frame-single-rule'],
    corners: ['corners-deco-chevron'],
    emblems: ['emblem-compass-rose', 'emblem-bauhaus-arches', 'emblem-dagger-vines'],
    dividers: ['divider-geometric-dots', 'divider-diamond-rule'],
    spineOrnaments: ['spine-head-tail-bands', 'spine-orbital-axis'],
    proceduralArtworks: ['topographic-contours', 'bauhaus-poster', 'kumiko-lattice'],
    archetypes: ['bold-poster', 'swiss-editorial'],
    samples: [
      {
        title: 'The Silent Witness',
        author: 'David Mercer',
        blurb: 'One locked room. Three conflicting\ntimelines. No one leaves clean.',
      },
      {
        title: 'Cold Harbor',
        author: 'Hannah Reyes',
        blurb: 'When the ferry disappears in fog,\nthe past resurfaces by dawn.',
      },
      {
        title: 'Zero Hour Protocol',
        author: 'Arthur Cole',
        blurb: 'A razor-sharp psychological thriller\nset over one sleepless night.',
      },
    ],
  },

  'art-deco': {
    id: 'art-deco',
    label: 'Art Deco',
    tagline: 'Roaring Twenties stepped brass geometry, fans & marquee lettering',
    palettes: [
      {
        name: 'Gatsby Obsidian & Brass',
        frontBg: '#161920',
        spineBg: '#161920',
        backBg: '#161920',
        foil: '#e8c468',
        inkAccent: '#f6efe2',
        pocketBg: '#ede5d4',
      },
      {
        name: 'Emerald Speakeasy',
        frontBg: '#123832',
        spineBg: '#123832',
        backBg: '#123832',
        foil: '#edd07e',
        inkAccent: '#f6f0e4',
        pocketBg: '#efe7d6',
      },
      {
        name: 'Quarter-Bound Chrysler Navy',
        frontBg: '#15253d',
        spineBg: '#11161f',
        backBg: '#15253d',
        foil: '#eac76e',
        inkAccent: '#f4efe4',
        pocketBg: '#ebe4d5',
      },
      {
        name: 'Champagne Ivory & Onyx',
        frontBg: '#f3ebd8',
        spineBg: '#17191f',
        backBg: '#f3ebd8',
        foil: '#18191e',
        inkAccent: '#181615',
        pocketBg: '#e7ddc6',
      },
      {
        name: 'Cabaret Bordeaux',
        frontBg: '#471822',
        spineBg: '#1a1518',
        backBg: '#471822',
        foil: '#efd182',
        inkAccent: '#f8f1e6',
        pocketBg: '#efe5d6',
      },
    ],
    titleFonts: ['limelight', 'poiret-one', 'cinzel-decorative', 'montserrat'],
    authorFonts: ['montserrat', 'poiret-one', 'inter', 'cormorant-garamond'],
    frames: ['frame-art-deco', 'frame-deco-archway', 'frame-double-rule'],
    corners: ['corners-deco-fan', 'corners-deco-chevron'],
    emblems: ['emblem-deco-sunburst', 'emblem-tarot-sun'],
    dividers: ['divider-deco-fan', 'divider-diamond-rule'],
    spineOrnaments: ['spine-deco-sunburst', 'spine-diamond-lattice', 'spine-title-cartouche'],
    proceduralArtworks: ['art-deco-fans', 'kumiko-lattice', 'seigaiha-waves'],
    archetypes: ['art-deco-opulence', 'classic-framed', 'tarot-arch'],
    samples: [
      {
        title: 'The Grand Pavilion',
        author: 'Vivian Sterling',
        blurb: 'Jazz, champagne, and gilded secrets\nalong the 1927 skyline.',
      },
      {
        title: 'Metropolis Nocturne',
        author: 'Theodore Blake',
        blurb: 'An architectural chronicle of\niron, brass, and midnight light.',
      },
      {
        title: 'Gilded Horizon',
        author: 'Margaux Sinclair',
        blurb: 'A roaring-twenties collector’s\nedition in stepped gold foil.',
      },
    ],
  },

  botanical: {
    id: 'botanical',
    label: 'Botanical',
    tagline: 'Clothbound herbarium motifs, warm serifs & natural paper tones',
    palettes: [
      {
        name: 'Bindery Spruce & Cream',
        frontBg: '#1b433b',
        spineBg: '#1b433b',
        backBg: '#1b433b',
        foil: '#f5efe2',
        inkAccent: '#f7f2e8',
        pocketBg: '#f3ece0',
      },
      {
        name: 'Quarter-Bound Herbarium',
        frontBg: '#233b2c',
        spineBg: '#4f3524',
        backBg: '#233b2c',
        foil: '#edd28e',
        inkAccent: '#f6f1e6',
        pocketBg: '#efe7d6',
      },
      {
        name: 'Pressed Linen & Forest Ink',
        frontBg: '#f3ede0',
        spineBg: '#1e3c32',
        backBg: '#f3ede0',
        foil: '#19352b',
        inkAccent: '#18241f',
        pocketBg: '#e8e0cf',
      },
      {
        name: 'Terracotta Clay & Ivory',
        frontBg: '#5e2c21',
        spineBg: '#5e2c21',
        backBg: '#5e2c21',
        foil: '#f7efe0',
        inkAccent: '#faf4e8',
        pocketBg: '#f4ebe0',
      },
      {
        name: 'Indigo Washi & Gold',
        frontBg: '#1f364d',
        spineBg: '#1f364d',
        backBg: '#1f364d',
        foil: '#ebd08a',
        inkAccent: '#f5efe2',
        pocketBg: '#f1eadc',
      },
    ],
    titleFonts: ['fraunces', 'playfair-display', 'lora', 'eb-garamond', 'libre-baskerville'],
    authorFonts: ['lora', 'eb-garamond', 'libre-baskerville', 'cormorant-garamond'],
    frames: ['frame-notched-corner', 'frame-double-rule', 'frame-single-rule'],
    corners: ['corners-botanical-vine', 'corners-classic-scroll'],
    emblems: ['emblem-botanical-sprig', 'emblem-olive-wreath', 'emblem-lunar-moth', 'emblem-rose-bloom'],
    dividers: ['divider-vine-flourish', 'divider-fleuron-leaf'],
    spineOrnaments: ['spine-botanical-vine', 'spine-classic-bands', 'spine-head-tail-bands'],
    proceduralArtworks: [
      'botanical-medallion-tile',
      'seigaiha-waves',
      'suminagashi-marble',
      'topographic-contours',
    ],
    archetypes: ['botanical-medallion', 'classic-framed'],
    samples: [
      {
        title: 'Flora of the Northern Woods',
        author: 'Clara Lindholm',
        blurb: 'Illustrated field studies of ferns,\nmosses, and alpine wildflowers.',
      },
      {
        title: 'The Apothecary Garden',
        author: 'Thomas Greenwood',
        blurb: 'A seasonal compendium of roots,\nblossoms, and pressed leaves.',
      },
      {
        title: 'Meadow and Cedar',
        author: 'Maren Solberg',
        blurb: 'Quiet essays gathered across\nfour seasons on the coastal trail.',
      },
    ],
  },

  'modern-retro': {
    id: 'modern-retro',
    label: 'Modern',
    tagline: 'Swiss editorial grids, Bauhaus geometry & crisp contemporary pop',
    palettes: [
      {
        name: 'Swiss Ink & Bone',
        frontBg: '#f2ece0',
        spineBg: '#18181b',
        backBg: '#f2ece0',
        foil: '#18181b',
        inkAccent: '#141417',
        pocketBg: '#e6dfd0',
      },
      {
        name: 'Cobalt Print & Warm Cream',
        frontBg: '#162f59',
        spineBg: '#162f59',
        backBg: '#162f59',
        foil: '#f6efe2',
        inkAccent: '#ffffff',
        pocketBg: '#ece7dc',
      },
      {
        name: 'Quarter-Bound Bauhaus Ochre',
        frontBg: '#1d1f24',
        spineBg: '#5e231c',
        backBg: '#1d1f24',
        foil: '#f0cc6c',
        inkAccent: '#f5f2eb',
        pocketBg: '#ece4d4',
      },
      {
        name: 'Retro Teal & Sand',
        frontBg: '#143d45',
        spineBg: '#143d45',
        backBg: '#143d45',
        foil: '#f5dec0',
        inkAccent: '#faf5ec',
        pocketBg: '#f0e7da',
      },
      {
        name: 'Graphite Studio',
        frontBg: '#1f2328',
        spineBg: '#1f2328',
        backBg: '#1f2328',
        foil: '#f0f4f8',
        inkAccent: '#f8fafc',
        pocketBg: '#e6eaee',
      },
    ],
    titleFonts: ['bricolage-grotesque', 'syne', 'fraunces', 'bebas-neue', 'inter'],
    authorFonts: ['inter', 'montserrat', 'bricolage-grotesque', 'lora'],
    frames: ['frame-modern-editorial', 'frame-single-rule'],
    corners: ['corners-deco-chevron'],
    emblems: ['emblem-bauhaus-arches', 'emblem-orbital-rings'],
    dividers: ['divider-geometric-dots', 'divider-diamond-rule'],
    spineOrnaments: ['spine-orbital-axis', 'spine-head-tail-bands'],
    proceduralArtworks: ['bauhaus-poster', 'retro-horizon-grid', 'kumiko-lattice', 'topographic-contours'],
    archetypes: ['swiss-editorial', 'bold-poster'],
    samples: [
      {
        title: 'Form and Rhythm',
        author: 'Lukas Meyer',
        blurb: 'Notes on modular grids, proportion,\nand twentieth-century print craft.',
      },
      {
        title: 'Parallel Cities',
        author: 'Sora Takahashi',
        blurb: 'Essays on architecture, transit,\nand the geometry of daily life.',
      },
      {
        title: 'Daylight Editions',
        author: 'Elena Morales',
        blurb: 'A contemporary monograph printed\non uncoated archival stock.',
      },
    ],
  },
} as const;

export function getGenreProfile(id: ConcreteDesignGenreId): GenreProfileSpec {
  return GENRE_PROFILES[id];
}
