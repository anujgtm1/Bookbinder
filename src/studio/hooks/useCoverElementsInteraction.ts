import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  CoverOrnamentLayerModel,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import type { CoverStudioState } from '@/types/studio';
import type { ResizeCorner } from '@/types/studioLayer';
import { roundTo } from '@/types/units';
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
    }
  | {
      readonly kind: 'ornament-resize';
      readonly id: string;
      readonly corner: ResizeCorner;
      readonly origOrnament: CoverOrnamentLayer;
    };

export interface UseCoverElementsInteractionOptions {
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
        const lockAspect =
          drag.origOrnament.presetId === 'custom-svg' ||
          drag.origOrnament.presetId.startsWith('emblem-') ||
          drag.origOrnament.presetId.startsWith('divider-');

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
        const cur = studioRef.current;
        onChangeRef.current({
          ...cur,
          ornaments: (cur.ornaments ?? []).map((o) => (o.id === drag.id ? resized : o)),
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
        onChangeRef.current({
          ...cur,
          textLayers: (cur.textLayers ?? []).map((t) =>
            t.id === drag.id
              ? { ...t, xMm: roundTo(snapped.xMm, 2), yMm: roundTo(snapped.yMm, 2) }
              : t,
          ),
        });
      } else {
        const rawX = drag.origXMm + dx;
        const rawY = drag.origYMm + dy;
        const snapped = allowSnap
          ? snapBoxToTargets(rawX, rawY, drag.widthMm, drag.heightMm, snapTargets)
          : { xMm: rawX, yMm: rawY, guides: [] };

        setElementSnapGuides(snapped.guides);
        const cur = studioRef.current;
        onChangeRef.current({
          ...cur,
          ornaments: (cur.ornaments ?? []).map((o) =>
            o.id === drag.id
              ? { ...o, xMm: roundTo(snapped.xMm, 2), yMm: roundTo(snapped.yMm, 2) }
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
  }, [snapEnabled, snapTargets, toSvgMm, studioRef, onChangeRef, suppressNextClickRef]);

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
        onChangeRef.current({
          ...cur,
          textLayers: (cur.textLayers ?? []).filter((t) => t.id !== selectedTextId),
        });
        onSelectText(null);
      } else if (selectedOrnamentId) {
        onChangeRef.current({
          ...cur,
          ornaments: (cur.ornaments ?? []).filter((o) => o.id !== selectedOrnamentId),
        });
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
