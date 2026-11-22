import cormorantWoffUrl from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff?url';
import ebGaramondWoffUrl from '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url';
import interWoffUrl from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import libreBaskervilleWoffUrl from '@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff?url';
import loraWoffUrl from '@fontsource/lora/files/lora-latin-400-normal.woff?url';
import montserratWoffUrl from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff?url';
import type { CuratedFontId, StudioFontId } from '@/types/studio';

export interface CuratedFontSpec {
  readonly id: CuratedFontId;
  readonly label: string;
  readonly cssFamily: string;
  readonly category: 'serif' | 'sans-serif';
  readonly woffUrl: string;
}

export interface CustomFontAsset {
  readonly familyName: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly pdfEmbeddable: boolean;
}

export const CURATED_FONTS: readonly CuratedFontSpec[] = [
  {
    id: 'eb-garamond',
    label: 'EB Garamond',
    cssFamily: "'EB Garamond', Georgia, serif",
    category: 'serif',
    woffUrl: ebGaramondWoffUrl,
  },
  {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    cssFamily: "'Libre Baskerville', Georgia, serif",
    category: 'serif',
    woffUrl: libreBaskervilleWoffUrl,
  },
  {
    id: 'cormorant-garamond',
    label: 'Cormorant Garamond',
    cssFamily: "'Cormorant Garamond', Georgia, serif",
    category: 'serif',
    woffUrl: cormorantWoffUrl,
  },
  {
    id: 'lora',
    label: 'Lora',
    cssFamily: "'Lora', Georgia, serif",
    category: 'serif',
    woffUrl: loraWoffUrl,
  },
  {
    id: 'inter',
    label: 'Inter',
    cssFamily: "'Inter', system-ui, sans-serif",
    category: 'sans-serif',
    woffUrl: interWoffUrl,
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    cssFamily: "'Montserrat', system-ui, sans-serif",
    category: 'sans-serif',
    woffUrl: montserratWoffUrl,
  },
] as const;

const curatedFontBytesCache = new Map<CuratedFontId, Uint8Array>();

export function getCuratedFont(fontId: CuratedFontId): CuratedFontSpec {
  return CURATED_FONTS.find((f) => f.id === fontId) ?? CURATED_FONTS[0];
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

export async function loadCustomFontFromFile(file: File): Promise<CustomFontAsset> {
  if (!isSupportedCustomFontFile(file.name)) {
    throw new Error('Please upload a .ttf, .otf, .woff, or .woff2 font file.');
  }
  const buffer = await readFileAsArrayBuffer(file);
  const bytes = new Uint8Array(buffer);
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  const familyName = `BookbinderCustom-${baseName || 'Font'}`;

  if (typeof FontFace !== 'undefined' && typeof document !== 'undefined' && document.fonts) {
    const fontFace = new FontFace(familyName, buffer);
    const loaded = await fontFace.load();
    document.fonts.add(loaded);
  }

  // @pdf-lib/fontkit natively supports .ttf, .otf, and .woff (not brotli .woff2)
  const pdfEmbeddable = !/\.woff2$/i.test(file.name);

  return {
    familyName,
    fileName: file.name,
    bytes,
    pdfEmbeddable,
  };
}
