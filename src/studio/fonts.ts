import almendraDisplayWoffUrl from '@fontsource/almendra-display/files/almendra-display-latin-400-normal.woff?url';
import audiowideWoffUrl from '@fontsource/audiowide/files/audiowide-latin-400-normal.woff?url';
import bebasNeueWoffUrl from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url';
import bricolageGrotesqueWoffUrl from '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-400-normal.woff?url';
import cinzelDecorativeWoffUrl from '@fontsource/cinzel-decorative/files/cinzel-decorative-latin-400-normal.woff?url';
import cormorantWoffUrl from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff?url';
import ebGaramondWoffUrl from '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url';
import frauncesWoffUrl from '@fontsource/fraunces/files/fraunces-latin-400-normal.woff?url';
import greatVibesWoffUrl from '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff?url';
import interWoffUrl from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import libreBaskervilleWoffUrl from '@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff?url';
import limelightWoffUrl from '@fontsource/limelight/files/limelight-latin-400-normal.woff?url';
import loraWoffUrl from '@fontsource/lora/files/lora-latin-400-normal.woff?url';
import montserratWoffUrl from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff?url';
import orbitronWoffUrl from '@fontsource/orbitron/files/orbitron-latin-400-normal.woff?url';
import pinyonScriptWoffUrl from '@fontsource/pinyon-script/files/pinyon-script-latin-400-normal.woff?url';
import pirataOneWoffUrl from '@fontsource/pirata-one/files/pirata-one-latin-400-normal.woff?url';
import playfairDisplayWoffUrl from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url';
import poiretOneWoffUrl from '@fontsource/poiret-one/files/poiret-one-latin-400-normal.woff?url';
import specialEliteWoffUrl from '@fontsource/special-elite/files/special-elite-latin-400-normal.woff?url';
import syneWoffUrl from '@fontsource/syne/files/syne-latin-400-normal.woff?url';
import uncialAntiquaWoffUrl from '@fontsource/uncial-antiqua/files/uncial-antiqua-latin-400-normal.woff?url';
import unifrakturMaguntiaWoffUrl from '@fontsource/unifrakturmaguntia/files/unifrakturmaguntia-latin-400-normal.woff?url';
import type { CoverStudioState, CuratedFontId, StudioFontId } from '@/types/studio';

export type FontCategory = 'serif' | 'sans-serif' | 'display' | 'script' | 'blackletter';

export type FontGenreGroupId =
  | 'classic'
  | 'fantasy'
  | 'scifi'
  | 'gothic'
  | 'romance'
  | 'thriller'
  | 'art-deco'
  | 'modern';

export type FontGenreTag =
  | 'classic'
  | 'literary'
  | 'fantasy'
  | 'romantasy'
  | 'mythic'
  | 'celtic'
  | 'scifi'
  | 'cyberpunk'
  | 'gothic'
  | 'dark-academia'
  | 'dark-fantasy'
  | 'romance'
  | 'script'
  | 'thriller'
  | 'noir'
  | 'mystery'
  | 'art-deco'
  | 'modern'
  | 'retro';

export type FontCasingRule = 'any' | 'uppercase-only' | 'mixed-case-only' | 'swash-on-caps';
export type FontCricutFriendliness = 'excellent' | 'large-only';

export interface FontGenreGroupSpec {
  readonly id: FontGenreGroupId;
  readonly label: string;
}

export const FONT_GENRE_GROUPS: readonly FontGenreGroupSpec[] = [
  { id: 'classic', label: 'Classic & Literary' },
  { id: 'fantasy', label: 'Fantasy & Mythic' },
  { id: 'scifi', label: 'Sci-Fi & Speculative' },
  { id: 'gothic', label: 'Gothic & Dark Academia' },
  { id: 'romance', label: 'Romance & Calligraphy' },
  { id: 'thriller', label: 'Thriller & Noir' },
  { id: 'art-deco', label: 'Art Deco & Gilded' },
  { id: 'modern', label: 'Modern & Retro Pop' },
] as const;

