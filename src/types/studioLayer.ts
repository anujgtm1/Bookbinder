import type { Rect2D } from './geometry';
import { clampFinite, roundTo } from './units';

export type LayerClipZone = 'none' | 'front' | 'spine' | 'back';
export type QuickFitTarget = 'front' | 'spine' | 'back' | 'fullWrap';
export type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';
export type StubExtensionMode = 'none' | 'edge-smear' | 'soft-mirror' | 'mirror';

export interface CoverImageLayer {
  readonly id: string;
  readonly dataUrl: string;
  readonly fileName: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly clipZone: LayerClipZone;
  /** Preserved original uploaded image when turn-in/pasting-stub edge extension is active */
  readonly originalDataUrl?: string;
  readonly originalWidth?: number;
  readonly originalHeight?: number;
  readonly stubExtensionMode?: StubExtensionMode;
  readonly stubExtensionSide?: 'front' | 'back';
}

export const LAYER_MIN_SIZE_MM = 12;
export const LAYER_MAX_SIZE_MM = 2000;

function generateLayerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseClipZone(value: unknown): LayerClipZone {
  if (value === 'front' || value === 'spine' || value === 'back') return value;
  return 'none';
}

function parseStubExtensionMode(value: unknown): StubExtensionMode | undefined {
  if (value === 'none' || value === 'edge-smear' || value === 'soft-mirror' || value === 'mirror') {
    return value;
  }
  return undefined;
}

