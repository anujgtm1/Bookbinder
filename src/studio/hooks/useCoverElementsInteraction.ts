import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  CoverOrnamentLayerModel,
  isBoxMappedOrnament,
  type CoverElementZone,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import {
  detachConstraintOnMove,
  detachConstraintOnResize,
  type LayerLayoutConstraint,
} from '@/types/layoutConstraints';
import type { CoverStudioState } from '@/types/studio';
import type { ResizeCorner } from '@/types/studioLayer';
import { roundTo } from '@/types/units';
import {
  getCoverTextAxisAlignedBounds,
  inferZoneFromCenterX,
  type StudioCanvasSpec,
} from '../canvasSpec';
import { pruneLayerOrder } from '../layerStack';
import {
  snapBoxToTargets,
  snapPointToTargets,
  type ActiveSnapGuide,
  type CanvasSnapTargets,
} from '../snapGuides';

type ElementDragState =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'text';
      readonly id: string;
      readonly startXMm: number;
      readonly startYMm: number;
      readonly origXMm: number;
      readonly origYMm: number;
      readonly origZone: CoverElementZone;
      readonly origConstraint?: LayerLayoutConstraint;
    }
  | {
      readonly kind: 'ornament';
      readonly id: string;
      readonly startXMm: number;
      readonly startYMm: number;
      readonly origXMm: number;
      readonly origYMm: number;
      readonly widthMm: number;
      readonly heightMm: number;
      readonly origZone: CoverElementZone;
      readonly origConstraint?: LayerLayoutConstraint;
    }
  | {
      readonly kind: 'ornament-resize';
      readonly id: string;
      readonly corner: ResizeCorner;
      readonly origOrnament: CoverOrnamentLayer;
    };

export interface UseCoverElementsInteractionOptions {
  readonly spec: StudioCanvasSpec;
  readonly studioRef: RefObject<CoverStudioState>;
  readonly onChangeRef: RefObject<(next: CoverStudioState) => void>;
  readonly toSvgMm: (
    clientX: number,
    clientY: number,
  ) => { readonly xMm: number; readonly yMm: number } | null;
  readonly suppressNextClickRef: RefObject<boolean>;
  readonly snapTargets: CanvasSnapTargets;
  readonly snapEnabled: boolean;
  /** Disable keyboard removal when not in interactive 2D mode */
  readonly enabled: boolean;
  readonly selectedTextId: string | null;
  readonly selectedOrnamentId: string | null;
  readonly onSelectText: (id: string | null) => void;
  readonly onSelectOrnament: (id: string | null) => void;
}

export interface CoverElementsInteractionApi {
  readonly elementSnapGuides: readonly ActiveSnapGuide[];
  readonly startTextDrag: (layer: CoverTextLayer, clientX: number, clientY: number) => void;
  readonly startOrnamentDrag: (
    ornament: CoverOrnamentLayer,
    clientX: number,
    clientY: number,
  ) => void;
  readonly startOrnamentResize: (ornament: CoverOrnamentLayer, corner: ResizeCorner) => void;
}

/**
 * Manages interactive pointer dragging, 4-corner ornament resizing (with live magnetic
 * board/center/safe-margin snap guides), and Backspace/Delete removal for Cover Text
 * and Classic Bookbindery Ornament layers on the 2D Cover Studio canvas.
 */
