import type { CoverElementZone, CoverOrnamentLayer, CoverTextLayer } from '@/types/coverElements';
import type { CoverStudioState } from '@/types/studio';
import {
  isSeriesOriginLayer,
  type CoverImageLayer,
  type LayerClipZone,
} from '@/types/studioLayer';
import { getClassicOrnamentSpec } from './classicOrnaments';

export type StudioStackElement =
  | { readonly kind: 'image'; readonly layer: CoverImageLayer; readonly index: number }
  | { readonly kind: 'ornament'; readonly layer: CoverOrnamentLayer; readonly index: number }
  | { readonly kind: 'text'; readonly layer: CoverTextLayer; readonly index: number };

export type LayerReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export interface ElementStackPosition {
  readonly index: number;
  readonly total: number;
  readonly canBringForward: boolean;
  readonly canSendBackward: boolean;
}

export interface LayerDisplayMeta {
  readonly id: string;
  readonly kind: StudioStackElement['kind'];
  readonly kindLabel: 'Image' | 'Ornament' | 'Text';
  readonly label: string;
  readonly zoneLabel: string;
  readonly isFromSeries: boolean;
  readonly thumbnailUrl?: string;
  readonly swatchColor?: string;
}

const KIND_LEGACY_RANK: Readonly<Record<StudioStackElement['kind'], number>> = {
  image: 0,
  ornament: 1,
  text: 2,
};

const ZONE_LABELS: Readonly<Record<CoverElementZone | LayerClipZone, string>> = {
  front: 'Front',
  back: 'Back',
  spine: 'Spine',
  none: 'Full Cover',
};

function sameIdSequence<T extends { readonly id: string }>(
  prev: readonly T[],
  next: readonly T[],
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id) return false;
  }
  return true;
}

/**
 * Resolves all cover elements (`layers`, `ornaments`, `textLayers`) in unified
 * bottom-to-top painting order.
 *
 * - When `studio.layerOrder` is absent or empty, returns the exact legacy order:
 *   `[...images, ...ornaments, ...textLayers]`.
 * - When `studio.layerOrder` is present, honors its exact sequence, filters stale/deleted IDs,
 *   places any newly added images right after the highest existing image, and appends any
 *   newly added ornaments or text layers at the top of the stack.
 */
export function resolveOrderedStudioElements(
  studio: CoverStudioState,
): readonly StudioStackElement[] {
  const images: StudioStackElement[] = studio.layers.map((layer, index) => ({
    kind: 'image',
    layer,
    index,
  }));
  const ornaments: StudioStackElement[] = (studio.ornaments ?? []).map((layer, index) => ({
    kind: 'ornament',
    layer,
    index,
  }));
  const texts: StudioStackElement[] = (studio.textLayers ?? []).map((layer, index) => ({
    kind: 'text',
    layer,
    index,
  }));

  const rawOrder = studio.layerOrder;
  if (!rawOrder || rawOrder.length === 0) {
    return [...images, ...ornaments, ...texts];
  }

  const byId = new Map<string, StudioStackElement>();
  for (const item of images) byId.set(item.layer.id, item);
  for (const item of ornaments) byId.set(item.layer.id, item);
  for (const item of texts) byId.set(item.layer.id, item);

  const ordered: StudioStackElement[] = [];
  const seen = new Set<string>();
  for (const id of rawOrder) {
    if (seen.has(id)) continue;
    const item = byId.get(id);
    if (!item) continue;
    seen.add(id);
    ordered.push(item);
  }

  const unseenImages = images.filter((item) => !seen.has(item.layer.id));
  if (unseenImages.length > 0) {
    let lastImageIdx = -1;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].kind === 'image') {
        lastImageIdx = i;
        break;
      }
    }
    ordered.splice(lastImageIdx + 1, 0, ...unseenImages);
  }

  for (const item of ornaments) {
    if (!seen.has(item.layer.id)) {
      ordered.push(item);
    }
  }
  for (const item of texts) {
    if (!seen.has(item.layer.id)) {
      ordered.push(item);
    }
  }

  return ordered;
}

/**
 * Moves an element across the unified bottom-to-top cover stack (Images, Ornaments, and Text).
 * Clamps cleanly at the ends and returns the original `studio` reference on no-ops.
 */
