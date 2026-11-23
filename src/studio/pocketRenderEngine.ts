import {
  generateInnerTemplatesPdf,
  planInnerTemplateLayout,
  type InnerPdfLayoutPlan,
  type InnerPieceKind,
} from '@/core/pdfExport';
import { canvasToPngBytes, loadHtmlImage } from '@/lib/canvasImage';
import type { PageSizeId } from '@/types/bookParams';
import type { CaseGeometry, Polygon2D, Rect2D } from '@/types/geometry';
import type { PocketImageFitMode, PocketStyleConfig } from '@/types/studio';
import type { CoverImageLayer } from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter } from '@/types/units';

export interface PocketImagePlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface InnerPocketsLayout {
  readonly backX: number;
  readonly linerX: number;
  readonly linerY: number;
  readonly frontX: number;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  readonly padMm: number;
  readonly viewBoxRect: Rect2D;
  readonly viewBox: string;
  readonly backFaceRect: Rect2D;
  readonly backFullRect: Rect2D;
  readonly linerRect: Rect2D;
  readonly frontFaceRect: Rect2D;
  readonly frontFullRect: Rect2D;
}

/**
 * Single source of truth for the 1:1 mm layout of Back Pocket, Spine Liner, and Front Pocket
 * on the Inner Pockets cutting mat (shared by live SVG canvas, snap targets, and 300 DPI PDF export).
 */
export function computeInnerPocketsLayout(geometry: CaseGeometry): InnerPocketsLayout {
  const gap = 18;
  const padMm = 16;
  const { backPocket, spineLiner, frontPocket } = geometry;
  const backX = 0;
  const linerX = backPocket.totalWidthMm + gap;
  const frontX = linerX + spineLiner.widthMm + gap;
  const totalWidthMm = frontX + frontPocket.totalWidthMm;
  const totalHeightMm = Math.max(
    backPocket.totalHeightMm,
    spineLiner.heightMm,
    frontPocket.totalHeightMm,
  );
  const linerY = (totalHeightMm - spineLiner.heightMm) / 2;
  const viewBoxRect: Rect2D = {
    x: -padMm,
    y: -padMm,
    width: totalWidthMm + padMm * 2,
    height: totalHeightMm + padMm * 2,
  };

  return {
    backX,
    linerX,
    linerY,
    frontX,
    totalWidthMm,
    totalHeightMm,
    padMm,
    viewBoxRect,
    viewBox: `${viewBoxRect.x} ${viewBoxRect.y} ${viewBoxRect.width} ${viewBoxRect.height}`,
    backFaceRect: {
      x: backX + backPocket.faceRect.x,
      y: backPocket.faceRect.y,
      width: backPocket.faceRect.width,
      height: backPocket.faceRect.height,
    },
    backFullRect: {
      x: backX,
      y: 0,
      width: backPocket.totalWidthMm,
      height: backPocket.totalHeightMm,
    },
    linerRect: {
      x: linerX,
      y: linerY,
      width: spineLiner.widthMm,
      height: spineLiner.heightMm,
    },
    frontFaceRect: {
      x: frontX + frontPocket.faceRect.x,
      y: frontPocket.faceRect.y,
      width: frontPocket.faceRect.width,
      height: frontPocket.faceRect.height,
    },
    frontFullRect: {
      x: frontX,
      y: 0,
      width: frontPocket.totalWidthMm,
      height: frontPocket.totalHeightMm,
    },
  };
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

interface PieceRenderSpec {
  readonly offsetX: number;
  readonly offsetY: number;
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
  loadedLayers: readonly { readonly layer: CoverImageLayer; readonly image: HTMLImageElement }[],
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

  // Composite interactive multi-layer artwork positioned in the shared 1:1 mm inner pockets layout
  if (loadedLayers.length > 0) {
    ctx.save();
    ctx.globalAlpha = style.imageOpacity;
    for (const { layer, image } of loadedLayers) {
      const localX = layer.xMm - piece.offsetX;
      const localY = layer.yMm - piece.offsetY;
      const drawLayerImage = (dx: number, dy: number, dw: number, dh: number) => {
        if (layer.flipX || layer.flipY) {
          ctx.save();
          ctx.translate(dx + dw / 2, dy + dh / 2);
          ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
          ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        } else {
          ctx.drawImage(image, dx, dy, dw, dh);
        }
      };
      if (layer.tiled) {
        const tileW = Math.max(8, layer.widthMm) * pxPerMm;
        const tileH = Math.max(8, layer.heightMm) * pxPerMm;
        const originX = (((localX * pxPerMm) % tileW) + tileW) % tileW;
        const originY = (((localY * pxPerMm) % tileH) + tileH) % tileH;
        const startX = originX > 0 ? originX - tileW : 0;
        const startY = originY > 0 ? originY - tileH : 0;
        const endX = piece.widthMm * pxPerMm;
        const endY = piece.heightMm * pxPerMm;
        for (let y = startY; y < endY; y += tileH) {
          for (let x = startX; x < endX; x += tileW) {
            drawLayerImage(x, y, tileW, tileH);
          }
        }
      } else {
        drawLayerImage(
          localX * pxPerMm,
          localY * pxPerMm,
          layer.widthMm * pxPerMm,
          layer.heightMm * pxPerMm,
        );
      }
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
  options?: { readonly includeLegend?: boolean; readonly includeGuides?: boolean },
): Promise<{ readonly bytes: Uint8Array; readonly plan: InnerPdfLayoutPlan }> {
  const includeLegend = options?.includeLegend ?? false;
  const includeGuides = options?.includeGuides ?? true;
  const plan = planInnerTemplateLayout(geometry, pageSizeId, { includeLegend });
  const layout = computeInnerPocketsLayout(geometry);

  let loadedImage: HTMLImageElement | null = null;
  if (pocketStyle.imageDataUrl) {
    try {
      loadedImage = await loadHtmlImage(
        pocketStyle.imageDataUrl,
        'Failed to decode pocket artwork image.',
      );
    } catch {
      loadedImage = null;
    }
  }

  const loadedLayers: { readonly layer: CoverImageLayer; readonly image: HTMLImageElement }[] = [];
  for (const layer of pocketStyle.layers ?? []) {
    try {
      const image = await loadHtmlImage(layer.dataUrl, 'Failed to decode pocket artwork image.');
      loadedLayers.push({ layer, image });
    } catch {
      // Skip unreadable layer gracefully
    }
  }

  const pieceSpecs: Record<Exclude<InnerPieceKind, 'calibration-legend'>, PieceRenderSpec> = {
    'back-pocket': {
      offsetX: layout.backX,
      offsetY: 0,
      widthMm: geometry.backPocket.totalWidthMm,
      heightMm: geometry.backPocket.totalHeightMm,
      faceRect: geometry.backPocket.faceRect,
      fullPolygon: geometry.backPocket.outerCutPolygon,
    },
    'front-pocket': {
      offsetX: layout.frontX,
      offsetY: 0,
      widthMm: geometry.frontPocket.totalWidthMm,
      heightMm: geometry.frontPocket.totalHeightMm,
      faceRect: geometry.frontPocket.faceRect,
      fullPolygon: geometry.frontPocket.outerCutPolygon,
    },
    'spine-liner': {
      offsetX: layout.linerX,
      offsetY: layout.linerY,
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
      loadedLayers,
      dpi,
    );
    if (png) {
      pieceArtworkPng[placement.kind] = png;
    }
  }

  return generateInnerTemplatesPdf(geometry, pageSizeId, {
    pieceArtworkPng,
    hideFaceTextOnStyled: true,
    includeLegend,
    includeGuides,
  });
}
