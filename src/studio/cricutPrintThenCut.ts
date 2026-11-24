import type { PageSizeId } from '@/types/bookParams';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { getLayerVisualRect } from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import {
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  getCoverTextAxisAlignedBounds,
  resolveZoneClipRect,
} from './canvasSpec';
import { getOrnamentSvgStyle } from './classicOrnaments';
import type { CricutCanvasScope } from './cricutExport';
import {
  drawCoverArtworkLayers,
  drawCoverBaseFills,
  drawCoverLettering,
  drawCoverOrnaments,
} from './exporters/coverRasterExporter';
import type { CustomFontAsset } from './fonts';

export interface CricutPrintThenCutOptions {
  readonly scope: CricutCanvasScope;
  readonly includeArtwork: boolean;
  readonly includeLettering: boolean;
  readonly includeOrnaments: boolean;
  readonly includeBaseFill: boolean;
  readonly trimToDesignBounds: boolean;
  readonly mirrorForHtv: boolean;
  readonly dpi?: 300 | 600;
}

export const DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS: Readonly<CricutPrintThenCutOptions> = {
  scope: 'front-cover',
  includeArtwork: true,
  includeLettering: true,
  includeOrnaments: true,
  includeBaseFill: false,
  trimToDesignBounds: false,
  mirrorForHtv: false,
  dpi: 300,
};

/** Cricut Design Space maximum Print Then Cut printable areas (short × long edge in mm). */
export const CRICUT_PTC_SHEET_BOUNDS_MM: Readonly<
  Record<PageSizeId, { readonly shortMm: number; readonly longMm: number; readonly labelIn: string }>
> = {
  letter: { shortMm: 171.45, longMm: 234.95, labelIn: '6.75 × 9.25"' },
  a4: { shortMm: 166.1, longMm: 252.2, labelIn: '6.54 × 9.93"' },
  legal: { shortMm: 171.45, longMm: 311.15, labelIn: '6.75 × 12.25"' },
  tabloid: { shortMm: 234.95, longMm: 387.35, labelIn: '9.25 × 15.25"' },
};

export interface PrintThenCutBoundsSummary {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly widthIn: number;
  readonly heightIn: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly fitsLetter: boolean;
  readonly fitsA4: boolean;
  readonly fitsLegal: boolean;
  readonly fitsTabloid: boolean;
  readonly fitsAnySheet: boolean;
  readonly recommendedSheet: PageSizeId | null;
  readonly fileName: string;
}

export interface CricutPrintThenCutExportResult {
  readonly blob: Blob;
  readonly summary: PrintThenCutBoundsSummary;
}

const TRIM_PADDING_MM = 2.0;

function slugifyTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return cleaned || 'bookbinder';
}

export function buildPrintThenCutFileName(
  studio?: CoverStudioState,
  options?: Partial<CricutPrintThenCutOptions>,
): string {
  const textLayers = studio?.textLayers ?? [];
  const firstCoverText =
    textLayers.find((t) => t.zone === 'front' && t.text.trim().length > 0)?.text ??
    textLayers.find((t) => t.text.trim().length > 0)?.text ??
    '';
  const baseSlug = slugifyTitle(studio?.spineText.title || firstCoverText);
  const scope = options?.scope ?? 'front-cover';
  const scopeSlug =
    scope === 'spine-only'
      ? 'spine'
      : scope === 'front-cover'
        ? 'front'
        : scope === 'back-cover'
          ? 'back'
          : 'fullwrap';
  const trimSlug = options?.trimToDesignBounds ? '_trimmed' : '';
  const mirrorSlug = options?.mirrorForHtv ? '_mirrored' : '';
  return `${baseSlug}_cricut_ptc_${scopeSlug}${trimSlug}${mirrorSlug}.png`;
}