export function reorderStudioElement(
  studio: CoverStudioState,
  id: string,
  direction: LayerReorderDirection,
): CoverStudioState {
  const ordered = [...resolveOrderedStudioElements(studio)];
  const currentIdx = ordered.findIndex((item) => item.layer.id === id);
  if (currentIdx === -1) return studio;

  let targetIdx = currentIdx;
  if (direction === 'forward') {
    targetIdx = Math.min(ordered.length - 1, currentIdx + 1);
  } else if (direction === 'backward') {
    targetIdx = Math.max(0, currentIdx - 1);
  } else if (direction === 'front') {
    targetIdx = ordered.length - 1;
  } else if (direction === 'back') {
    targetIdx = 0;
  }

  if (targetIdx === currentIdx) return studio;

  const [moved] = ordered.splice(currentIdx, 1);
  ordered.splice(targetIdx, 0, moved);

  const nextLayerOrder = ordered.map((item) => item.layer.id);
  const nextImages = ordered
    .filter((item): item is Extract<StudioStackElement, { kind: 'image' }> => item.kind === 'image')
    .map((item) => item.layer);
  const nextOrnaments = ordered
    .filter(
      (item): item is Extract<StudioStackElement, { kind: 'ornament' }> => item.kind === 'ornament',
    )
    .map((item) => item.layer);
  const nextTextLayers = ordered
    .filter((item): item is Extract<StudioStackElement, { kind: 'text' }> => item.kind === 'text')
    .map((item) => item.layer);

  return {
    ...studio,
    layers: sameIdSequence(studio.layers, nextImages) ? studio.layers : nextImages,
    ornaments: sameIdSequence(studio.ornaments ?? [], nextOrnaments)
      ? studio.ornaments
      : nextOrnaments,
    textLayers: sameIdSequence(studio.textLayers ?? [], nextTextLayers)
      ? studio.textLayers
      : nextTextLayers,
    layerOrder: nextLayerOrder,
  };
}

/**
 * Returns the bottom-to-top position (`0` = bottom-most, `total - 1` = top-most)
 * and forward/backward availability for a given element ID.
 */
export function getElementStackPosition(
  studio: CoverStudioState,
  id: string,
): ElementStackPosition {
  const ordered = resolveOrderedStudioElements(studio);
  const total = ordered.length;
  const index = ordered.findIndex((item) => item.layer.id === id);
  if (index === -1) {
    return { index: -1, total, canBringForward: false, canSendBackward: false };
  }
  return {
    index,
    total,
    canBringForward: index < total - 1,
    canSendBackward: index > 0,
  };
}

/**
 * Returns true when any image layer is stacked above at least one ornament or text layer.
 */