export const CoverImageLayerModel = {
  createInRect(input: {
    readonly id?: string;
    readonly dataUrl: string;
    readonly fileName: string;
    readonly naturalWidth: number;
    readonly naturalHeight: number;
    readonly targetRect: Rect2D;
    readonly clipZone?: LayerClipZone;
    readonly mode?: 'cover' | 'contain';
  }): CoverImageLayer {
    const natW = Math.max(1, input.naturalWidth);
    const natH = Math.max(1, input.naturalHeight);
    const scale =
      input.mode === 'contain'
        ? Math.min(input.targetRect.width / natW, input.targetRect.height / natH)
        : Math.max(input.targetRect.width / natW, input.targetRect.height / natH);

    const widthMm = roundTo(
      Math.min(LAYER_MAX_SIZE_MM, Math.max(LAYER_MIN_SIZE_MM, natW * scale)),
      2,
    );
    const heightMm = roundTo(
      Math.min(LAYER_MAX_SIZE_MM, Math.max(LAYER_MIN_SIZE_MM, natH * scale)),
      2,
    );

    return {
      id: input.id ?? generateLayerId(),
      dataUrl: input.dataUrl,
      fileName: input.fileName || 'cover-image.png',
      naturalWidth: natW,
      naturalHeight: natH,
      xMm: roundTo(input.targetRect.x + (input.targetRect.width - widthMm) / 2, 2),
      yMm: roundTo(input.targetRect.y + (input.targetRect.height - heightMm) / 2, 2),
      widthMm,
      heightMm,
      clipZone: input.clipZone ?? 'none',
    };
  },

  fitToRect(
    layer: CoverImageLayer,
    targetRect: Rect2D,
    clipZone: LayerClipZone = layer.clipZone,
  ): CoverImageLayer {
    const fitted = this.createInRect({
      id: layer.id,
      dataUrl: layer.dataUrl,
      fileName: layer.fileName,
      naturalWidth: layer.naturalWidth,
      naturalHeight: layer.naturalHeight,
      targetRect,
      clipZone,
      mode: 'cover',
    });
    return {
      ...fitted,
      originalDataUrl: layer.originalDataUrl,
      originalWidth: layer.originalWidth,
      originalHeight: layer.originalHeight,
      stubExtensionMode: layer.stubExtensionMode,
      stubExtensionSide: layer.stubExtensionSide,
    };
  },

  moveBy(layer: CoverImageLayer, dxMm: number, dyMm: number): CoverImageLayer {
    return {
      ...layer,
      xMm: roundTo(clampFinite(layer.xMm + dxMm, layer.xMm, -1500, 1500), 2),
      yMm: roundTo(clampFinite(layer.yMm + dyMm, layer.yMm, -1500, 1500), 2),
    };
  },

  scaleAroundCenter(layer: CoverImageLayer, factor: number): CoverImageLayer {
    if (!Number.isFinite(factor) || factor <= 0) return layer;
    const aspect = layer.naturalWidth / Math.max(1, layer.naturalHeight);
    let nextW = layer.widthMm * factor;
    let nextH = nextW / aspect;

    if (nextW < LAYER_MIN_SIZE_MM || nextH < LAYER_MIN_SIZE_MM) {
      if (aspect >= 1) {
        nextH = LAYER_MIN_SIZE_MM;
        nextW = nextH * aspect;
      } else {
        nextW = LAYER_MIN_SIZE_MM;
        nextH = nextW / aspect;
      }
    }
    if (nextW > LAYER_MAX_SIZE_MM || nextH > LAYER_MAX_SIZE_MM) {
      if (aspect >= 1) {
        nextW = LAYER_MAX_SIZE_MM;
        nextH = nextW / aspect;
      } else {
        nextH = LAYER_MAX_SIZE_MM;
        nextW = nextH * aspect;
      }
    }

    const cx = layer.xMm + layer.widthMm / 2;
    const cy = layer.yMm + layer.heightMm / 2;

    return {
      ...layer,
      xMm: roundTo(cx - nextW / 2, 2),
      yMm: roundTo(cy - nextH / 2, 2),
      widthMm: roundTo(nextW, 2),
      heightMm: roundTo(nextH, 2),
    };
  },

  /** Proportional resize dragging one corner handle while keeping the opposite corner anchored. */
  resizeFromCorner(
    layer: CoverImageLayer,
    corner: ResizeCorner,
    pointerXMm: number,
    pointerYMm: number,
  ): CoverImageLayer {
    const aspect = layer.naturalWidth / Math.max(1, layer.naturalHeight);
    const left = layer.xMm;
    const right = layer.xMm + layer.widthMm;
    const top = layer.yMm;
    const bottom = layer.yMm + layer.heightMm;

    const anchorX = corner === 'nw' || corner === 'sw' ? right : left;
    const anchorY = corner === 'nw' || corner === 'ne' ? bottom : top;

    const rawW = Math.max(LAYER_MIN_SIZE_MM, Math.abs(pointerXMm - anchorX));
    const rawH = Math.max(LAYER_MIN_SIZE_MM, Math.abs(pointerYMm - anchorY));

    // Preserve aspect ratio using whichever axis grew more proportionally
    let nextW: number;
    let nextH: number;
    if (rawW / aspect >= rawH) {
      nextW = Math.min(LAYER_MAX_SIZE_MM, rawW);
      nextH = nextW / aspect;
    } else {
      nextH = Math.min(LAYER_MAX_SIZE_MM, rawH);
      nextW = nextH * aspect;
    }

    const nextX = corner === 'nw' || corner === 'sw' ? anchorX - nextW : anchorX;
    const nextY = corner === 'nw' || corner === 'ne' ? anchorY - nextH : anchorY;

    return {
      ...layer,
      xMm: roundTo(nextX, 2),
      yMm: roundTo(nextY, 2),
      widthMm: roundTo(nextW, 2),
      heightMm: roundTo(nextH, 2),
    };
  },

  reorder(
    layers: readonly CoverImageLayer[],
    id: string,
    direction: 'forward' | 'backward',
  ): CoverImageLayer[] {
    const idx = layers.findIndex((l) => l.id === id);
    if (idx === -1) return [...layers];
    const targetIdx = direction === 'forward' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= layers.length) return [...layers];
    const next = [...layers];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    return next;
  },

  deserialize(raw: unknown): CoverImageLayer | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.dataUrl !== 'string' || !obj.dataUrl.startsWith('data:image/')) {
      return null;
    }
    const naturalWidth =
      typeof obj.naturalWidth === 'number' && obj.naturalWidth > 0 ? obj.naturalWidth : 1000;
    const naturalHeight =
      typeof obj.naturalHeight === 'number' && obj.naturalHeight > 0 ? obj.naturalHeight : 1000;

    const originalDataUrl =
      typeof obj.originalDataUrl === 'string' && obj.originalDataUrl.startsWith('data:image/')
        ? obj.originalDataUrl
        : undefined;

    return {
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id : generateLayerId(),
      dataUrl: obj.dataUrl,
      fileName: typeof obj.fileName === 'string' ? obj.fileName : 'cover-image.png',
      naturalWidth,
      naturalHeight,
      xMm: clampFinite(obj.xMm, 0, -1500, 1500),
      yMm: clampFinite(obj.yMm, 0, -1500, 1500),
      widthMm: clampFinite(obj.widthMm, 120, LAYER_MIN_SIZE_MM, LAYER_MAX_SIZE_MM),
      heightMm: clampFinite(obj.heightMm, 180, LAYER_MIN_SIZE_MM, LAYER_MAX_SIZE_MM),
      clipZone: parseClipZone(obj.clipZone),
      originalDataUrl,
      originalWidth:
        originalDataUrl && typeof obj.originalWidth === 'number' && obj.originalWidth > 0
          ? obj.originalWidth
          : undefined,
      originalHeight:
        originalDataUrl && typeof obj.originalHeight === 'number' && obj.originalHeight > 0
          ? obj.originalHeight
          : undefined,
      stubExtensionMode: parseStubExtensionMode(obj.stubExtensionMode),
      stubExtensionSide:
        obj.stubExtensionSide === 'front' || obj.stubExtensionSide === 'back'
          ? obj.stubExtensionSide
          : undefined,
    };
  },
} as const;
