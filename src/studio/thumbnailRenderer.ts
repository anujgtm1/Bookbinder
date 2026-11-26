import type { CaseGeometry } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { MM_PER_INCH, clampFinite } from '@/types/units';
import { renderCoverArtworkCanvas } from './exporters/coverRasterExporter';
import type { CustomFontAsset } from './fonts';

export const DEFAULT_THUMBNAIL_MAX_WIDTH_PX = 240;
export const DEFAULT_THUMBNAIL_QUALITY = 0.78;

const MIN_THUMBNAIL_WIDTH_PX = 32;
const MAX_THUMBNAIL_WIDTH_PX = 1024;
const MIN_THUMBNAIL_DPI = 12;
const MAX_THUMBNAIL_DPI = 150;

export interface ThumbnailRenderOptions {
  readonly maxWidthPx?: number;
  readonly quality?: number;
  readonly customFont?: CustomFontAsset | null;
}

export interface ThumbnailDimensions {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly renderDpi: number;
}

export function computeThumbnailDimensions(
  geometry: CaseGeometry,
  maxWidthPx: number = DEFAULT_THUMBNAIL_MAX_WIDTH_PX,
): ThumbnailDimensions {
  const { outerWrap } = geometry;
  const bleedMm = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const totalWidthMm = Math.max(1, outerWrap.widthMm + bleedMm * 2);
  const totalHeightMm = Math.max(1, outerWrap.heightMm + bleedMm * 2);

  const clampedMaxWidth = Math.round(
    clampFinite(
      maxWidthPx,
      DEFAULT_THUMBNAIL_MAX_WIDTH_PX,
      MIN_THUMBNAIL_WIDTH_PX,
      MAX_THUMBNAIL_WIDTH_PX,
    ),
  );
  const heightPx = Math.max(1, Math.round((clampedMaxWidth * totalHeightMm) / totalWidthMm));
  const rawDpi = (clampedMaxWidth / totalWidthMm) * MM_PER_INCH;
  const renderDpi = clampFinite(rawDpi, MIN_THUMBNAIL_DPI, MIN_THUMBNAIL_DPI, MAX_THUMBNAIL_DPI);

  return {
    widthPx: clampedMaxWidth,
    heightPx,
    renderDpi,
  };
}

function hasCanvas2DSupport(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    return probe.getContext('2d') !== null;
  } catch {
    return false;
  }
}

function scaleCanvasToThumbnail(
  source: HTMLCanvasElement,
  targetWidthPx: number,
  targetHeightPx: number,
): HTMLCanvasElement | null {
  if (source.width <= targetWidthPx && source.height <= targetHeightPx) {
    return source;
  }
  const scaled = document.createElement('canvas');
  scaled.width = targetWidthPx;
  scaled.height = targetHeightPx;
  const ctx = scaled.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidthPx, targetHeightPx);
  return scaled;
}

export async function renderProjectThumbnailDataUrl(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  options?: ThumbnailRenderOptions,
): Promise<string | null> {
  if (!hasCanvas2DSupport()) {
    return null;
  }

  const dims = computeThumbnailDimensions(geometry, options?.maxWidthPx);
  const quality = clampFinite(options?.quality, DEFAULT_THUMBNAIL_QUALITY, 0.1, 1);

  try {
    const rendered = await renderCoverArtworkCanvas(
      geometry,
      studio,
      options?.customFont ?? null,
      {
        includeSpineText: true,
        includeTextAndOrnaments: true,
        dpi: dims.renderDpi,
      },
    );

    const outputCanvas = scaleCanvasToThumbnail(rendered, dims.widthPx, dims.heightPx);
    if (!outputCanvas) {
      return null;
    }

    const dataUrl = outputCanvas.toDataURL('image/jpeg', quality);
    return dataUrl.startsWith('data:image/') ? dataUrl : null;
  } catch {
    return null;
  }
}