export function hasImageAboveVectorElements(studio: CoverStudioState): boolean {
  let seenVector = false;
  for (const item of resolveOrderedStudioElements(studio)) {
    if (item.kind === 'ornament' || item.kind === 'text') {
      seenVector = true;
    } else if (seenVector) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when elements deviate from the legacy grouped stacking order
 * (`image*` -> `ornament*` -> `text*`).
 */
export function hasCustomCrossTypeOrder(studio: CoverStudioState): boolean {
  let maxRank = -1;
  for (const item of resolveOrderedStudioElements(studio)) {
    const rank = KIND_LEGACY_RANK[item.kind];
    if (rank < maxRank) return true;
    maxRank = rank;
  }
  return false;
}

/**
 * Removes deleted/stale IDs from `studio.layerOrder` when present.
 * Leaves `layerOrder` undefined when not yet customized or when no IDs remain.
 */
export function pruneLayerOrder(studio: CoverStudioState): CoverStudioState {
  if (!studio.layerOrder || studio.layerOrder.length === 0) {
    return studio;
  }
  const activeIds = new Set<string>([
    ...studio.layers.map((l) => l.id),
    ...(studio.ornaments ?? []).map((o) => o.id),
    ...(studio.textLayers ?? []).map((t) => t.id),
  ]);
  const nextOrder = studio.layerOrder.filter((id) => activeIds.has(id));
  if (nextOrder.length === 0) {
    const { layerOrder: _omitted, ...rest } = studio;
    void _omitted;
    return rest;
  }
  if (nextOrder.length === studio.layerOrder.length) {
    return studio;
  }
  return { ...studio, layerOrder: nextOrder };
}

/**
 * Updates `studio.layerOrder` cleanly when one or more new elements are added.
 * Keeps `layerOrder` omitted if the user has not customized stacking order (unless `placeAtTop`
 * is explicitly requested for an image when vector elements already exist).
 */
export function syncLayerOrderAfterAdd(
  studio: CoverStudioState,
  addedIds: readonly string[],
  kind: StudioStackElement['kind'],
  options?: { readonly placeAtTop?: boolean; readonly afterId?: string },
): CoverStudioState {
  if (addedIds.length === 0) return studio;
  const addedSet = new Set(addedIds);
  const hasExplicitOrder = Boolean(studio.layerOrder && studio.layerOrder.length > 0);
  const hasVectors =
    (studio.ornaments?.length ?? 0) > 0 || (studio.textLayers?.length ?? 0) > 0;

  if (!hasExplicitOrder) {
    if (options?.placeAtTop && kind === 'image' && hasVectors) {
      const existing = resolveOrderedStudioElements(studio)
        .filter((item) => !addedSet.has(item.layer.id))
        .map((item) => item.layer.id);
      return {
        ...studio,
        layerOrder: [...existing, ...addedIds],
      };
    }
    return studio;
  }

  const baseOrdered = resolveOrderedStudioElements(studio).filter(
    (item) => !addedSet.has(item.layer.id),
  );
  const nextIds = baseOrdered.map((item) => item.layer.id);

  if (options?.afterId) {
    const anchorIdx = nextIds.indexOf(options.afterId);
    if (anchorIdx !== -1) {
      nextIds.splice(anchorIdx + 1, 0, ...addedIds);
      return { ...studio, layerOrder: nextIds };
    }
  }

  if (options?.placeAtTop || kind === 'text' || kind === 'ornament') {
    nextIds.push(...addedIds);
    return { ...studio, layerOrder: nextIds };
  }

  // Insert newly added images right after the highest existing image layer
  let lastImageIdx = -1;
  for (let i = baseOrdered.length - 1; i >= 0; i--) {
    if (baseOrdered[i].kind === 'image') {
      lastImageIdx = i;
      break;
    }
  }
  nextIds.splice(lastImageIdx + 1, 0, ...addedIds);
  return { ...studio, layerOrder: nextIds };
}

/**
 * Replaces an element ID in `studio.layerOrder` in-place (e.g., when detaching a Series layer
 * or swapping a procedural artwork layer) so its exact z-position is preserved.
 */
export function replaceLayerIdInOrder(
  studio: CoverStudioState,
  oldId: string,
  newId: string,
): CoverStudioState {
  if (!studio.layerOrder || studio.layerOrder.length === 0) {
    return studio;
  }
  if (!studio.layerOrder.includes(oldId)) {
    return studio;
  }
  const seen = new Set<string>();
  const nextOrder: string[] = [];
  for (const id of studio.layerOrder) {
    const mapped = id === oldId ? newId : id;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    nextOrder.push(mapped);
  }
  return { ...studio, layerOrder: nextOrder };
}

/**
 * Returns clean human-readable display metadata for an element in the unified Layer Stack panel.
 */
export function getLayerDisplayMeta(item: StudioStackElement): LayerDisplayMeta {
  if (item.kind === 'image') {
    return {
      id: item.layer.id,
      kind: 'image',
      kindLabel: 'Image',
      label: item.layer.fileName || 'Cover Image',
      zoneLabel: ZONE_LABELS[item.layer.clipZone],
      isFromSeries: isSeriesOriginLayer(item.layer),
      thumbnailUrl: item.layer.dataUrl,
    };
  }
  if (item.kind === 'ornament') {
    const label =
      item.layer.presetId === 'custom-svg' && item.layer.customSvgName
        ? item.layer.customSvgName
        : getClassicOrnamentSpec(item.layer.presetId).label;
    return {
      id: item.layer.id,
      kind: 'ornament',
      kindLabel: 'Ornament',
      label,
      zoneLabel: ZONE_LABELS[item.layer.zone],
      isFromSeries: isSeriesOriginLayer(item.layer),
      swatchColor: item.layer.color,
    };
  }
  const firstLine = item.layer.text.split(/\r?\n/)[0]?.trim() || 'Empty text';
  return {
    id: item.layer.id,
    kind: 'text',
    kindLabel: 'Text',
    label: firstLine,
    zoneLabel: ZONE_LABELS[item.layer.zone],
    isFromSeries: isSeriesOriginLayer(item.layer),
    swatchColor: item.layer.color,
  };
}
