import type { CaseGeometry, Rect2D } from '@/types/geometry';
import type { CoverImageLayer, StubExtensionMode } from '@/types/studioLayer';
import { PRINT_DPI, roundTo } from '@/types/units';
import { computeStudioCanvasSpec } from './renderEngine';

export type StubExtensionSide = 'front' | 'back';

export interface StubExtensionPlan {
  readonly side: StubExtensionSide;
  readonly boardRectMm: Rect2D;
  readonly zoneRectMm: Rect2D;
  readonly pxPerMm: number;
  readonly boardWidthPx: number;
  readonly boardHeightPx: number;
  readonly padLeftPx: number;
  readonly padRightPx: number;
  readonly padTopPx: number;
  readonly padBottomPx: number;
  readonly totalWidthPx: number;
  readonly totalHeightPx: number;
}

const MAX_OUTPUT_DIMENSION_PX = 3600;

/**
 * Computes the exact pixel layout so the untouched source cover maps 1:1 onto
 * `boardRect` while the synthesized pasting-stub margins cover 100% of `zoneRect`
 * (turn-in + bleed + hinge overlap).
 */
export function computeStubExtensionPlan(
  geometry: CaseGeometry,
  side: StubExtensionSide,
  sourceWidthPx: number,
  sourceHeightPx: number,
): StubExtensionPlan {
  const spec = computeStudioCanvasSpec(geometry, PRINT_DPI);
  const rawBoard =
    side === 'front' ? geometry.outerWrap.frontBoardRect : geometry.outerWrap.backBoardRect;
  const boardRectMm: Rect2D = {
    x: rawBoard.x + spec.bleedMm,
    y: rawBoard.y + spec.bleedMm,
    width: rawBoard.width,
    height: rawBoard.height,
  };
  const zoneRectMm: Rect2D = side === 'front' ? spec.frontZoneRect : spec.backZoneRect;

  const safeSrcW = Math.max(16, sourceWidthPx);
  const safeSrcH = Math.max(16, sourceHeightPx);

  // Choose pixel density matching the source image on the board, capped cleanly at 300 DPI / max canvas size
  const naturalPxPerMm = Math.max(safeSrcW / boardRectMm.width, safeSrcH / boardRectMm.height);
  const maxPxPerMm = Math.min(
    PRINT_DPI / 25.4,
    MAX_OUTPUT_DIMENSION_PX / Math.max(zoneRectMm.width, zoneRectMm.height),
  );
  const pxPerMm = Math.max(2, Math.min(naturalPxPerMm, maxPxPerMm));

  const boardWidthPx = Math.max(16, Math.round(boardRectMm.width * pxPerMm));
  const boardHeightPx = Math.max(16, Math.round(boardRectMm.height * pxPerMm));
  const padLeftPx = Math.max(0, Math.round(Math.max(0, boardRectMm.x - zoneRectMm.x) * pxPerMm));
  const padRightPx = Math.max(
    0,
    Math.round(
      Math.max(0, zoneRectMm.x + zoneRectMm.width - (boardRectMm.x + boardRectMm.width)) * pxPerMm,
    ),
  );
  const padTopPx = Math.max(0, Math.round(Math.max(0, boardRectMm.y - zoneRectMm.y) * pxPerMm));
  const padBottomPx = Math.max(
    0,
    Math.round(
      Math.max(0, zoneRectMm.y + zoneRectMm.height - (boardRectMm.y + boardRectMm.height)) *
        pxPerMm,
    ),
  );

  return {
    side,
    boardRectMm,
    zoneRectMm,
    pxPerMm: roundTo(pxPerMm, 3),
    boardWidthPx,
    boardHeightPx,
    padLeftPx,
    padRightPx,
    padTopPx,
    padBottomPx,
    totalWidthPx: padLeftPx + boardWidthPx + padRightPx,
    totalHeightPx: padTopPx + boardHeightPx + padBottomPx,
  };
}