export interface CuratedFontSpec {
  readonly id: CuratedFontId;
  readonly label: string;
  readonly cssFamily: string;
  readonly category: FontCategory;
  readonly genreGroup: FontGenreGroupId;
  readonly genres: readonly FontGenreTag[];
  readonly casingRule: FontCasingRule;
  readonly cricutFriendly: FontCricutFriendliness;
  readonly sampleTagline: string;
  readonly woffUrl: string;
}

export interface CustomFontAsset {
  readonly familyName: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly pdfEmbeddable: boolean;
}

const CURATED_FONT_REGISTRY: Readonly<Record<CuratedFontId, CuratedFontSpec>> = {
  'eb-garamond': {
    id: 'eb-garamond',
    label: 'EB Garamond',
    cssFamily: "'EB Garamond', Georgia, serif",
    category: 'serif',
    genreGroup: 'classic',
    genres: ['classic', 'literary'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Timeless book',
    woffUrl: ebGaramondWoffUrl,
  },
  'libre-baskerville': {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    cssFamily: "'Libre Baskerville', Georgia, serif",
    category: 'serif',
    genreGroup: 'classic',
    genres: ['classic', 'literary'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Editorial serif',
    woffUrl: libreBaskervilleWoffUrl,
  },
  'cormorant-garamond': {
    id: 'cormorant-garamond',
    label: 'Cormorant Garamond',
    cssFamily: "'Cormorant Garamond', Georgia, serif",
    category: 'serif',
    genreGroup: 'classic',
    genres: ['classic', 'literary', 'romance'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'High contrast',
    woffUrl: cormorantWoffUrl,
  },
  lora: {
    id: 'lora',
    label: 'Lora',
    cssFamily: "'Lora', Georgia, serif",
    category: 'serif',
    genreGroup: 'classic',
    genres: ['classic', 'literary'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Warm literary',
    woffUrl: loraWoffUrl,
  },
  'playfair-display': {
    id: 'playfair-display',
    label: 'Playfair Display',
    cssFamily: "'Playfair Display', Georgia, serif",
    category: 'serif',
    genreGroup: 'classic',
    genres: ['literary', 'classic', 'romance'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Refined serif',
    woffUrl: playfairDisplayWoffUrl,
  },
  fraunces: {
    id: 'fraunces',
    label: 'Fraunces',
    cssFamily: "'Fraunces', Georgia, serif",
    category: 'serif',
    genreGroup: 'classic',
    genres: ['modern', 'literary', 'retro'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Soft vintage',
    woffUrl: frauncesWoffUrl,
  },
  'cinzel-decorative': {
    id: 'cinzel-decorative',
    label: 'Cinzel Decorative',
    cssFamily: "'Cinzel Decorative', Georgia, serif",
    category: 'display',
    genreGroup: 'fantasy',
    genres: ['fantasy', 'romantasy'],
    casingRule: 'swash-on-caps',
    cricutFriendly: 'excellent',
    sampleTagline: 'Swash caps',
    woffUrl: cinzelDecorativeWoffUrl,
  },
  'almendra-display': {
    id: 'almendra-display',
    label: 'Almendra Display',
    cssFamily: "'Almendra Display', Georgia, serif",
    category: 'display',
    genreGroup: 'fantasy',
    genres: ['fantasy', 'mythic'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Mythic woodcut',
    woffUrl: almendraDisplayWoffUrl,
  },
  'uncial-antiqua': {
    id: 'uncial-antiqua',
    label: 'Uncial Antiqua',
    cssFamily: "'Uncial Antiqua', Georgia, serif",
    category: 'display',
    genreGroup: 'fantasy',
    genres: ['fantasy', 'celtic'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Celtic uncial',
    woffUrl: uncialAntiquaWoffUrl,
  },
  orbitron: {
    id: 'orbitron',
    label: 'Orbitron',
    cssFamily: "'Orbitron', system-ui, sans-serif",
    category: 'display',
    genreGroup: 'scifi',
    genres: ['scifi'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Orbital sci-fi',
    woffUrl: orbitronWoffUrl,
  },
  audiowide: {
    id: 'audiowide',
    label: 'Audiowide',
    cssFamily: "'Audiowide', system-ui, sans-serif",
    category: 'display',
    genreGroup: 'scifi',
    genres: ['scifi', 'cyberpunk'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Cyber visor',
    woffUrl: audiowideWoffUrl,
  },
  syne: {
    id: 'syne',
    label: 'Syne',
    cssFamily: "'Syne', system-ui, sans-serif",
    category: 'sans-serif',
    genreGroup: 'scifi',
    genres: ['scifi', 'modern', 'literary'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Avant-garde',
    woffUrl: syneWoffUrl,
  },
  unifrakturmaguntia: {
    id: 'unifrakturmaguntia',
    label: 'UnifrakturMaguntia',
    cssFamily: "'UnifrakturMaguntia', Georgia, serif",
    category: 'blackletter',
    genreGroup: 'gothic',
    genres: ['gothic', 'dark-academia'],
    casingRule: 'mixed-case-only',
    cricutFriendly: 'excellent',
    sampleTagline: 'Classic fraktur',
    woffUrl: unifrakturMaguntiaWoffUrl,
  },
  'pirata-one': {
    id: 'pirata-one',
    label: 'Pirata One',
    cssFamily: "'Pirata One', Georgia, serif",
    category: 'blackletter',
    genreGroup: 'gothic',
    genres: ['gothic', 'dark-fantasy'],
    casingRule: 'mixed-case-only',
    cricutFriendly: 'excellent',
    sampleTagline: 'Dark fantasy',
    woffUrl: pirataOneWoffUrl,
  },
  'great-vibes': {
    id: 'great-vibes',
    label: 'Great Vibes',
    cssFamily: "'Great Vibes', Georgia, cursive",
    category: 'script',
    genreGroup: 'romance',
    genres: ['romance', 'script'],
    casingRule: 'mixed-case-only',
    cricutFriendly: 'large-only',
    sampleTagline: 'Flowing script',
    woffUrl: greatVibesWoffUrl,
  },
  'pinyon-script': {
    id: 'pinyon-script',
    label: 'Pinyon Script',
    cssFamily: "'Pinyon Script', Georgia, cursive",
    category: 'script',
    genreGroup: 'romance',
    genres: ['romance', 'script'],
    casingRule: 'mixed-case-only',
    cricutFriendly: 'large-only',
    sampleTagline: 'Copperplate',
    woffUrl: pinyonScriptWoffUrl,
  },
  'bebas-neue': {
    id: 'bebas-neue',
    label: 'Bebas Neue',
    cssFamily: "'Bebas Neue', system-ui, sans-serif",
    category: 'display',
    genreGroup: 'thriller',
    genres: ['thriller', 'noir'],
    casingRule: 'uppercase-only',
    cricutFriendly: 'excellent',
    sampleTagline: 'Tall noir caps',
    woffUrl: bebasNeueWoffUrl,
  },
  'special-elite': {
    id: 'special-elite',
    label: 'Special Elite',
    cssFamily: "'Special Elite', 'Courier New', monospace",
    category: 'display',
    genreGroup: 'thriller',
    genres: ['thriller', 'mystery'],
    casingRule: 'any',
    cricutFriendly: 'large-only',
    sampleTagline: 'Noir typewriter',
    woffUrl: specialEliteWoffUrl,
  },
  'poiret-one': {
    id: 'poiret-one',
    label: 'Poiret One',
    cssFamily: "'Poiret One', system-ui, sans-serif",
    category: 'display',
    genreGroup: 'art-deco',
    genres: ['art-deco'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Gatsby deco',
    woffUrl: poiretOneWoffUrl,
  },
  limelight: {
    id: 'limelight',
    label: 'Limelight',
    cssFamily: "'Limelight', Georgia, serif",
    category: 'display',
    genreGroup: 'art-deco',
    genres: ['art-deco'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Marquee deco',
    woffUrl: limelightWoffUrl,
  },
  inter: {
    id: 'inter',
    label: 'Inter',
    cssFamily: "'Inter', system-ui, sans-serif",
    category: 'sans-serif',
    genreGroup: 'modern',
    genres: ['modern'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Clean Swiss',
    woffUrl: interWoffUrl,
  },
  montserrat: {
    id: 'montserrat',
    label: 'Montserrat',
    cssFamily: "'Montserrat', system-ui, sans-serif",
    category: 'sans-serif',
    genreGroup: 'modern',
    genres: ['modern'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Geometric sans',
    woffUrl: montserratWoffUrl,
  },
  'bricolage-grotesque': {
    id: 'bricolage-grotesque',
    label: 'Bricolage Grotesque',
    cssFamily: "'Bricolage Grotesque', system-ui, sans-serif",
    category: 'sans-serif',
    genreGroup: 'modern',
    genres: ['modern', 'retro'],
    casingRule: 'any',
    cricutFriendly: 'excellent',
    sampleTagline: 'Retro pop',
    woffUrl: bricolageGrotesqueWoffUrl,
  },
} as const;

export const CURATED_FONTS: readonly CuratedFontSpec[] = Object.values(CURATED_FONT_REGISTRY);

const CURATED_FONT_CSS_LOADERS: Readonly<Record<CuratedFontId, () => Promise<unknown>>> = {
  // Eagerly imported in src/main.tsx for instant initial paint
  'eb-garamond': () => Promise.resolve(),
  inter: () => Promise.resolve(),
  // Lazy-loaded on demand via dynamic CSS chunks
  'libre-baskerville': () => import('@fontsource/libre-baskerville/400.css'),
  'cormorant-garamond': () => import('@fontsource/cormorant-garamond/400.css'),
  lora: () => import('@fontsource/lora/400.css'),
  'playfair-display': () => import('@fontsource/playfair-display/400.css'),
  fraunces: () => import('@fontsource/fraunces/400.css'),
  montserrat: () => import('@fontsource/montserrat/400.css'),
  'bricolage-grotesque': () => import('@fontsource/bricolage-grotesque/400.css'),
  'cinzel-decorative': () => import('@fontsource/cinzel-decorative/400.css'),
  'almendra-display': () => import('@fontsource/almendra-display/400.css'),
  'uncial-antiqua': () => import('@fontsource/uncial-antiqua/400.css'),
  orbitron: () => import('@fontsource/orbitron/400.css'),
  audiowide: () => import('@fontsource/audiowide/400.css'),
  syne: () => import('@fontsource/syne/400.css'),
  unifrakturmaguntia: () => import('@fontsource/unifrakturmaguntia/400.css'),
  'pirata-one': () => import('@fontsource/pirata-one/400.css'),
  'great-vibes': () => import('@fontsource/great-vibes/400.css'),
  'pinyon-script': () => import('@fontsource/pinyon-script/400.css'),
  'bebas-neue': () => import('@fontsource/bebas-neue/400.css'),
  'special-elite': () => import('@fontsource/special-elite/400.css'),
  'poiret-one': () => import('@fontsource/poiret-one/400.css'),
  limelight: () => import('@fontsource/limelight/400.css'),
};

const curatedFontCssPromiseCache = new Map<CuratedFontId, Promise<void>>();
const curatedFontBytesCache = new Map<CuratedFontId, Uint8Array>();

export function getCuratedFont(fontId: CuratedFontId): CuratedFontSpec {
  return CURATED_FONT_REGISTRY[fontId] ?? CURATED_FONT_REGISTRY['eb-garamond'];
}

export function getCuratedFontsByGenreGroup(
  genreGroup: FontGenreGroupId,
): readonly CuratedFontSpec[] {
  return CURATED_FONTS.filter((font) => font.genreGroup === genreGroup);
}

/** Lazily loads the `@fontsource` CSS chunk for a curated font (cached per font ID). */
export function ensureCuratedFontLoaded(fontId: CuratedFontId): Promise<void> {
  const existing = curatedFontCssPromiseCache.get(fontId);
  if (existing) return existing;

  const loader = CURATED_FONT_CSS_LOADERS[fontId];
  const promise = (loader ? loader() : Promise.resolve())
    .then(() => undefined)
    .catch(() => {
      curatedFontCssPromiseCache.delete(fontId);
    });
  curatedFontCssPromiseCache.set(fontId, promise);
  return promise;
}

/** Lazily loads CSS chunks for a collection of studio font IDs (ignoring `'custom'`). */
export async function ensureCuratedFontsLoaded(fontIds: Iterable<StudioFontId>): Promise<void> {
  const unique = new Set<CuratedFontId>();
  for (const id of fontIds) {
    if (id !== 'custom') {
      unique.add(id);
    }
  }
  if (unique.size === 0) return;
  await Promise.all(Array.from(unique, (id) => ensureCuratedFontLoaded(id)));
}

/** Lazily loads CSS chunks for every curated font in a genre group. */
export async function ensureGenreFontsLoaded(genreGroup: FontGenreGroupId): Promise<void> {
  const fonts = getCuratedFontsByGenreGroup(genreGroup);
  await Promise.all(fonts.map((font) => ensureCuratedFontLoaded(font.id)));
}

/** Lazily loads CSS chunks for all curated fonts (used when opening font preview menus). */
export async function ensureAllCuratedFontsLoaded(): Promise<void> {
  await Promise.all(CURATED_FONTS.map((font) => ensureCuratedFontLoaded(font.id)));
}

/** Extracts all unique curated font IDs referenced in a cover studio state. */
export function collectStudioCuratedFontIds(
  studio: Pick<CoverStudioState, 'spineText' | 'textLayers'>,
): readonly CuratedFontId[] {
  const unique = new Set<CuratedFontId>();
  if (studio.spineText.fontId !== 'custom') {
    unique.add(studio.spineText.fontId);
  }
  for (const layer of studio.textLayers ?? []) {
    if (layer.fontId !== 'custom') {
      unique.add(layer.fontId);
    }
  }
  return Array.from(unique);
}

export function resolveFontCssFamily(
  fontId: StudioFontId,
  customFont: CustomFontAsset | null,
): string {
  if (fontId === 'custom' && customFont) {
    return `'${customFont.familyName}', Georgia, serif`;
  }
  const safeId: CuratedFontId = fontId === 'custom' ? 'eb-garamond' : fontId;
  return getCuratedFont(safeId).cssFamily;
}

export async function loadCuratedFontBytes(fontId: CuratedFontId): Promise<Uint8Array | null> {
  const cached = curatedFontBytesCache.get(fontId);
  if (cached) return cached;

  const spec = getCuratedFont(fontId);
  try {
    const response = await fetch(spec.woffUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    curatedFontBytesCache.set(fontId, bytes);
    return bytes;
  } catch {
    return null;
  }
}

export function isSupportedCustomFontFile(fileName: string): boolean {
  return /\.(ttf|otf|woff|woff2)$/i.test(fileName);
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read font file.'));
    reader.readAsArrayBuffer(file);
  });
}

export async function registerCustomFontAsset(asset: CustomFontAsset): Promise<void> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return;
  }
  try {
    const bufferCopy = new Uint8Array(asset.bytes.byteLength);
    bufferCopy.set(asset.bytes);
    const fontFace = new FontFace(asset.familyName, bufferCopy.buffer);
    const loaded = await fontFace.load();
    document.fonts.add(loaded);
  } catch {
    // Ignore FontFace registration failures in restricted or headless environments
  }
}

export async function loadCustomFontFromFile(file: File): Promise<CustomFontAsset> {
  if (!isSupportedCustomFontFile(file.name)) {
    throw new Error('Please upload a .ttf, .otf, .woff, or .woff2 font file.');
  }
  const buffer = await readFileAsArrayBuffer(file);
  const bytes = new Uint8Array(buffer);
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  const familyName = `BookbinderCustom-${baseName || 'Font'}`;

  // @pdf-lib/fontkit natively supports .ttf, .otf, and .woff (not brotli .woff2)
  const pdfEmbeddable = !/\.woff2$/i.test(file.name);

  const asset: CustomFontAsset = {
    familyName,
    fileName: file.name,
    bytes,
    pdfEmbeddable,
  };

  await registerCustomFontAsset(asset);
  return asset;
}