export function useCoverElementsInteraction({
  spec,
  studioRef,
  onChangeRef,
  toSvgMm,
  suppressNextClickRef,
  snapTargets,
  snapEnabled,
  enabled,
  selectedTextId,
  selectedOrnamentId,
  onSelectText,
  onSelectOrnament,
}: UseCoverElementsInteractionOptions): CoverElementsInteractionApi {
  const [elementSnapGuides, setElementSnapGuides] = useState<readonly ActiveSnapGuide[]>([]);
  const elementDragRef = useRef<ElementDragState>({ kind: 'none' });

  // Pointer drag & resize interaction with shared magnetic snap helpers
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = elementDragRef.current;
      if (drag.kind === 'none') return;
      const pt = toSvgMm(e.clientX, e.clientY);
      if (!pt) return;

      const allowSnap = snapEnabled && !e.altKey;

      if (drag.kind === 'ornament-resize') {
        const lockAspect = !isBoxMappedOrnament(drag.origOrnament);

        const snapped = allowSnap
          ? snapPointToTargets(pt.xMm, pt.yMm, snapTargets)
          : { xMm: pt.xMm, yMm: pt.yMm, guides: [] };

        setElementSnapGuides(snapped.guides);
        const resized = CoverOrnamentLayerModel.resizeFromCorner(
          drag.origOrnament,
          drag.corner,
          snapped.xMm,
          snapped.yMm,
          lockAspect,
        );
        const nextZone = inferZoneFromCenterX(resized.xMm + resized.widthMm / 2, spec);
        const origCx = drag.origOrnament.xMm + drag.origOrnament.widthMm / 2;
        const origCy = drag.origOrnament.yMm + drag.origOrnament.heightMm / 2;
        const nextCx = resized.xMm + resized.widthMm / 2;
        const nextCy = resized.yMm + resized.heightMm / 2;
        const afterResize = detachConstraintOnResize(drag.origOrnament.layoutConstraint);
        let nextConstraint = detachConstraintOnMove(
          afterResize,
          Math.abs(nextCx - origCx) > 0.05,
          Math.abs(nextCy - origCy) > 0.05,
        );
        if (nextConstraint && nextZone !== drag.origOrnament.zone) {
          nextConstraint = { ...nextConstraint, anchorZone: nextZone };
        }
        const updatedOrnament: CoverOrnamentLayer = {
          ...resized,
          zone: nextZone,
          layoutConstraint: nextConstraint,
        };
        const cur = studioRef.current;
        onChangeRef.current({
          ...cur,
          ornaments: (cur.ornaments ?? []).map((o) => (o.id === drag.id ? updatedOrnament : o)),
        });
        suppressNextClickRef.current = true;
        return;
      }

      const dx = pt.xMm - drag.startXMm;
      const dy = pt.yMm - drag.startYMm;

      if (drag.kind === 'text') {
        const rawX = drag.origXMm + dx;
        const rawY = drag.origYMm + dy;
        const snapped = allowSnap
          ? snapPointToTargets(rawX, rawY, snapTargets)
          : { xMm: rawX, yMm: rawY, guides: [] };

        setElementSnapGuides(snapped.guides);
        const cur = studioRef.current;
        const nextX = roundTo(snapped.xMm, 2);
        const nextY = roundTo(snapped.yMm, 2);
        const movedX = Math.abs(nextX - drag.origXMm) > 0.05;
        const movedY = Math.abs(nextY - drag.origYMm) > 0.05;
        onChangeRef.current({
          ...cur,
          textLayers: (cur.textLayers ?? []).map((t) => {
            if (t.id !== drag.id) return t;
            const moved = { ...t, xMm: nextX, yMm: nextY };
            const bounds = getCoverTextAxisAlignedBounds(moved);
            const nextZone = inferZoneFromCenterX(bounds.x + bounds.width / 2, spec);
            let nextConstraint = detachConstraintOnMove(drag.origConstraint, movedX, movedY);
            if (nextConstraint && nextZone !== drag.origZone) {
              nextConstraint = { ...nextConstraint, anchorZone: nextZone };
            }
            return {
              ...moved,
              zone: nextZone,
              layoutConstraint: nextConstraint,
            };
          }),
        });
      } else {
        const rawX = drag.origXMm + dx;
        const rawY = drag.origYMm + dy;
        const snapped = allowSnap
          ? snapBoxToTargets(rawX, rawY, drag.widthMm, drag.heightMm, snapTargets)
          : { xMm: rawX, yMm: rawY, guides: [] };

        setElementSnapGuides(snapped.guides);
        const cur = studioRef.current;
        const nextX = roundTo(snapped.xMm, 2);
        const nextY = roundTo(snapped.yMm, 2);
        const nextZone = inferZoneFromCenterX(nextX + drag.widthMm / 2, spec);
        const movedX = Math.abs(nextX - drag.origXMm) > 0.05;
        const movedY = Math.abs(nextY - drag.origYMm) > 0.05;
        let nextConstraint = detachConstraintOnMove(drag.origConstraint, movedX, movedY);
        if (nextConstraint && nextZone !== drag.origZone) {
          nextConstraint = { ...nextConstraint, anchorZone: nextZone };
        }
        onChangeRef.current({
          ...cur,
          ornaments: (cur.ornaments ?? []).map((o) =>
            o.id === drag.id
              ? { ...o, xMm: nextX, yMm: nextY, zone: nextZone, layoutConstraint: nextConstraint }
              : o,
          ),
        });
      }
      suppressNextClickRef.current = true;
    };

    const onPointerUp = () => {
      if (elementDragRef.current.kind !== 'none') {
        elementDragRef.current = { kind: 'none' };
        setElementSnapGuides([]);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [spec, snapEnabled, snapTargets, toSvgMm, studioRef, onChangeRef, suppressNextClickRef]);

  // Keyboard Backspace/Delete removal for selected CoverTextLayer or CoverOrnamentLayer
  useEffect(() => {
    if (!enabled || (!selectedTextId && !selectedOrnamentId)) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      const cur = studioRef.current;
      if (selectedTextId) {
        onChangeRef.current(
          pruneLayerOrder({
            ...cur,
            textLayers: (cur.textLayers ?? []).filter((t) => t.id !== selectedTextId),
          }),
        );
        onSelectText(null);
      } else if (selectedOrnamentId) {
        onChangeRef.current(
          pruneLayerOrder({
            ...cur,
            ornaments: (cur.ornaments ?? []).filter((o) => o.id !== selectedOrnamentId),
          }),
        );
        onSelectOrnament(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    enabled,
    selectedTextId,
    selectedOrnamentId,
    studioRef,
    onChangeRef,
    onSelectText,
    onSelectOrnament,
  ]);

  const startTextDrag = useCallback(
    (layer: CoverTextLayer, clientX: number, clientY: number) => {
      const pt = toSvgMm(clientX, clientY);
      if (!pt) return;
      onSelectText(layer.id);
      elementDragRef.current = {
        kind: 'text',
        id: layer.id,
        startXMm: pt.xMm,
        startYMm: pt.yMm,
        origXMm: layer.xMm,
        origYMm: layer.yMm,
        origZone: layer.zone,
        origConstraint: layer.layoutConstraint,
      };
    },
    [onSelectText, toSvgMm],
  );

  const startOrnamentDrag = useCallback(
    (ornament: CoverOrnamentLayer, clientX: number, clientY: number) => {
      const pt = toSvgMm(clientX, clientY);
      if (!pt) return;
      onSelectOrnament(ornament.id);
      elementDragRef.current = {
        kind: 'ornament',
        id: ornament.id,
        startXMm: pt.xMm,
        startYMm: pt.yMm,
        origXMm: ornament.xMm,
        origYMm: ornament.yMm,
        widthMm: ornament.widthMm,
        heightMm: ornament.heightMm,
        origZone: ornament.zone,
        origConstraint: ornament.layoutConstraint,
      };
    },
    [onSelectOrnament, toSvgMm],
  );

  const startOrnamentResize = useCallback((ornament: CoverOrnamentLayer, corner: ResizeCorner) => {
    elementDragRef.current = {
      kind: 'ornament-resize',
      id: ornament.id,
      corner,
      origOrnament: ornament,
    };
  }, []);

  return {
    elementSnapGuides,
    startTextDrag,
    startOrnamentDrag,
    startOrnamentResize,
  };
}
