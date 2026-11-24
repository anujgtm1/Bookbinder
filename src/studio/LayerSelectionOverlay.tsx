import type { Rect2D } from '@/types/geometry';
import {
  getLayerVisualRect,
  type CoverImageLayer,
  type ResizeCorner,
} from '@/types/studioLayer';
import type { ActiveSnapGuide } from './snapGuides';

const CORNER_CURSORS: Readonly<Record<ResizeCorner, string>> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
};

export interface LayerSelectionOverlayProps {
  /** Bounds in SVG mm coordinates across which snap guide lines extend */
  readonly canvasBounds: Rect2D;
  readonly activeSnapGuides: readonly ActiveSnapGuide[];
  readonly selectedLayer: CoverImageLayer | null;
  /** Optional dashed cyan outline showing the layer's active clip boundary */
  readonly clipBoundaryRect?: Rect2D | null;
  /** Hide selection frame & handles (e.g. while Eyedropper mode is active) */
  readonly hideSelection?: boolean;
  readonly snapGlowFilterId?: string;
  readonly handleCornerSizeMm?: number;
  readonly onStartResize: (layer: CoverImageLayer, corner: ResizeCorner) => void;
}

/**
 * Shared SVG overlay rendering glowing brass magnetic snap guides,
 * dashed brass selection frame, optional clip-boundary outline,
 * and 4 interactive corner resize handles for both Outer Cover and Inner Pockets canvases.
 */
export function LayerSelectionOverlay({
  canvasBounds,
  activeSnapGuides,
  selectedLayer,
  clipBoundaryRect,
  hideSelection = false,
  snapGlowFilterId = 'brass-snap-glow',
  handleCornerSizeMm = 6,
  onStartResize,
}: LayerSelectionOverlayProps) {
  const minX = canvasBounds.x;
  const maxX = canvasBounds.x + canvasBounds.width;
  const minY = canvasBounds.y;
  const maxY = canvasBounds.y + canvasBounds.height;

  return (
    <>
      {/* Glowing Brass Magnetic Snap Guides (visible only while dragging/resizing) */}
      {activeSnapGuides.length > 0 && (
        <g
          data-testid="studio-snap-guides"
          pointerEvents="none"
          filter={`url(#${snapGlowFilterId})`}
        >
          {activeSnapGuides.map((guide, idx) => {
            const isCenter = guide.kind === 'center';
            if (guide.axis === 'x') {
              const labelX = Math.min(maxX - 24, Math.max(minX + 24, guide.positionMm));
              return (
                <g key={`snap-x-${idx}`} data-testid="snap-guide-line">
                  <line
                    x1={guide.positionMm}
                    y1={minY}
                    x2={guide.positionMm}
                    y2={maxY}
                    stroke="#fde047"
                    strokeWidth={isCenter ? '1.25' : '1.05'}
                    strokeDasharray={isCenter ? '5 2.5' : undefined}
                  />
                  <rect
                    x={labelX - 22}
                    y={minY + 5}
                    width={44}
                    height={7.5}
                    rx={2}
                    fill="#1c1917"
                    fillOpacity="0.92"
                    stroke="#facc15"
                    strokeWidth="0.5"
                  />
                  <text
                    x={labelX}
                    y={minY + 9.1}
                    fill="#fef08a"
                    fontSize="4.2"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {guide.label}
                  </text>
                </g>
              );
            }
            const labelY = Math.min(maxY - 10, Math.max(minY + 10, guide.positionMm));
            return (
              <g key={`snap-y-${idx}`} data-testid="snap-guide-line">
                <line
                  x1={minX}
                  y1={guide.positionMm}
                  x2={maxX}
                  y2={guide.positionMm}
                  stroke="#fde047"
                  strokeWidth={isCenter ? '1.25' : '1.05'}
                  strokeDasharray={isCenter ? '5 2.5' : undefined}
                />
                <rect
                  x={minX + 5}
                  y={labelY - 3.75}
                  width={42}
                  height={7.5}
                  rx={2}
                  fill="#1c1917"
                  fillOpacity="0.92"
                  stroke="#facc15"
                  strokeWidth="0.5"
                />
                <text
                  x={minX + 26}
                  y={labelY + 0.35}
                  fill="#fef08a"
                  fontSize="4.2"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {guide.label}
                </text>
              </g>
            );
          })}
          {/* Intersection brass diamond marker when both X and Y snap simultaneously */}
          {(() => {
            const xG = activeSnapGuides.find((g) => g.axis === 'x');
            const yG = activeSnapGuides.find((g) => g.axis === 'y');
            if (!xG || !yG) return null;
            return (
              <polygon
                points={`${xG.positionMm},${yG.positionMm - 3.2} ${xG.positionMm + 3.2},${yG.positionMm} ${xG.positionMm},${yG.positionMm + 3.2} ${xG.positionMm - 3.2},${yG.positionMm}`}
                fill="#fef08a"
                stroke="#1c1917"
                strokeWidth="0.6"
              />
            );
          })()}
        </g>
      )}

      {/* Selection Frame & Corner Resize Handles for Selected Layer */}
      {selectedLayer && !hideSelection && (() => {
        const visualRect = getLayerVisualRect(selectedLayer);
        return (
          <g data-testid="studio-selection-handles">
            {clipBoundaryRect && (
              <rect
                x={clipBoundaryRect.x}
                y={clipBoundaryRect.y}
                width={clipBoundaryRect.width}
                height={clipBoundaryRect.height}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="0.8"
                strokeDasharray="3 2"
                pointerEvents="none"
              />
            )}
            <rect
              x={visualRect.x}
              y={visualRect.y}
              width={visualRect.width}
              height={visualRect.height}
              fill="none"
              stroke="#dfb96a"
              strokeWidth="1.25"
              strokeDasharray="4 2"
              pointerEvents="none"
            />
            {(
              [
                { corner: 'nw' as const, x: visualRect.x, y: visualRect.y },
                {
                  corner: 'ne' as const,
                  x: visualRect.x + visualRect.width,
                  y: visualRect.y,
                },
                {
                  corner: 'se' as const,
                  x: visualRect.x + visualRect.width,
                  y: visualRect.y + visualRect.height,
                },
                {
                  corner: 'sw' as const,
                  x: visualRect.x,
                  y: visualRect.y + visualRect.height,
                },
              ] as const
            ).map((handle) => (
              <rect
                key={handle.corner}
                x={handle.x - handleCornerSizeMm / 2}
                y={handle.y - handleCornerSizeMm / 2}
                width={handleCornerSizeMm}
                height={handleCornerSizeMm}
                rx={1}
                fill="#faf6ee"
                stroke="#1e4d44"
                strokeWidth="1.1"
                style={{ cursor: CORNER_CURSORS[handle.corner] }}
                data-testid={`resize-handle-${handle.corner}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onStartResize(selectedLayer, handle.corner);
                }}
              />
            ))}
          </g>
        );
      })()}
    </>
  );
}
