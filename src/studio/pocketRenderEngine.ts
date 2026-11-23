import {
  generateInnerTemplatesPdf,
  planInnerTemplateLayout,
  type InnerPdfLayoutPlan,
  type InnerPieceKind,
} from '@/core/pdfExport';
import type { PageSizeId } from '@/types/bookParams';
import type { CaseGeometry, Polygon2D, Rect2D } from '@/types/geometry';
import type { PocketImageFitMode, PocketStyleConfig } from '@/types/studio';
import { PRINT_DPI, UnitConverter } from '@/types/units';

export interface PocketImagePlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Pure placement helper shared between the live SVG pocket preview and 300 DPI PDF compositor.
 */
export function computePocketImagePlacement(
  targetRect: Rect2D,
  naturalWidth: number,
  naturalHeight: number,
  fitMode: PocketImageFitMode,
  scale: number,
): PocketImagePlacement {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);
  const safeScale = Math.max(0.25, Math.min(2.5, scale));

  if (fitMode === 'tile') {
    const baseTileWidth = Math.max(18, Math.min(targetRect.width, 65) * safeScale);
    const tileHeight = baseTileWidth * (safeH / safeW);
    return {
      x: targetRect.x,
      y: targetRect.y,
      width: baseTileWidth,
      height: Math.max(12, tileHeight),
    };
  }

  const ratioX = targetRect.width / safeW;
  const ratioY = targetRect.height / safeH;
  const baseFactor = fitMode === 'cover' ? Math.max(ratioX, ratioY) : Math.min(ratioX, ratioY);
  const width = safeW * baseFactor * safeScale;
  const height = safeH * baseFactor * safeScale;

  return {
    x: targetRect.x + (targetRect.width - width) / 2,
    y: targetRect.y + (targetRect.height - height) / 2,
    width,
    height,
  };
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode pocket artwork image.'));
    img.src = dataUrl;
  });
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      return new Uint8Array(await blob.arrayBuffer());
    }
  }
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface PieceRenderSpec {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly faceRect: Rect2D;
  readonly fullPolygon: Polygon2D;
}

