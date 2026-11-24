import {
  COVER_ORNAMENT_BOUNDS,
  CoverOrnamentLayerModel,
  isBoxMappedOrnament,
  type CoverElementZone,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import type { CaseGeometry } from '@/types/geometry';
import {
  hasActiveLayoutConstraint,
  type LayoutAnchorZone,
} from '@/types/layoutConstraints';
import type { CoverStudioState } from '@/types/studio';
import {
  CoverImageLayerModel,
  getLayerVisualRect,
  type CoverImageLayer,
} from '@/types/studioLayer';
import { clampFinite, roundTo } from '@/types/units';
import {
  computeStudioCanvasSpec,
  getPanelBoardRect,
  inferZoneFromCenterX,
  resolveQuickFitRect,
  type StudioCanvasSpec,
} from './canvasSpec';

export const TEXT_VERTICAL_SLOT_RATIOS = {
  'top-third': 0.3,
  center: 0.5,
  'bottom-third': 0.76,
} as const;

export const ELEMENT_VERTICAL_SLOT_RATIOS = {
  'top-third': 0.24,
  center: 0.5,
  'bottom-third': 0.78,
} as const;

export function verticalSlotToPinKind(
  slot: 'upper' | 'center' | 'lower',
): 'top-third' | 'center' | 'bottom-third' {
  switch (slot) {
    case 'upper':
      return 'top-third';
    case 'lower':
      return 'bottom-third';
    case 'center':
      return 'center';
  }
}

function resolveElementPanelZone(
  anchorZone: LayoutAnchorZone | undefined,
  fallbackZone: CoverElementZone,
): CoverElementZone {
  if (anchorZone === 'front' || anchorZone === 'back' || anchorZone === 'spine') {
    return anchorZone;
  }
  return fallbackZone;
}

/**
 * Deterministically resolves a CoverTextLayer's active layout constraint against its
 * visible panel board rect (`getPanelBoardRect`). Unpinned axes are left untouched.
 */
export function resolveTextLayerConstraint(
  layer: CoverTextLayer,
  spec: StudioCanvasSpec,
): CoverTextLayer {
  const constraint = layer.layoutConstraint;
  if (!hasActiveLayoutConstraint(constraint) || !constraint) {
    return layer;
  }

  const zone = resolveElementPanelZone(constraint.anchorZone, layer.zone);
  const board = getPanelBoardRect(spec, zone);

  let xMm = layer.xMm;
  let yMm = layer.yMm;
  let align = layer.align;

  if (constraint.horizontal?.kind === 'center') {
    xMm = roundTo(board.x + board.width / 2, 2);
    align = 'center';
  }

  if (
    constraint.vertical &&
    (constraint.vertical.kind === 'top-third' ||
      constraint.vertical.kind === 'center' ||
      constraint.vertical.kind === 'bottom-third')
  ) {
    yMm = roundTo(board.y + board.height * TEXT_VERTICAL_SLOT_RATIOS[constraint.vertical.kind], 2);
  }

  if (
    zone === layer.zone &&
    xMm === layer.xMm &&
    yMm === layer.yMm &&
    align === layer.align
  ) {
    return layer;
  }

  return {
    ...layer,
    zone,
    xMm,
    yMm,
    align,
  };
}

/**
 * Deterministically resolves a CoverOrnamentLayer's active layout constraint against its
 * visible panel board rect (`getPanelBoardRect`). Unpinned axes are left untouched.
 */
export function resolveOrnamentLayerConstraint(
  ornament: CoverOrnamentLayer,
  spec: StudioCanvasSpec,
): CoverOrnamentLayer {
  const constraint = ornament.layoutConstraint;
  if (!hasActiveLayoutConstraint(constraint) || !constraint) {
    return ornament;
  }

  const zone = resolveElementPanelZone(constraint.anchorZone, ornament.zone);
  const board = getPanelBoardRect(spec, zone);

  if (
    constraint.horizontal?.kind === 'inset-both' &&
    constraint.vertical?.kind === 'inset-both'
  ) {
    const hMargin = constraint.horizontal.marginMm;
    const vMargin = constraint.vertical.marginMm;
    if (Math.abs(hMargin - vMargin) < 0.01 || !isBoxMappedOrnament(ornament)) {
      const fitted = CoverOrnamentLayerModel.fitInsideBoardWithMargin(
        ornament,
        board,
        Math.max(hMargin, vMargin),
      );
      const next = fitted.zone === zone ? fitted : { ...fitted, zone };
      if (
        next.zone === ornament.zone &&
        next.xMm === ornament.xMm &&
        next.yMm === ornament.yMm &&
        next.widthMm === ornament.widthMm &&
        next.heightMm === ornament.heightMm
      ) {
        return ornament;
      }
      return next;
    }

    const safeMX = Math.min(Math.max(0, hMargin), board.width * 0.35);
    const safeMY = Math.min(Math.max(0, vMargin), board.height * 0.35);
    const xMm = roundTo(board.x + safeMX, 2);
    const yMm = roundTo(board.y + safeMY, 2);
    const widthMm = roundTo(
      clampFinite(
        board.width - safeMX * 2,
        ornament.widthMm,
        COVER_ORNAMENT_BOUNDS.minSizeMm,
        COVER_ORNAMENT_BOUNDS.maxSizeMm,
      ),
      2,
    );
    const heightMm = roundTo(
      clampFinite(
        board.height - safeMY * 2,
        ornament.heightMm,
        COVER_ORNAMENT_BOUNDS.minSizeMm,
        COVER_ORNAMENT_BOUNDS.maxSizeMm,
      ),
      2,
    );
    if (
      zone === ornament.zone &&
      xMm === ornament.xMm &&
      yMm === ornament.yMm &&
      widthMm === ornament.widthMm &&
      heightMm === ornament.heightMm
    ) {
      return ornament;
    }
    return { ...ornament, zone, xMm, yMm, widthMm, heightMm };
  }

  let xMm = ornament.xMm;
  let yMm = ornament.yMm;
  let widthMm = ornament.widthMm;
  let heightMm = ornament.heightMm;

  if (constraint.horizontal?.kind === 'inset-both') {
    const m = Math.min(Math.max(0, constraint.horizontal.marginMm), board.width * 0.35);
    if (isBoxMappedOrnament(ornament)) {
      xMm = roundTo(board.x + m, 2);
      widthMm = roundTo(
        clampFinite(
          board.width - m * 2,
          widthMm,
          COVER_ORNAMENT_BOUNDS.minSizeMm,
          COVER_ORNAMENT_BOUNDS.maxSizeMm,
        ),
        2,
      );
    } else {
      xMm = roundTo(board.x + (board.width - widthMm) / 2, 2);
    }
  } else if (constraint.horizontal?.kind === 'center') {
    xMm = roundTo(board.x + (board.width - widthMm) / 2, 2);
  }

  if (constraint.vertical?.kind === 'inset-both') {
    const m = Math.min(Math.max(0, constraint.vertical.marginMm), board.height * 0.35);
    if (isBoxMappedOrnament(ornament)) {
      yMm = roundTo(board.y + m, 2);
      heightMm = roundTo(
        clampFinite(
          board.height - m * 2,
          heightMm,
          COVER_ORNAMENT_BOUNDS.minSizeMm,
          COVER_ORNAMENT_BOUNDS.maxSizeMm,
        ),
        2,
      );
    } else {
      yMm = roundTo(board.y + (board.height - heightMm) / 2, 2);
    }
  } else if (
    constraint.vertical &&
    (constraint.vertical.kind === 'top-third' ||
      constraint.vertical.kind === 'center' ||
      constraint.vertical.kind === 'bottom-third')
  ) {
    const ratio = ELEMENT_VERTICAL_SLOT_RATIOS[constraint.vertical.kind];
    const rawY = board.y + board.height * ratio - heightMm / 2;
    const clampedY =
      heightMm >= board.height
        ? board.y + (board.height - heightMm) / 2
        : Math.min(board.y + board.height - heightMm, Math.max(board.y, rawY));
    yMm = roundTo(clampedY, 2);
  }

  if (
    zone === ornament.zone &&
    xMm === ornament.xMm &&
    yMm === ornament.yMm &&
    widthMm === ornament.widthMm &&
    heightMm === ornament.heightMm
  ) {
    return ornament;
  }

  return {
    ...ornament,
    zone,
    xMm,
    yMm,
    widthMm,
    heightMm,
  };
}

/**
 * Deterministically resolves a CoverImageLayer's active layout constraint against its
 * target `*ArtworkRect` (`frontArtworkRect`, `backArtworkRect`, `spineArtworkRect`, or
 * `fullWrapRect`) so images never spill onto tucked-in flaps or wrap-over glue tabs.
 */
export function resolveImageLayerConstraint(
  layer: CoverImageLayer,
  spec: StudioCanvasSpec,
): CoverImageLayer {
  const constraint = layer.layoutConstraint;
  if (!hasActiveLayoutConstraint(constraint) || !constraint) {
    return layer;
  }

  const anchor: LayoutAnchorZone =
    constraint.anchorZone ??
    (layer.clipZone !== 'none'
      ? layer.clipZone
      : inferZoneFromCenterX(layer.xMm + layer.widthMm / 2, spec));
  const targetRect = resolveQuickFitRect(spec, anchor);

  let next = layer;
  if (constraint.imageFit === 'cover' || constraint.imageFit === 'contain') {
    const fitted = CoverImageLayerModel.fitToRect(
      next,
      targetRect,
      next.clipZone,
      constraint.imageFit,
    );
    if (
      fitted.xMm !== next.xMm ||
      fitted.yMm !== next.yMm ||
      fitted.widthMm !== next.widthMm ||
      fitted.heightMm !== next.heightMm
    ) {
      next = fitted;
    }
  }

  const vis = getLayerVisualRect(next);
  let targetCx = next.xMm + next.widthMm / 2;
  let targetCy = next.yMm + next.heightMm / 2;
  let alignUpdated = false;

  if (constraint.horizontal?.kind === 'center') {
    targetCx = targetRect.x + targetRect.width / 2;
    alignUpdated = true;
  }

  if (
    constraint.vertical &&
    (constraint.vertical.kind === 'top-third' ||
      constraint.vertical.kind === 'center' ||
      constraint.vertical.kind === 'bottom-third')
  ) {
    const ratio = ELEMENT_VERTICAL_SLOT_RATIOS[constraint.vertical.kind];
    const rawVisY = targetRect.y + targetRect.height * ratio - vis.height / 2;
    const clampedVisY =
      vis.height >= targetRect.height
        ? targetRect.y + (targetRect.height - vis.height) / 2
        : Math.min(targetRect.y + targetRect.height - vis.height, Math.max(targetRect.y, rawVisY));
    targetCy = clampedVisY + vis.height / 2;
    alignUpdated = true;
  }

  if (alignUpdated) {
    const nextX = roundTo(targetCx - next.widthMm / 2, 2);
    const nextY = roundTo(targetCy - next.heightMm / 2, 2);
    if (nextX !== next.xMm || nextY !== next.yMm) {
      next = {
        ...next,
        xMm: nextX,
        yMm: nextY,
      };
    }
  }

  return next;
}

/**
 * Applies active layout constraints across all pinned text, ornament, and image layers
 * in O(N) time. Returns the original `studio` reference when nothing changed.
 */
export function applyStudioLayoutConstraints(
  studio: CoverStudioState,
  geometry: CaseGeometry,
): CoverStudioState {
  const spec = computeStudioCanvasSpec(geometry);

  let textChanged = false;
  const nextTextLayers = (studio.textLayers ?? []).map((layer) => {
    const resolved = resolveTextLayerConstraint(layer, spec);
    if (resolved !== layer) textChanged = true;
    return resolved;
  });

  let ornamentsChanged = false;
  const nextOrnaments = (studio.ornaments ?? []).map((orn) => {
    const resolved = resolveOrnamentLayerConstraint(orn, spec);
    if (resolved !== orn) ornamentsChanged = true;
    return resolved;
  });

  let layersChanged = false;
  const nextLayers = studio.layers.map((layer) => {
    const resolved = resolveImageLayerConstraint(layer, spec);
    if (resolved !== layer) layersChanged = true;
    return resolved;
  });

  if (!textChanged && !ornamentsChanged && !layersChanged) {
    return studio;
  }

  return {
    ...studio,
    textLayers: textChanged ? nextTextLayers : studio.textLayers,
    ornaments: ornamentsChanged ? nextOrnaments : studio.ornaments,
    layers: layersChanged ? nextLayers : studio.layers,
  };
}
