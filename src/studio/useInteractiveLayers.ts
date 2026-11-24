import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Rect2D } from '@/types/geometry';
import { detachConstraintOnMove, detachConstraintOnResize } from '@/types/layoutConstraints';
import {
  CoverImageLayerModel,
  type CoverImageLayer,
  type ResizeCorner,
} from '@/types/studioLayer';
import {
  snapLayerMove,
  snapLayerResize,
  type ActiveSnapGuide,
  type CanvasSnapTargets,
} from './snapGuides';

export type LayerDragInteraction =
  | { readonly mode: 'none' }
  | {
      readonly mode: 'move';
      readonly layerId: string;
      readonly startXMm: number;
      readonly startYMm: number;
      readonly origLayer: CoverImageLayer;
    }
  | {
      readonly mode: 'resize';
      readonly layerId: string;
      readonly corner: ResizeCorner;
      readonly origLayer: CoverImageLayer;
    };

export function isSupportedImageFile(file: File): boolean {
  return (
    /^image\/(png|jpeg|webp|svg\+xml)$/i.test(file.type) ||
    /\.(png|jpe?g|webp|svg)$/i.test(file.name)
  );
}

export function readImageFile(
  file: File,
): Promise<{ readonly dataUrl: string; readonly width: number; readonly height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () =>
        resolve({
          dataUrl,
          // SVGs without explicit width/height attributes may report 0 naturalWidth; default cleanly to 1000×1000
          width: img.naturalWidth > 0 ? img.naturalWidth : 1000,
          height: img.naturalHeight > 0 ? img.naturalHeight : 1000,
        });
      img.onerror = () => reject(new Error('Unsupported or unreadable image file.'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Converts browser client coordinates into 1:1 millimeter SVG user coordinates,
 * honoring CSS transforms/zoom via `getScreenCTM().inverse()` with a graceful fallback
 * for test environments (e.g. jsdom) that lack full SVG matrix APIs.
 */
export function clientPointToSvgMm(
  svgEl: SVGSVGElement | null,
  clientX: number,
  clientY: number,
  fallbackViewBox: Rect2D,
): { readonly xMm: number; readonly yMm: number } | null {
  if (!svgEl) return null;
  const ctm = typeof svgEl.getScreenCTM === 'function' ? svgEl.getScreenCTM() : null;
  if (ctm && typeof DOMPoint !== 'undefined') {
    const svgPt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { xMm: svgPt.x, yMm: svgPt.y };
  }
  const rect = svgEl.getBoundingClientRect();
  return {
    xMm:
      fallbackViewBox.x +
      ((clientX - rect.left) / Math.max(1, rect.width)) * fallbackViewBox.width,
    yMm:
      fallbackViewBox.y +
      ((clientY - rect.top) / Math.max(1, rect.height)) * fallbackViewBox.height,
  };
}

export interface UseInteractiveLayersOptions {
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly viewBox: Rect2D;
  readonly layers: readonly CoverImageLayer[];
  readonly selectedLayerId: string | null;
  readonly snapTargets: CanvasSnapTargets;
  readonly snapEnabled: boolean;
  /** Disable keyboard delete / pointer drags when not in interactive 2D mode */
  readonly enabled: boolean;
  readonly onChangeLayers: (nextLayers: readonly CoverImageLayer[]) => void;
  readonly onSelectLayer: (layerId: string | null) => void;
}

export function useInteractiveLayers({
  svgRef,
  viewBox,
  layers,
  selectedLayerId,
  snapTargets,
  snapEnabled,
  enabled,
  onChangeLayers,
  onSelectLayer,
}: UseInteractiveLayersOptions) {
  const [activeSnapGuides, setActiveSnapGuides] = useState<readonly ActiveSnapGuide[]>([]);
  const dragRef = useRef<LayerDragInteraction>({ mode: 'none' });
  const suppressNextClickRef = useRef(false);

  const layersRef = useRef(layers);
  const onChangeLayersRef = useRef(onChangeLayers);
  const snapTargetsRef = useRef(snapTargets);
  const snapEnabledRef = useRef(snapEnabled);
  const viewBoxRef = useRef(viewBox);

  useEffect(() => {
    layersRef.current = layers;
    onChangeLayersRef.current = onChangeLayers;
    snapTargetsRef.current = snapTargets;
    snapEnabledRef.current = snapEnabled;
    viewBoxRef.current = viewBox;
  }, [layers, onChangeLayers, snapTargets, snapEnabled, viewBox]);

  const toSvgMm = useCallback(
    (clientX: number, clientY: number) =>
      clientPointToSvgMm(svgRef.current, clientX, clientY, viewBoxRef.current),
    [svgRef],
  );

  // Global pointer tracking for smooth drag-to-move and corner-handle resize with magnetic snapping
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag.mode === 'none') return;
      const pt = clientPointToSvgMm(svgRef.current, e.clientX, e.clientY, viewBoxRef.current);
      if (!pt) return;

      suppressNextClickRef.current = true;
      const useSnap = snapEnabledRef.current && !e.altKey;
      let latestGuides: readonly ActiveSnapGuide[] = [];

      const nextLayers = layersRef.current.map((layer) => {
        if (layer.id !== drag.layerId) return layer;
        if (drag.mode === 'move') {
          const moved = CoverImageLayerModel.moveBy(
            drag.origLayer,
            pt.xMm - drag.startXMm,
            pt.yMm - drag.startYMm,
          );
          let nextLayer = moved;
          if (useSnap) {
            const snapped = snapLayerMove(moved, snapTargetsRef.current);
            latestGuides = snapped.guides;
            nextLayer = snapped.layer;
          }
          const movedX = Math.abs(nextLayer.xMm - drag.origLayer.xMm) > 0.05;
          const movedY = Math.abs(nextLayer.yMm - drag.origLayer.yMm) > 0.05;
          return {
            ...nextLayer,
            layoutConstraint: detachConstraintOnMove(drag.origLayer.layoutConstraint, movedX, movedY),
          };
        }
        let resizedLayer: CoverImageLayer;
        if (!useSnap) {
          resizedLayer = CoverImageLayerModel.resizeFromCorner(
            drag.origLayer,
            drag.corner,
            pt.xMm,
            pt.yMm,
          );
        } else {
          const snapped = snapLayerResize(
            drag.origLayer,
            drag.corner,
            pt.xMm,
            pt.yMm,
            snapTargetsRef.current,
          );
          latestGuides = snapped.guides;
          resizedLayer = snapped.layer;
        }
        const origCx = drag.origLayer.xMm + drag.origLayer.widthMm / 2;
        const origCy = drag.origLayer.yMm + drag.origLayer.heightMm / 2;
        const nextCx = resizedLayer.xMm + resizedLayer.widthMm / 2;
        const nextCy = resizedLayer.yMm + resizedLayer.heightMm / 2;
        const afterResize = detachConstraintOnResize(drag.origLayer.layoutConstraint);
        return {
          ...resizedLayer,
          layoutConstraint: detachConstraintOnMove(
            afterResize,
            Math.abs(nextCx - origCx) > 0.05,
            Math.abs(nextCy - origCy) > 0.05,
          ),
        };
      });

      setActiveSnapGuides(latestGuides);
      onChangeLayersRef.current(nextLayers);
    };

    const onPointerEnd = () => {
      if (dragRef.current.mode !== 'none') {
        dragRef.current = { mode: 'none' };
        setActiveSnapGuides([]);
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [svgRef]);

  // Delete selected layer via Backspace/Delete key when focus is not inside a text control
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabled || !selectedLayerId) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
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
      const remaining = layersRef.current.filter((l) => l.id !== selectedLayerId);
      onChangeLayersRef.current(remaining);
      onSelectLayer(remaining[remaining.length - 1]?.id ?? null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, selectedLayerId, onSelectLayer]);

  const startMoveDrag = useCallback(
    (layer: CoverImageLayer, clientX: number, clientY: number) => {
      const pt = toSvgMm(clientX, clientY);
      if (!pt) return;
      onSelectLayer(layer.id);
      dragRef.current = {
        mode: 'move',
        layerId: layer.id,
        startXMm: pt.xMm,
        startYMm: pt.yMm,
        origLayer: layer,
      };
    },
    [onSelectLayer, toSvgMm],
  );

  const startResizeDrag = useCallback((layer: CoverImageLayer, corner: ResizeCorner) => {
    dragRef.current = {
      mode: 'resize',
      layerId: layer.id,
      corner,
      origLayer: layer,
    };
  }, []);

  const handleLayerWheel = useCallback((layer: CoverImageLayer, deltaY: number) => {
    const factor = deltaY < 0 ? 1.06 : 0.94;
    const nextLayers = layersRef.current.map((item) => {
      if (item.id !== layer.id) return item;
      const scaled = CoverImageLayerModel.scaleAroundCenter(item, factor);
      return {
        ...scaled,
        layoutConstraint: detachConstraintOnResize(item.layoutConstraint),
      };
    });
    onChangeLayersRef.current(nextLayers);
  }, []);

  return {
    activeSnapGuides,
    suppressNextClickRef,
    toSvgMm,
    startMoveDrag,
    startResizeDrag,
    handleLayerWheel,
  };
}