async function renderStyledPiecePng(
  piece: PieceRenderSpec,
  style: PocketStyleConfig,
  rotated90: boolean,
  loadedImage: HTMLImageElement | null,
  dpi = PRINT_DPI,
): Promise<Uint8Array | null> {
  const outWidthMm = rotated90 ? piece.heightMm : piece.widthMm;
  const outHeightMm = rotated90 ? piece.widthMm : piece.heightMm;
  const pxPerMm = dpi / 25.4;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, UnitConverter.mmToPixels(outWidthMm, dpi));
  canvas.height = Math.max(1, UnitConverter.mmToPixels(outHeightMm, dpi));

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.save();
  if (rotated90) {
    // Matches GeometryPrimitives.rotatePoint90CW(pt, piece.heightMm): (x, y) -> (heightMm - y, x)
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  }

  // Build exact clip path in unrotated piece coordinates
  ctx.beginPath();
  if (style.styleScope === 'full-envelope') {
    piece.fullPolygon.forEach((pt, idx) => {
      const px = pt.x * pxPerMm;
      const py = pt.y * pxPerMm;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  } else {
    ctx.rect(
      piece.faceRect.x * pxPerMm,
      piece.faceRect.y * pxPerMm,
      piece.faceRect.width * pxPerMm,
      piece.faceRect.height * pxPerMm,
    );
  }
  ctx.clip();

  // Fill base endpaper color
  const styleTargetRect: Rect2D =
    style.styleScope === 'full-envelope'
      ? { x: 0, y: 0, width: piece.widthMm, height: piece.heightMm }
      : piece.faceRect;

  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(
    styleTargetRect.x * pxPerMm,
    styleTargetRect.y * pxPerMm,
    styleTargetRect.width * pxPerMm,
    styleTargetRect.height * pxPerMm,
  );

  // Composite optional custom artwork / pattern
  if (loadedImage && style.imageDataUrl) {
    ctx.save();
    ctx.globalAlpha = style.imageOpacity;
    const natW = loadedImage.naturalWidth || style.imageNaturalWidth || 100;
    const natH = loadedImage.naturalHeight || style.imageNaturalHeight || 100;
    const placement = computePocketImagePlacement(
      styleTargetRect,
      natW,
      natH,
      style.imageFitMode,
      style.imageScale,
    );

    if (style.imageFitMode === 'tile') {
      const tileW = Math.max(4, placement.width * pxPerMm);
      const tileH = Math.max(4, placement.height * pxPerMm);
      const startX = styleTargetRect.x * pxPerMm;
      const startY = styleTargetRect.y * pxPerMm;
      const endX = (styleTargetRect.x + styleTargetRect.width) * pxPerMm;
      const endY = (styleTargetRect.y + styleTargetRect.height) * pxPerMm;
      for (let y = startY; y < endY; y += tileH) {
        for (let x = startX; x < endX; x += tileW) {
          ctx.drawImage(loadedImage, x, y, tileW, tileH);
        }
      }
    } else {
      ctx.drawImage(
        loadedImage,
        placement.x * pxPerMm,
        placement.y * pxPerMm,
        placement.width * pxPerMm,
        placement.height * pxPerMm,
      );
    }
    ctx.restore();
  }

  ctx.restore();
  return canvasToPngBytes(canvas);
}

/**
 * Generates a print-ready 1:1 mm auto-paginated Inner Pockets & Spine Liner PDF
 * with styled endpaper color and optional custom artwork rendered at 300 DPI underneath
 * the true vector cut lines, dashed score lines, glue hatches, and 50 × 50 mm calibration square.
 */
export async function generateStyledInnerTemplatesPdf(
  geometry: CaseGeometry,
  pageSizeId: PageSizeId,
  pocketStyle: PocketStyleConfig,
  dpi = PRINT_DPI,
): Promise<{ readonly bytes: Uint8Array; readonly plan: InnerPdfLayoutPlan }> {
  const plan = planInnerTemplateLayout(geometry, pageSizeId);

  let loadedImage: HTMLImageElement | null = null;
  if (pocketStyle.imageDataUrl) {
    try {
      loadedImage = await loadImageElement(pocketStyle.imageDataUrl);
    } catch {
      loadedImage = null;
    }
  }

  const pieceSpecs: Record<Exclude<InnerPieceKind, 'calibration-legend'>, PieceRenderSpec> = {
    'back-pocket': {
      widthMm: geometry.backPocket.totalWidthMm,
      heightMm: geometry.backPocket.totalHeightMm,
      faceRect: geometry.backPocket.faceRect,
      fullPolygon: geometry.backPocket.outerCutPolygon,
    },
    'front-pocket': {
      widthMm: geometry.frontPocket.totalWidthMm,
      heightMm: geometry.frontPocket.totalHeightMm,
      faceRect: geometry.frontPocket.faceRect,
      fullPolygon: geometry.frontPocket.outerCutPolygon,
    },
    'spine-liner': {
      widthMm: geometry.spineLiner.widthMm,
      heightMm: geometry.spineLiner.heightMm,
      faceRect: {
        x: 0,
        y: 0,
        width: geometry.spineLiner.widthMm,
        height: geometry.spineLiner.heightMm,
      },
      fullPolygon: [
        { x: 0, y: 0 },
        { x: geometry.spineLiner.widthMm, y: 0 },
        { x: geometry.spineLiner.widthMm, y: geometry.spineLiner.heightMm },
        { x: 0, y: geometry.spineLiner.heightMm },
      ],
    },
  };

  const pieceArtworkPng: Partial<Record<Exclude<InnerPieceKind, 'calibration-legend'>, Uint8Array>> =
    {};

  for (const placement of plan.placements) {
    if (placement.kind === 'calibration-legend') continue;
    const png = await renderStyledPiecePng(
      pieceSpecs[placement.kind],
      pocketStyle,
      placement.rotated90,
      loadedImage,
      dpi,
    );
    if (png) {
      pieceArtworkPng[placement.kind] = png;
    }
  }

  return generateInnerTemplatesPdf(geometry, pageSizeId, {
    pieceArtworkPng,
    hideFaceTextOnStyled: true,
  });
}
