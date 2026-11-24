import { loadHtmlImage } from '@/lib/canvasImage';
import type { CaseGeometry } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { normalizeQuarterTurn } from '@/types/studioLayer';
import { PRINT_DPI } from '@/types/units';
import {
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  resolveZoneClipRect,
} from '../canvasSpec';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from '../classicOrnaments';
import { resolveFontCssFamily, type CustomFontAsset } from '../fonts';

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
  const toPx = (mm: number) => mm * pxPerMm;

  // 1. Solid zone backgrounds
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

  // 2. Uploaded free-form artwork layers rendered bottom-to-top
  for (const layer of studio.layers) {
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
    ctx.restore();
  }

  // 3. Optional rasterized classic ornaments, cover text layers & spine typography (used for 300 DPI PNG export)
  const includeTextAndOrnaments = options.includeTextAndOrnaments ?? true;
  if (options.includeSpineText && includeTextAndOrnaments) {
    // 3a. Classic Bookbindery Vector Ornaments & Custom SVG Stamps
    for (const orn of studio.ornaments ?? []) {
      const compoundD = buildOrnamentCompoundPath(orn);
      if (!compoundD || typeof Path2D === 'undefined') continue;
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

    // 3b. Draggable Front / Back / Spine Cover Text Layers
    for (const textLayer of studio.textLayers ?? []) {
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

    // 3c. Dedicated Spine Typography
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