/** Detects whether a layer currently sits closer to the Front Cover or Back Cover. */
export function detectLayerCoverSide(
  layer: CoverImageLayer,
  geometry: CaseGeometry,
): StubExtensionSide {
  if (layer.stubExtensionSide) return layer.stubExtensionSide;
  if (layer.clipZone === 'back') return 'back';
  if (layer.clipZone === 'front') return 'front';
  const spec = computeStudioCanvasSpec(geometry, PRINT_DPI);
  const centerX = layer.xMm + layer.widthMm / 2;
  const spineMidX = spec.spineZoneRect.x + spec.spineZoneRect.width / 2;
  return centerX < spineMidX ? 'back' : 'front';
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode cover artwork for edge extension.'));
    img.src = dataUrl;
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Renders the untouched cover cropped-to-fill `boardWidthPx × boardHeightPx`
 * so all edge synthesis reads exact aligned board perimeter pixels.
 */
function renderBoardSourceCanvas(
  img: HTMLImageElement,
  boardWidthPx: number,
  boardHeightPx: number,
): HTMLCanvasElement {
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = boardWidthPx;
  boardCanvas.height = boardHeightPx;
  const bCtx = boardCanvas.getContext('2d');
  if (!bCtx) return boardCanvas;

  const natW = Math.max(1, img.naturalWidth);
  const natH = Math.max(1, img.naturalHeight);
  const scale = Math.max(boardWidthPx / natW, boardHeightPx / natH);
  const drawW = natW * scale;
  const drawH = natH * scale;
  const dx = (boardWidthPx - drawW) / 2;
  const dy = (boardHeightPx - drawH) / 2;

  bCtx.imageSmoothingEnabled = true;
  bCtx.imageSmoothingQuality = 'high';
  bCtx.drawImage(img, dx, dy, drawW, drawH);
  return boardCanvas;
}

function drawEdgeSmearStub(
  ctx: CanvasRenderingContext2D,
  boardCanvas: HTMLCanvasElement,
  plan: StubExtensionPlan,
): void {
  const { boardWidthPx: bw, boardHeightPx: bh, padLeftPx: pl, padRightPx: pr, padTopPx: pt, padBottomPx: pb } =
    plan;
  // Tiny safety inset skips 1-3 px scanner/JPEG compression borders on downloaded covers
  const inset = Math.min(Math.floor(Math.min(bw, bh) * 0.08), Math.max(1, Math.round(Math.min(bw, bh) * 0.006)));
  const strip = Math.max(1, Math.min(4, Math.floor(Math.min(bw, bh) / 8)));
  const innerX = inset;
  const innerY = inset;
  const innerRight = Math.max(innerX + 1, bw - inset - strip);
  const innerBottom = Math.max(innerY + 1, bh - inset - strip);

  ctx.save();
  ctx.filter = 'blur(2px)';

  // Top & Bottom gradient stretch
  if (pt > 0) {
    ctx.drawImage(boardCanvas, 0, innerY, bw, strip, pl, 0, bw, pt + 2);
  }
  if (pb > 0) {
    ctx.drawImage(boardCanvas, 0, innerBottom, bw, strip, pl, pt + bh - 2, bw, pb + 2);
  }

  // Left & Right gradient stretch
  if (pl > 0) {
    ctx.drawImage(boardCanvas, innerX, 0, strip, bh, 0, pt, pl + 2, bh);
  }
  if (pr > 0) {
    ctx.drawImage(boardCanvas, innerRight, 0, strip, bh, pl + bw - 2, pt, pr + 2, bh);
  }

  // 4 Corners stretched from inset corner blocks
  if (pl > 0 && pt > 0) {
    ctx.drawImage(boardCanvas, innerX, innerY, strip, strip, 0, 0, pl + 2, pt + 2);
  }
  if (pr > 0 && pt > 0) {
    ctx.drawImage(boardCanvas, innerRight, innerY, strip, strip, pl + bw - 2, 0, pr + 2, pt + 2);
  }
  if (pl > 0 && pb > 0) {
    ctx.drawImage(boardCanvas, innerX, innerBottom, strip, strip, 0, pt + bh - 2, pl + 2, pb + 2);
  }
  if (pr > 0 && pb > 0) {
    ctx.drawImage(
      boardCanvas,
      innerRight,
      innerBottom,
      strip,
      strip,
      pl + bw - 2,
      pt + bh - 2,
      pr + 2,
      pb + 2,
    );
  }

  ctx.restore();
}

function drawMirroredStub(
  ctx: CanvasRenderingContext2D,
  boardCanvas: HTMLCanvasElement,
  plan: StubExtensionPlan,
  softBlur: boolean,
): void {
  const { boardWidthPx: bw, boardHeightPx: bh, padLeftPx: pl, padRightPx: pr, padTopPx: pt, padBottomPx: pb } =
    plan;
  const inset = Math.min(Math.floor(Math.min(bw, bh) * 0.05), Math.max(0, Math.round(Math.min(bw, bh) * 0.004)));

  ctx.save();
  if (softBlur) {
    ctx.filter = 'blur(3.5px)';
  }

  // Top mirror
  if (pt > 0) {
    const srcH = Math.min(bh - inset, Math.max(1, pt));
    ctx.save();
    ctx.translate(pl, pt);
    ctx.scale(1, -1);
    ctx.drawImage(boardCanvas, 0, inset, bw, srcH, 0, 0, bw, pt);
    ctx.restore();
  }

  // Bottom mirror
  if (pb > 0) {
    const srcH = Math.min(bh - inset, Math.max(1, pb));
    ctx.save();
    ctx.translate(pl, pt + bh);
    ctx.scale(1, -1);
    ctx.drawImage(boardCanvas, 0, bh - inset - srcH, bw, srcH, 0, -pb, bw, pb);
    ctx.restore();
  }

  // Left mirror
  if (pl > 0) {
    const srcW = Math.min(bw - inset, Math.max(1, pl));
    ctx.save();
    ctx.translate(pl, pt);
    ctx.scale(-1, 1);
    ctx.drawImage(boardCanvas, inset, 0, srcW, bh, 0, 0, pl, bh);
    ctx.restore();
  }

  // Right mirror
  if (pr > 0) {
    const srcW = Math.min(bw - inset, Math.max(1, pr));
    ctx.save();
    ctx.translate(pl + bw, pt);
    ctx.scale(-1, 1);
    ctx.drawImage(boardCanvas, bw - inset - srcW, 0, srcW, bh, -pr, 0, pr, bh);
    ctx.restore();
  }

  // 4 Reflected Corners
  if (pl > 0 && pt > 0) {
    const sw = Math.min(bw - inset, Math.max(1, pl));
    const sh = Math.min(bh - inset, Math.max(1, pt));
    ctx.save();
    ctx.translate(pl, pt);
    ctx.scale(-1, -1);
    ctx.drawImage(boardCanvas, inset, inset, sw, sh, 0, 0, pl, pt);
    ctx.restore();
  }
  if (pr > 0 && pt > 0) {
    const sw = Math.min(bw - inset, Math.max(1, pr));
    const sh = Math.min(bh - inset, Math.max(1, pt));
    ctx.save();
    ctx.translate(pl + bw, pt);
    ctx.scale(-1, -1);
    ctx.drawImage(boardCanvas, bw - inset - sw, inset, sw, sh, -pr, 0, pr, pt);
    ctx.restore();
  }
  if (pl > 0 && pb > 0) {
    const sw = Math.min(bw - inset, Math.max(1, pl));
    const sh = Math.min(bh - inset, Math.max(1, pb));
    ctx.save();
    ctx.translate(pl, pt + bh);
    ctx.scale(-1, -1);
    ctx.drawImage(boardCanvas, inset, bh - inset - sh, sw, sh, 0, -pb, pl, pb);
    ctx.restore();
  }
  if (pr > 0 && pb > 0) {
    const sw = Math.min(bw - inset, Math.max(1, pr));
    const sh = Math.min(bh - inset, Math.max(1, pb));
    ctx.save();
    ctx.translate(pl + bw, pt + bh);
    ctx.scale(-1, -1);
    ctx.drawImage(boardCanvas, bw - inset - sw, bh - inset - sh, sw, sh, -pr, -pb, pr, pb);
    ctx.restore();
  }

  ctx.restore();
}

export interface ExtendedLayerResult {
  readonly layer: CoverImageLayer;
  readonly sampledSpineEdgeHex: string | null;
}

/**
 * Non-destructively applies (or reverts) Turn-In / Pasting Stub edge extension to a cover layer.
 * Keeps the untouched source artwork aligned 1:1 to `boardRect` while filling 100% of `zoneRect`.
 */
export async function applyStubExtensionToLayer(
  layer: CoverImageLayer,
  geometry: CaseGeometry,
  side: StubExtensionSide,
  mode: StubExtensionMode,
): Promise<ExtendedLayerResult> {
  const sourceDataUrl = layer.originalDataUrl ?? layer.dataUrl;
  const sourceWidth = layer.originalWidth ?? layer.naturalWidth;
  const sourceHeight = layer.originalHeight ?? layer.naturalHeight;
  const plan = computeStubExtensionPlan(geometry, side, sourceWidth, sourceHeight);

  if (mode === 'none') {
    // Revert cleanly to untouched original image fitted onto the chipboard face
    return {
      layer: {
        ...layer,
        dataUrl: sourceDataUrl,
        naturalWidth: sourceWidth,
        naturalHeight: sourceHeight,
        xMm: roundTo(plan.boardRectMm.x, 2),
        yMm: roundTo(plan.boardRectMm.y, 2),
        widthMm: roundTo(plan.boardRectMm.width, 2),
        heightMm: roundTo(plan.boardRectMm.height, 2),
        originalDataUrl: undefined,
        originalWidth: undefined,
        originalHeight: undefined,
        stubExtensionMode: 'none',
        stubExtensionSide: side,
      },
      sampledSpineEdgeHex: null,
    };
  }

  const img = await loadImage(sourceDataUrl);
  const boardCanvas = renderBoardSourceCanvas(img, plan.boardWidthPx, plan.boardHeightPx);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = plan.totalWidthPx;
  outCanvas.height = plan.totalHeightPx;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  if (mode === 'edge-smear') {
    drawEdgeSmearStub(ctx, boardCanvas, plan);
  } else {
    drawMirroredStub(ctx, boardCanvas, plan, mode === 'soft-mirror');
  }

  // Paint the razor-sharp untouched original cover directly over the board region
  ctx.drawImage(boardCanvas, plan.padLeftPx, plan.padTopPx);

  // Sample average spine-facing edge color so the user can also match Spine & Back seamlessly
  let sampledSpineEdgeHex: string | null = null;
  try {
    const bCtx = boardCanvas.getContext('2d');
    if (bCtx) {
      const insetX = Math.max(2, Math.round(plan.boardWidthPx * 0.01));
      const sampleX = side === 'front' ? insetX : Math.max(0, plan.boardWidthPx - insetX - 4);
      const data = bCtx.getImageData(sampleX, 0, Math.min(4, plan.boardWidthPx), plan.boardHeightPx).data;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        count++;
      }
      if (count > 0) {
        sampledSpineEdgeHex = rgbToHex(rSum / count, gSum / count, bSum / count);
      }
    }
  } catch {
    sampledSpineEdgeHex = null;
  }

  // Export high-quality JPEG (or PNG if source was PNG with transparency) to keep memory compact
  const usePng = sourceDataUrl.startsWith('data:image/png');
  const extendedDataUrl = usePng
    ? outCanvas.toDataURL('image/png')
    : outCanvas.toDataURL('image/jpeg', 0.94);

  return {
    layer: {
      ...layer,
      dataUrl: extendedDataUrl,
      naturalWidth: plan.totalWidthPx,
      naturalHeight: plan.totalHeightPx,
      xMm: roundTo(plan.zoneRectMm.x, 2),
      yMm: roundTo(plan.zoneRectMm.y, 2),
      widthMm: roundTo(plan.zoneRectMm.width, 2),
      heightMm: roundTo(plan.zoneRectMm.height, 2),
      clipZone: side,
      originalDataUrl: sourceDataUrl,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      stubExtensionMode: mode,
      stubExtensionSide: side,
    },
    sampledSpineEdgeHex,
  };
}