function intersectRects(a: Rect2D, b: Rect2D): Rect2D | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function mergeBounds(a: Rect2D | null, b: Rect2D | null): Rect2D | null {
  if (!a) return b;
  if (!b) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function getBaseScopeBoardRect(geometry: CaseGeometry, scope: CricutCanvasScope): Rect2D {
  const { outerWrap } = geometry;
  const bleedMm = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  switch (scope) {
    case 'front-cover':
      return {
        x: outerWrap.frontBoardRect.x + bleedMm,
        y: outerWrap.frontBoardRect.y + bleedMm,
        width: outerWrap.frontBoardRect.width,
        height: outerWrap.frontBoardRect.height,
      };
    case 'back-cover':
      return {
        x: outerWrap.backBoardRect.x + bleedMm,
        y: outerWrap.backBoardRect.y + bleedMm,
        width: outerWrap.backBoardRect.width,
        height: outerWrap.backBoardRect.height,
      };
    case 'spine-only':
      return {
        x: outerWrap.spineRect.x + bleedMm,
        y: outerWrap.spineRect.y + bleedMm,
        width: outerWrap.spineRect.width,
        height: outerWrap.spineRect.height,
      };
    case 'full-wrap':
      return {
        x: bleedMm,
        y: bleedMm,
        width: outerWrap.widthMm,
        height: outerWrap.heightMm,
      };
  }
}

function computeActiveDesignBoundsInScope(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  options: CricutPrintThenCutOptions,
  baseRect: Rect2D,
): Rect2D | null {
  const spec = computeStudioCanvasSpec(geometry, options.dpi ?? PRINT_DPI);
  let activeBounds: Rect2D | null = null;

  if (options.includeArtwork) {
    for (const layer of studio.layers ?? []) {
      const vis = getLayerVisualRect(layer);
      const clipped =
        layer.clipZone === 'none'
          ? vis
          : intersectRects(vis, resolveZoneClipRect(spec, layer.clipZone));
      if (!clipped) continue;
      const inScope = intersectRects(clipped, baseRect);
      if (inScope) {
        activeBounds = mergeBounds(activeBounds, inScope);
      }
    }
  }

  if (options.includeOrnaments) {
    for (const orn of studio.ornaments ?? []) {
      if (orn.presetId === 'custom-svg' && (!orn.customSvgPaths || orn.customSvgPaths.length === 0)) {
        continue;
      }
      const style = getOrnamentSvgStyle(orn);
      const halfStroke =
        style.stroke !== 'none' && style.strokeWidthMm > 0 ? style.strokeWidthMm / 2 : 0;
      const ornRect: Rect2D = {
        x: orn.xMm - halfStroke,
        y: orn.yMm - halfStroke,
        width: orn.widthMm + halfStroke * 2,
        height: orn.heightMm + halfStroke * 2,
      };
      const inScope = intersectRects(ornRect, baseRect);
      if (inScope) {
        activeBounds = mergeBounds(activeBounds, inScope);
      }
    }
  }

  if (options.includeLettering) {
    for (const textLayer of studio.textLayers ?? []) {
      if (!textLayer.text.trim()) continue;
      const textBounds = getCoverTextAxisAlignedBounds(textLayer);
      const inScope = intersectRects(textBounds, baseRect);
      if (inScope) {
        activeBounds = mergeBounds(activeBounds, inScope);
      }
    }

    if (options.scope === 'spine-only' || options.scope === 'full-wrap') {
      const spinePlacements = computeSpineTextPlacements(geometry, studio);
      for (const item of spinePlacements) {
        if (!item.text.trim()) continue;
        const fontHeightMm = UnitConverter.pointsToMm(item.fontSizePt) * 1.15;
        const estRunWidthMm = Math.max(fontHeightMm, item.text.length * fontHeightMm * 0.62);
        const isVertical = item.rotationDegCss === 90 || item.rotationDegCss === -90;
        const boxW = isVertical ? fontHeightMm : estRunWidthMm;
        const boxH = isVertical ? estRunWidthMm : fontHeightMm;
        const placementRect: Rect2D = {
          x: item.anchorXMm - boxW / 2,
          y: item.anchorYMm - boxH / 2,
          width: boxW,
          height: boxH,
        };
        const inScope = intersectRects(placementRect, baseRect);
        if (inScope) {
          activeBounds = mergeBounds(activeBounds, inScope);
        }
      }
    }
  }

  return activeBounds;
}

/**
 * Resolves the exact millimeter crop rect (in StudioCanvasSpec coordinates) for a
 * Cricut Print Then Cut PNG export. Individual panels strictly target the visible
 * cover board area (excluding rigid-case turn-ins and softcover/dust-jacket flaps & glue tabs).
 * When `trimToDesignBounds` is true, tight-crops around active design elements + 2 mm padding,
 * clamped within the scope rect.
 */
export function resolvePrintThenCutCropRect(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  options: CricutPrintThenCutOptions = DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
): Rect2D {
  const baseRect = getBaseScopeBoardRect(geometry, options.scope);
  if (!options.trimToDesignBounds) {
    return {
      x: roundTo(baseRect.x, 2),
      y: roundTo(baseRect.y, 2),
      width: roundTo(baseRect.width, 2),
      height: roundTo(baseRect.height, 2),
    };
  }

  const activeBounds = computeActiveDesignBoundsInScope(geometry, studio, options, baseRect);
  if (!activeBounds) {
    return {
      x: roundTo(baseRect.x, 2),
      y: roundTo(baseRect.y, 2),
      width: roundTo(baseRect.width, 2),
      height: roundTo(baseRect.height, 2),
    };
  }

  const x1 = Math.max(baseRect.x, activeBounds.x - TRIM_PADDING_MM);
  const y1 = Math.max(baseRect.y, activeBounds.y - TRIM_PADDING_MM);
  const x2 = Math.min(baseRect.x + baseRect.width, activeBounds.x + activeBounds.width + TRIM_PADDING_MM);
  const y2 = Math.min(baseRect.y + baseRect.height, activeBounds.y + activeBounds.height + TRIM_PADDING_MM);

  return {
    x: roundTo(x1, 2),
    y: roundTo(y1, 2),
    width: roundTo(Math.max(1, x2 - x1), 2),
    height: roundTo(Math.max(1, y2 - y1), 2),
  };
}

/** Returns true when at least one active element (or base fill) will render inside the scope rect. */
export function hasPrintThenCutContent(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  options: CricutPrintThenCutOptions = DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
): boolean {
  if (options.includeBaseFill) return true;
  const baseRect = getBaseScopeBoardRect(geometry, options.scope);
  return computeActiveDesignBoundsInScope(geometry, studio, options, baseRect) !== null;
}

/**
 * Evaluates physical Print Then Cut dimensions (portrait or landscape rotation) against
 * Cricut Design Space maximum printable sheet bounds for US Letter, A4, US Legal, and Tabloid.
 */
export function evaluatePrintThenCutBounds(
  widthMm: number,
  heightMm: number,
  meta?: {
    readonly dpi?: 300 | 600;
    readonly studio?: CoverStudioState;
    readonly options?: Partial<CricutPrintThenCutOptions>;
    readonly fileName?: string;
  },
): PrintThenCutBoundsSummary {
  const dpi = meta?.dpi ?? meta?.options?.dpi ?? PRINT_DPI;
  const cleanW = roundTo(Math.max(0.1, widthMm), 2);
  const cleanH = roundTo(Math.max(0.1, heightMm), 2);
  const minSide = Math.min(cleanW, cleanH);
  const maxSide = Math.max(cleanW, cleanH);

  const fitsSheet = (id: PageSizeId): boolean => {
    const bounds = CRICUT_PTC_SHEET_BOUNDS_MM[id];
    return minSide <= bounds.shortMm + 0.05 && maxSide <= bounds.longMm + 0.05;
  };

  const fitsLetter = fitsSheet('letter');
  const fitsA4 = fitsSheet('a4');
  const fitsLegal = fitsSheet('legal');
  const fitsTabloid = fitsSheet('tabloid');
  const fitsAnySheet = fitsLetter || fitsA4 || fitsLegal || fitsTabloid;

  const recommendedSheet: PageSizeId | null = fitsLetter
    ? 'letter'
    : fitsA4
      ? 'a4'
      : fitsLegal
        ? 'legal'
        : fitsTabloid
          ? 'tabloid'
          : null;

  return {
    widthMm: cleanW,
    heightMm: cleanH,
    widthIn: roundTo(UnitConverter.mmToInches(cleanW), 2),
    heightIn: roundTo(UnitConverter.mmToInches(cleanH), 2),
    pixelWidth: Math.max(1, UnitConverter.mmToPixels(cleanW, dpi)),
    pixelHeight: Math.max(1, UnitConverter.mmToPixels(cleanH, dpi)),
    fitsLetter,
    fitsA4,
    fitsLegal,
    fitsTabloid,
    fitsAnySheet,
    recommendedSheet,
    fileName: meta?.fileName ?? buildPrintThenCutFileName(meta?.studio, meta?.options),
  };
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function writeUint32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length + 12) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Injects (or replaces) a valid CRC32 PNG `pHYs` physical pixel dimensions chunk
 * immediately after `IHDR`, encoding exact pixels-per-meter (`Math.round(dpi / 0.0254)`, unit=1)
 * so print & cutting apps recognize exact 1:1 physical dimensions automatically.
 */
export function injectPngDpiChunk(pngBytes: Uint8Array, dpi: number): Uint8Array {
  if (!isPngSignature(pngBytes)) {
    return pngBytes;
  }

  const ppm = Math.max(1, Math.round(dpi / 0.0254));
  // pHYs chunk: 4B len (9) + 4B type ('pHYs') + 9B data (xPpm, yPpm, unit=1) + 4B CRC32 = 21 bytes
  const physChunk = new Uint8Array(21);
  writeUint32BE(physChunk, 0, 9);
  physChunk[4] = 0x70; // 'p'
  physChunk[5] = 0x48; // 'H'
  physChunk[6] = 0x59; // 'Y'
  physChunk[7] = 0x73; // 's'
  writeUint32BE(physChunk, 8, ppm);
  writeUint32BE(physChunk, 12, ppm);
  physChunk[16] = 1; // unit specifier: meters
  const crc = computeCrc32(physChunk.subarray(4, 17));
  writeUint32BE(physChunk, 17, crc);

  const chunks: Uint8Array[] = [pngBytes.subarray(0, 8)];
  let offset = 8;
  let inserted = false;

  while (offset + 12 <= pngBytes.length) {
    const dataLen = readUint32BE(pngBytes, offset);
    const totalChunkLen = 12 + dataLen;
    if (offset + totalChunkLen > pngBytes.length) {
      return pngBytes;
    }

    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7],
    );

    if (type !== 'pHYs') {
      chunks.push(pngBytes.subarray(offset, offset + totalChunkLen));
      if (type === 'IHDR' && !inserted) {
        chunks.push(physChunk);
        inserted = true;
      }
    }

    offset += totalChunkLen;
    if (type === 'IEND') break;
  }

  if (!inserted) {
    return pngBytes;
  }

  const totalSize = chunks.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of chunks) {
    output.set(part, cursor);
    cursor += part.byteLength;
  }
  return output;
}

