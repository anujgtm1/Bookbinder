import type { CoverOrnamentLayer, CoverTextLayer } from '@/types/coverElements';
import type { Rect2D } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { getLayerVisualRect, type CoverImageLayer } from '@/types/studioLayer';
import { roundTo } from '@/types/units';
import {
  getCoverTextAxisAlignedBounds,
  inferZoneFromCenterX,
  type StudioCanvasSpec,
} from './canvasSpec';
import { cloneSnapshot } from './hooks/useStudioHistory';

export const DEFAULT_PASTE_OFFSET_MM = 6;
export const NUDGE_STEP_MM = 1;
export const NUDGE_SHIFT_STEP_MM = 5;

export type StudioClipboardItem =
  | { readonly kind: 'cover-image'; readonly layer: CoverImageLayer }
  | { readonly kind: 'cover-text'; readonly layer: CoverTextLayer }
  | { readonly kind: 'cover-ornament'; readonly layer: CoverOrnamentLayer }
  | { readonly kind: 'pocket-image'; readonly layer: CoverImageLayer };

export interface StudioElementSelection {
  readonly imageId: string | null;
  readonly textId: string | null;
  readonly ornamentId: string | null;
}

export interface StudioPasteResult {
  readonly studio: CoverStudioState;
  readonly pastedId: string;
  readonly pastedKind: 'image' | 'text' | 'ornament';
}

export interface PocketPasteResult {
  readonly layers: readonly CoverImageLayer[];
  readonly pastedId: string;
}

const EDITABLE_TAG_NAMES = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

let fallbackIdCounter = 0;

