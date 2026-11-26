import { loadHtmlImage } from '@/lib/canvasImage';
import type { CoverOrnamentLayer, CoverTextLayer } from '@/types/coverElements';
import type { CaseGeometry } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { normalizeQuarterTurn, type CoverImageLayer } from '@/types/studioLayer';
import { PRINT_DPI } from '@/types/units';
import {
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  resolveZoneClipRect,
  type StudioCanvasSpec,
} from '../canvasSpec';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from '../classicOrnaments';
import {
  awaitFontFaceLoaded,
  collectStudioCuratedFontIds,
  ensureCuratedFontsLoaded,
  resolveFontCssFamily,
  type CustomFontAsset,
} from '../fonts';
import { resolveOrderedStudioElements } from '../layerStack';

/** Draws the solid Back, Spine, and Front cover base fills onto a 2D canvas in studio mm space. */
export function drawCoverBaseFills(
  ctx: CanvasRenderingContext2D,
  spec: StudioCanvasSpec,
  studio: CoverStudioState,
  pxPerMm: number,
): void {
  const toPx = (mm: number) => mm * pxPerMm;

  ctx.fillStyle = studio.backBgColor;
  ctx.fillRect(
    toPx(spec.backZoneRect.x),
    toPx(spec.backZoneRect.y),
    toPx(spec.backZoneRect.width),
    toPx(spec.backZoneRect.height),
  );

  ctx.fillStyle = studio.spineBgColor;
  ctx.fillRect(
    toPx(spec.spineZoneRect.x),
    toPx(spec.spineZoneRect.y),
    toPx(spec.spineZoneRect.width),
    toPx(spec.spineZoneRect.height),
  );

  ctx.fillStyle = studio.frontBgColor;
  ctx.fillRect(
    toPx(spec.frontZoneRect.x),
    toPx(spec.frontZoneRect.y),
    toPx(spec.frontZoneRect.width),
    toPx(spec.frontZoneRect.height),
  );
}

/** Draws a single uploaded cover image layer honoring zone clip mask, flips, quarter-turns, and dim scrim. */
export async function drawSingleCoverImageLayer(
  ctx: CanvasRenderingContext2D,
  spec: StudioCanvasSpec,
  layer: CoverImageLayer,
  pxPerMm: number,
): Promise<void> {
  const toPx = (mm: number) => mm * pxPerMm;
  const clipRect = resolveZoneClipRect(spec, layer.clipZone);
  const img = await loadHtmlImage(layer.dataUrl);
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    toPx(clipRect.x),
    toPx(clipRect.y),
    toPx(clipRect.width),
    toPx(clipRect.height),
  );
  ctx.clip();
  const layerRot = normalizeQuarterTurn(layer.rotationDeg);
  if (layer.flipX || layer.flipY || layerRot !== 0) {
    const cx = toPx(layer.xMm + layer.widthMm / 2);
    const cy = toPx(layer.yMm + layer.heightMm / 2);
    const wPx = toPx(layer.widthMm);
    const hPx = toPx(layer.heightMm);
    ctx.translate(cx, cy);
    if (layerRot !== 0) {
      ctx.rotate((layerRot * Math.PI) / 180);
    }
    if (layer.flipX || layer.flipY) {
      ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
    }
    ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx);
  } else {
    ctx.drawImage(
      img,
      toPx(layer.xMm),
      toPx(layer.yMm),
      toPx(layer.widthMm),
      toPx(layer.heightMm),
    );
  }
  if (layer.dimOpacity && layer.dimOpacity > 0) {
    ctx.fillStyle = `rgba(10, 12, 16, ${layer.dimOpacity})`;
    ctx.fillRect(
      toPx(clipRect.x),
      toPx(clipRect.y),
      toPx(clipRect.width),
      toPx(clipRect.height),
    );
  }
  ctx.restore();
}

/**
 * Renders a contiguous slice of image layers onto a transparent full-cover canvas
 * so interleaved PDF exports can composite images above crisp vector text/ornaments.
 */
export async function renderCoverImageSliceCanvas(
  spec: StudioCanvasSpec,
  layersSlice: readonly CoverImageLayer[],
  dpi: number = PRINT_DPI,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = spec.pixelWidth;
  canvas.height = spec.pixelHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D rendering context for cover image slice.');
  }
  const pxPerMm = dpi / 25.4;
  for (const layer of layersSlice) {
    await drawSingleCoverImageLayer(ctx, spec, layer, pxPerMm);
  }
  return canvas;
}

/** Draws a single classic bookbindery vector ornament or custom SVG stamp in studio mm space. */
export function drawSingleCoverOrnament(
  ctx: CanvasRenderingContext2D,
  orn: CoverOrnamentLayer,
  pxPerMm: number,
): void {
  const compoundD = buildOrnamentCompoundPath(orn);
  if (!compoundD || typeof Path2D === 'undefined') return;
  const style = getOrnamentSvgStyle(orn);
  const path2d = new Path2D(compoundD);
  ctx.save();
  ctx.scale(pxPerMm, pxPerMm);
  if (style.fill !== 'none') {
    ctx.fillStyle = style.fill;
    ctx.fill(path2d);
  }
  if (style.stroke !== 'none' && style.strokeWidthMm > 0) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidthMm;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(path2d);
  }
  ctx.restore();
}