/**
 * Renders the selected Cricut Print Then Cut panel onto an HTMLCanvasElement
 * with alpha transparency (unless `includeBaseFill` is enabled) and optional horizontal HTV mirror.
 */
export async function renderCricutPrintThenCutCanvas(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  options: CricutPrintThenCutOptions = DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
  renderDpi?: number,
): Promise<{ readonly canvas: HTMLCanvasElement; readonly cropRect: Rect2D }> {
  const dpi = renderDpi ?? options.dpi ?? PRINT_DPI;
  const cropRect = resolvePrintThenCutCropRect(geometry, studio, options);
  const spec = computeStudioCanvasSpec(geometry, dpi);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, UnitConverter.mmToPixels(cropRect.width, dpi));
  canvas.height = Math.max(1, UnitConverter.mmToPixels(cropRect.height, dpi));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D rendering context for Print Then Cut export.');
  }

  const pxPerMm = dpi / 25.4;

  ctx.save();
  if (options.mirrorForHtv) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.translate(-cropRect.x * pxPerMm, -cropRect.y * pxPerMm);

  if (options.includeBaseFill) {
    drawCoverBaseFills(ctx, spec, studio, pxPerMm);
  }
  if (options.includeArtwork) {
    await drawCoverArtworkLayers(ctx, spec, studio, pxPerMm);
  }
  if (options.includeOrnaments) {
    drawCoverOrnaments(ctx, studio, pxPerMm);
  }
  if (options.includeLettering) {
    drawCoverLettering(ctx, geometry, studio, customFont, dpi, pxPerMm);
  }

  ctx.restore();

  return { canvas, cropRect };
}

/**
 * Exports a transparent 300/600 DPI PNG with an embedded `pHYs` DPI chunk ready for
 * Cricut Design Space Print Then Cut (Printable HTV / Siser EasyColor DTV).
 */
export async function exportCricutPrintThenCutPng(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  options: CricutPrintThenCutOptions = DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
): Promise<CricutPrintThenCutExportResult> {
  const dpi = options.dpi ?? PRINT_DPI;
  const { canvas, cropRect } = await renderCricutPrintThenCutCanvas(
    geometry,
    studio,
    customFont,
    options,
    dpi,
  );

  const rawBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Failed to encode ${dpi} DPI Print Then Cut PNG.`));
    }, 'image/png');
  });

  const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
  const withDpiBytes = injectPngDpiChunk(rawBytes, dpi);
  const finalBytes = new Uint8Array(withDpiBytes.byteLength);
  finalBytes.set(withDpiBytes);
  const blob = new Blob([finalBytes], { type: 'image/png' });

  const summary = evaluatePrintThenCutBounds(cropRect.width, cropRect.height, {
    dpi,
    studio,
    options,
  });

  return { blob, summary };
}