function generateUniqueId(prefix: string, existingIds: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `${prefix}-${crypto.randomUUID()}`
        : `${prefix}-${Date.now()}-${(++fallbackIdCounter).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  let suffix = ++fallbackIdCounter;
  while (existingIds.has(`${prefix}-${suffix}`)) {
    suffix = ++fallbackIdCounter;
  }
  return `${prefix}-${suffix}`;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolvePasteOffsetMm(pasteIndex?: number): number {
  const index =
    typeof pasteIndex === 'number' && Number.isFinite(pasteIndex) && pasteIndex >= 0
      ? pasteIndex
      : 1;
  return DEFAULT_PASTE_OFFSET_MM * index;
}

function clampImagePosition(
  layer: CoverImageLayer,
  dxMm: number,
  dyMm: number,
  canvasBounds: Rect2D,
): { readonly xMm: number; readonly yMm: number } {
  const vis = getLayerVisualRect(layer);
  const minVisX = Math.min(canvasBounds.x, canvasBounds.x + canvasBounds.width - vis.width);
  const maxVisX = Math.max(canvasBounds.x, canvasBounds.x + canvasBounds.width - vis.width);
  const minVisY = Math.min(canvasBounds.y, canvasBounds.y + canvasBounds.height - vis.height);
  const maxVisY = Math.max(canvasBounds.y, canvasBounds.y + canvasBounds.height - vis.height);

  const nextVisX = clampValue(vis.x + dxMm, minVisX, maxVisX);
  const nextVisY = clampValue(vis.y + dyMm, minVisY, maxVisY);

  const appliedDx = nextVisX - vis.x;
  const appliedDy = nextVisY - vis.y;

  return {
    xMm: roundTo(layer.xMm + appliedDx, 2),
    yMm: roundTo(layer.yMm + appliedDy, 2),
  };
}

function clampTextPosition(
  layer: CoverTextLayer,
  dxMm: number,
  dyMm: number,
  canvasBounds: Rect2D,
): { readonly xMm: number; readonly yMm: number } {
  const minX = canvasBounds.x;
  const maxX = canvasBounds.x + canvasBounds.width;
  const minY = canvasBounds.y;
  const maxY = canvasBounds.y + canvasBounds.height;

  return {
    xMm: roundTo(clampValue(layer.xMm + dxMm, minX, maxX), 2),
    yMm: roundTo(clampValue(layer.yMm + dyMm, minY, maxY), 2),
  };
}

function clampOrnamentPosition(
  layer: CoverOrnamentLayer,
  dxMm: number,
  dyMm: number,
  canvasBounds: Rect2D,
): { readonly xMm: number; readonly yMm: number } {
  const minX = Math.min(canvasBounds.x, canvasBounds.x + canvasBounds.width - layer.widthMm);
  const maxX = Math.max(canvasBounds.x, canvasBounds.x + canvasBounds.width - layer.widthMm);
  const minY = Math.min(canvasBounds.y, canvasBounds.y + canvasBounds.height - layer.heightMm);
  const maxY = Math.max(canvasBounds.y, canvasBounds.y + canvasBounds.height - layer.heightMm);

  return {
    xMm: roundTo(clampValue(layer.xMm + dxMm, minX, maxX), 2),
    yMm: roundTo(clampValue(layer.yMm + dyMm, minY, maxY), 2),
  };
}

export function createClipboardItemFromSelection(
  studio: CoverStudioState,
  selection: StudioElementSelection,
): StudioClipboardItem | null {
  if (selection.imageId) {
    const image = studio.layers.find((layer) => layer.id === selection.imageId);
    if (image) {
      return { kind: 'cover-image', layer: cloneSnapshot(image) };
    }
  }

  if (selection.textId) {
    const text = studio.textLayers.find((layer) => layer.id === selection.textId);
    if (text) {
      return { kind: 'cover-text', layer: cloneSnapshot(text) };
    }
  }

  if (selection.ornamentId) {
    const ornament = studio.ornaments.find((layer) => layer.id === selection.ornamentId);
    if (ornament) {
      return { kind: 'cover-ornament', layer: cloneSnapshot(ornament) };
    }
  }

  return null;
}

export function createPocketClipboardItem(
  layers: readonly CoverImageLayer[],
  selectedId: string | null,
): StudioClipboardItem | null {
  if (!selectedId) return null;
  const layer = layers.find((item) => item.id === selectedId);
  if (!layer) return null;
  return { kind: 'pocket-image', layer: cloneSnapshot(layer) };
}

export function pasteClipboardItemToStudio(
  studio: CoverStudioState,
  item: StudioClipboardItem,
  canvasBounds: Rect2D,
  pasteIndex?: number,
  spec?: StudioCanvasSpec,
): StudioPasteResult | null {
  const offsetMm = resolvePasteOffsetMm(pasteIndex);

  if (item.kind === 'cover-image') {
    const cloned = cloneSnapshot(item.layer);
    const existingIds = new Set(studio.layers.map((layer) => layer.id));
    const pastedId = generateUniqueId('layer', existingIds);
    const pos = clampImagePosition(cloned, offsetMm, offsetMm, canvasBounds);
    const pasted: CoverImageLayer = {
      ...cloned,
      id: pastedId,
      xMm: pos.xMm,
      yMm: pos.yMm,
    };
    return {
      studio: {
        ...studio,
        layers: [...studio.layers, pasted],
      },
      pastedId,
      pastedKind: 'image',
    };
  }

  if (item.kind === 'cover-text') {
    const cloned = cloneSnapshot(item.layer);
    const existingIds = new Set(studio.textLayers.map((layer) => layer.id));
    const pastedId = generateUniqueId('txt', existingIds);
    const pos = clampTextPosition(cloned, offsetMm, offsetMm, canvasBounds);
    const movedText: CoverTextLayer = {
      ...cloned,
      id: pastedId,
      xMm: pos.xMm,
      yMm: pos.yMm,
    };
    const pasted: CoverTextLayer = spec
      ? {
          ...movedText,
          zone: inferZoneFromCenterX(
            (() => {
              const b = getCoverTextAxisAlignedBounds(movedText);
              return b.x + b.width / 2;
            })(),
            spec,
          ),
        }
      : movedText;
    return {
      studio: {
        ...studio,
        textLayers: [...studio.textLayers, pasted],
      },
      pastedId,
      pastedKind: 'text',
    };
  }

  if (item.kind === 'cover-ornament') {
    const cloned = cloneSnapshot(item.layer);
    const existingIds = new Set(studio.ornaments.map((layer) => layer.id));
    const prefix = cloned.presetId === 'custom-svg' ? 'svg' : 'orn';
    const pastedId = generateUniqueId(prefix, existingIds);
    const pos = clampOrnamentPosition(cloned, offsetMm, offsetMm, canvasBounds);
    const pasted: CoverOrnamentLayer = {
      ...cloned,
      id: pastedId,
      xMm: pos.xMm,
      yMm: pos.yMm,
      zone: spec ? inferZoneFromCenterX(pos.xMm + cloned.widthMm / 2, spec) : cloned.zone,
    };
    return {
      studio: {
        ...studio,
        ornaments: [...studio.ornaments, pasted],
      },
      pastedId,
      pastedKind: 'ornament',
    };
  }

  return null;
}

export function duplicateSelectedInStudio(
  studio: CoverStudioState,
  selection: StudioElementSelection,
  canvasBounds: Rect2D,
  spec?: StudioCanvasSpec,
): StudioPasteResult | null {
  const item = createClipboardItemFromSelection(studio, selection);
  if (!item) return null;
  return pasteClipboardItemToStudio(studio, item, canvasBounds, 1, spec);
}

export function pasteClipboardItemToPockets(
  layers: readonly CoverImageLayer[],
  item: StudioClipboardItem,
  canvasBounds: Rect2D,
  pasteIndex?: number,
): PocketPasteResult | null {
  if (item.kind !== 'pocket-image') {
    return null;
  }

  const offsetMm = resolvePasteOffsetMm(pasteIndex);
  const cloned = cloneSnapshot(item.layer);
  const existingIds = new Set(layers.map((layer) => layer.id));
  const pastedId = generateUniqueId('pocket', existingIds);
  const pos = clampImagePosition(cloned, offsetMm, offsetMm, canvasBounds);
  const pasted: CoverImageLayer = {
    ...cloned,
    id: pastedId,
    xMm: pos.xMm,
    yMm: pos.yMm,
  };

  return {
    layers: [...layers, pasted],
    pastedId,
  };
}

export function nudgeSelectedInStudio(
  studio: CoverStudioState,
  selection: StudioElementSelection,
  dxMm: number,
  dyMm: number,
  canvasBounds: Rect2D,
  spec?: StudioCanvasSpec,
): CoverStudioState | null {
  if (!Number.isFinite(dxMm) || !Number.isFinite(dyMm)) {
    return null;
  }

  if (selection.imageId) {
    const idx = studio.layers.findIndex((layer) => layer.id === selection.imageId);
    if (idx !== -1) {
      const target = studio.layers[idx];
      const pos = clampImagePosition(target, dxMm, dyMm, canvasBounds);
      const nextLayers = studio.layers.map((layer, i) =>
        i === idx ? { ...layer, xMm: pos.xMm, yMm: pos.yMm } : layer,
      );
      return { ...studio, layers: nextLayers };
    }
  }

  if (selection.textId) {
    const idx = studio.textLayers.findIndex((layer) => layer.id === selection.textId);
    if (idx !== -1) {
      const target = studio.textLayers[idx];
      const pos = clampTextPosition(target, dxMm, dyMm, canvasBounds);
      const nextTextLayers = studio.textLayers.map((layer, i) => {
        if (i !== idx) return layer;
        const moved = { ...layer, xMm: pos.xMm, yMm: pos.yMm };
        if (!spec) return moved;
        const bounds = getCoverTextAxisAlignedBounds(moved);
        return { ...moved, zone: inferZoneFromCenterX(bounds.x + bounds.width / 2, spec) };
      });
      return { ...studio, textLayers: nextTextLayers };
    }
  }

  if (selection.ornamentId) {
    const idx = studio.ornaments.findIndex((layer) => layer.id === selection.ornamentId);
    if (idx !== -1) {
      const target = studio.ornaments[idx];
      const pos = clampOrnamentPosition(target, dxMm, dyMm, canvasBounds);
      const nextOrnaments = studio.ornaments.map((layer, i) =>
        i === idx
          ? {
              ...layer,
              xMm: pos.xMm,
              yMm: pos.yMm,
              zone: spec ? inferZoneFromCenterX(pos.xMm + layer.widthMm / 2, spec) : layer.zone,
            }
          : layer,
      );
      return { ...studio, ornaments: nextOrnaments };
    }
  }

  return null;
}

export function nudgeSelectedInPockets(
  layers: readonly CoverImageLayer[],
  selectedId: string | null,
  dxMm: number,
  dyMm: number,
  canvasBounds: Rect2D,
): readonly CoverImageLayer[] | null {
  if (!selectedId || !Number.isFinite(dxMm) || !Number.isFinite(dyMm)) {
    return null;
  }

  const idx = layers.findIndex((layer) => layer.id === selectedId);
  if (idx === -1) {
    return null;
  }

  const target = layers[idx];
  const pos = clampImagePosition(target, dxMm, dyMm, canvasBounds);
  return layers.map((layer, i) =>
    i === idx ? { ...layer, xMm: pos.xMm, yMm: pos.yMm } : layer,
  );
}

interface ElementLike {
  readonly tagName?: string;
  readonly nodeType?: number;
  readonly parentElement?: ElementLike | null;
  readonly isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
}

/**
 * Returns true when keyboard focus is inside an editable form control or `contentEditable`
 * region so global studio shortcuts (Undo/Redo/Copy/Paste/Duplicate/Arrows) never hijack typing.
 */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const candidate = target as ElementLike;
  let element: ElementLike | null =
    candidate.nodeType === 3 ? (candidate.parentElement ?? null) : candidate;

  if (!element || typeof element.tagName !== 'string') {
    return false;
  }

  if (EDITABLE_TAG_NAMES.has(element.tagName.toUpperCase())) {
    return true;
  }

  while (element) {
    const attr =
      typeof element.getAttribute === 'function' ? element.getAttribute('contenteditable') : null;
    if (attr !== null && attr !== undefined) {
      const normalized = attr.toLowerCase();
      if (normalized === 'false') {
        return false;
      }
      if (normalized === '' || normalized === 'true' || normalized === 'plaintext-only') {
        return true;
      }
    }
    if (element.isContentEditable === true) {
      return true;
    }
    element = element.parentElement ?? null;
  }

  return false;
}