/** Draws a single draggable Front / Back / Spine cover text layer. */
export function drawSingleCoverTextLayer(
  ctx: CanvasRenderingContext2D,
  textLayer: CoverTextLayer,
  customFont: CustomFontAsset | null,
  dpi: number,
  pxPerMm: number,
): void {
  const toPx = (mm: number) => mm * pxPerMm;
  const fontFamily = resolveFontCssFamily(textLayer.fontId, customFont);
  const lineItems = computeCoverTextLinePlacements(textLayer);
  ctx.save();
  const textRot = normalizeQuarterTurn(textLayer.rotationDeg);
  if (textLayer.flipX || textLayer.flipY || textRot !== 0) {
    const cx = toPx(textLayer.xMm);
    const cy = toPx(textLayer.yMm);
    ctx.translate(cx, cy);
    if (textRot !== 0) {
      ctx.rotate((textRot * Math.PI) / 180);
    }
    if (textLayer.flipX || textLayer.flipY) {
      ctx.scale(textLayer.flipX ? -1 : 1, textLayer.flipY ? -1 : 1);
    }
    ctx.translate(-cx, -cy);
  }
  ctx.fillStyle = textLayer.color;
  ctx.textAlign = textLayer.align;
  ctx.textBaseline = 'middle';

  for (const item of lineItems) {
    if (!item.text.trim()) continue;
    const fontSizePx = (item.fontSizePt / 72) * dpi;
    ctx.save();
    ctx.font = `400 ${fontSizePx}px ${fontFamily}`;
    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${item.letterSpacingEm}em`;
    }
    ctx.fillText(item.text, toPx(item.anchorXMm), toPx(item.anchorYMm));
    ctx.restore();
  }
  ctx.restore();
}

/** Draws dedicated spine typography centered on the spine panel. */
export function drawDedicatedSpineTypography(
  ctx: CanvasRenderingContext2D,
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  dpi: number,
  pxPerMm: number,
): void {
  const toPx = (mm: number) => mm * pxPerMm;
  const placements = computeSpineTextPlacements(geometry, studio);
  const fontFamily = resolveFontCssFamily(studio.spineText.fontId, customFont);
  ctx.fillStyle = studio.spineText.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const item of placements) {
    const fontSizePx = (item.fontSizePt / 72) * dpi;
    ctx.save();
    ctx.translate(toPx(item.anchorXMm), toPx(item.anchorYMm));
    ctx.rotate((item.rotationDegCss * Math.PI) / 180);
    ctx.font = `400 ${fontSizePx}px ${fontFamily}`;
    ctx.fillText(item.text, 0, 0);
    ctx.restore();
  }
}

/** Draws all uploaded cover artwork layers in resolved bottom-to-top order. */
export async function drawCoverArtworkLayers(
  ctx: CanvasRenderingContext2D,
  spec: StudioCanvasSpec,
  studio: CoverStudioState,
  pxPerMm: number,
): Promise<void> {
  for (const item of resolveOrderedStudioElements(studio)) {
    if (item.kind !== 'image') continue;
    await drawSingleCoverImageLayer(ctx, spec, item.layer, pxPerMm);
  }
}

/** Draws classic bookbindery vector ornaments and custom SVG stamps in studio mm space. */
export function drawCoverOrnaments(
  ctx: CanvasRenderingContext2D,
  studio: CoverStudioState,
  pxPerMm: number,
): void {
  for (const item of resolveOrderedStudioElements(studio)) {
    if (item.kind !== 'ornament') continue;
    drawSingleCoverOrnament(ctx, item.layer, pxPerMm);
  }
}

/** Draws draggable Front / Back / Spine cover text layers and dedicated spine typography. */
export function drawCoverLettering(
  ctx: CanvasRenderingContext2D,
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  dpi: number,
  pxPerMm: number,
): void {
  for (const item of resolveOrderedStudioElements(studio)) {
    if (item.kind !== 'text') continue;
    drawSingleCoverTextLayer(ctx, item.layer, customFont, dpi, pxPerMm);
  }
  drawDedicatedSpineTypography(ctx, geometry, studio, customFont, dpi, pxPerMm);
}

export async function renderCoverArtworkCanvas(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  options: {
    readonly includeSpineText: boolean;
    readonly includeTextAndOrnaments?: boolean;
    readonly dpi?: number;
  },
): Promise<HTMLCanvasElement> {
  const dpi = options.dpi ?? PRINT_DPI;
  const spec = computeStudioCanvasSpec(geometry, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = spec.pixelWidth;
  canvas.height = spec.pixelHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D rendering context for cover export.');
  }

  const pxPerMm = dpi / 25.4;

  // 1. Solid zone backgrounds
  drawCoverBaseFills(ctx, spec, studio, pxPerMm);

  // 2. Render cover elements in exact unified bottom-to-top layerOrder
  const includeTextAndOrnaments = options.includeTextAndOrnaments ?? true;
  if (options.includeSpineText && includeTextAndOrnaments) {
    await ensureCuratedFontsLoaded(collectStudioCuratedFontIds(studio));
    if (customFont) {
      await awaitFontFaceLoaded(`400 16px '${customFont.familyName}'`);
    }
    for (const item of resolveOrderedStudioElements(studio)) {
      if (item.kind === 'image') {
        await drawSingleCoverImageLayer(ctx, spec, item.layer, pxPerMm);
      } else if (item.kind === 'ornament') {
        drawSingleCoverOrnament(ctx, item.layer, pxPerMm);
      } else {
        drawSingleCoverTextLayer(ctx, item.layer, customFont, dpi, pxPerMm);
      }
    }
    drawDedicatedSpineTypography(ctx, geometry, studio, customFont, dpi, pxPerMm);
  } else {
    // Raster-only base (used when PDF/SVG exporter draws crisp vectors separately)
    await drawCoverArtworkLayers(ctx, spec, studio, pxPerMm);
  }

  return canvas;
}

export async function exportCoverPng300Dpi(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  dpi: 300 | 600 = PRINT_DPI,
): Promise<Blob> {
  const canvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
    includeSpineText: true,
    dpi,
  });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Failed to encode ${dpi} DPI PNG blob.`));
    }, 'image/png');
  });
}
