import { useMemo, useRef, useState } from 'react';
import type { SplitMode } from '@/types/bookParams';
import { GeometryPrimitives, type CaseGeometry } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export interface OuterBlueprintCanvasProps {
  readonly geometry: CaseGeometry;
  readonly splitMode: SplitMode;
  readonly unit: UnitSystem;
  readonly zoom: number;
  readonly onAdjustZoom: (delta: number) => void;
  readonly pan: { readonly x: number; readonly y: number };
  readonly onPanChange: (next: { readonly x: number; readonly y: number }) => void;
}

const PAPER_SHEET_FILL = '#FAF6EE';

/**
 * Pure 1:1 mm structural CAD blueprint for the Outer Case Wrap
 * (supports Single-Piece Continuous Wrap and 3-Piece Quarter-Bound Split with zoom & pan).
 */
export function OuterBlueprintCanvas({
  geometry,
  splitMode,
  unit,
  zoom,
  onAdjustZoom,
  pan,
  onPanChange,
}: OuterBlueprintCanvasProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const { outerWrap, splitPanels, cutList } = geometry;
  const bleedPad = outerWrap.includeBleed ? outerWrap.bleedMm : 0;

  const outerLayout = useMemo(() => {
    const pad = 14 + bleedPad;
    if (splitMode === 'three-piece') {
      const gap = 14;
      let cursorX = 0;
      const positionedPanels = splitPanels.map((panel) => {
        const xOffset = cursorX;
        cursorX += panel.widthMm + gap;
        return { panel, xOffset };
      });
      const totalW = Math.max(0, cursorX - gap);
      return {
        viewBox: `${-pad} ${-pad} ${totalW + pad * 2} ${outerWrap.heightMm + pad * 2}`,
        positionedPanels,
      };
    }
    return {
      viewBox: `${-pad} ${-pad} ${outerWrap.widthMm + pad * 2} ${outerWrap.heightMm + pad * 2}`,
      positionedPanels: [],
    };
  }, [outerWrap, splitPanels, splitMode, bleedPad]);

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center p-6 pb-16 select-none ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{ touchAction: 'none' }}
      onWheel={(e) => {
        e.preventDefault();
        onAdjustZoom(e.deltaY < 0 ? 0.15 : -0.15);
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
        dragRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          origX: pan.x,
          origY: pan.y,
        };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current.active) return;
        onPanChange({
          x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
          y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
        });
      }}
      onPointerUp={() => {
        dragRef.current.active = false;
        setDragging(false);
      }}
      onPointerCancel={() => {
        dragRef.current.active = false;
        setDragging(false);
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-3 left-3 z-10 rounded-full border border-white/15 bg-black/25 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-[#efe8d8]/85"
      >
        OUTER WRAP CAD • {UnitConverter.formatDimensions(outerWrap.widthMm, outerWrap.heightMm, unit)}
        {splitMode === 'three-piece' ? ' • 3-PIECE SPLIT' : ''}
      </div>

      <div
        className="flex h-full w-full items-center justify-center"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        <svg
          role="img"
          aria-label="Outer Case Wrap 1:1 structural blueprint"
          data-testid="outer-blueprint-svg"
          viewBox={outerLayout.viewBox}
          className="max-h-full max-w-full drop-shadow-[0_14px_26px_rgba(0,0,0,0.42)]"
        >
          <title>
            Outer Case Wrap Blueprint —{' '}
            {UnitConverter.formatDimensions(outerWrap.widthMm, outerWrap.heightMm, unit)}
          </title>

          {splitMode === 'single' ? (
            <g>
              {outerWrap.includeBleed && outerWrap.bleedMm > 0 && (
                <rect
                  x={outerWrap.bleedRect.x}
                  y={outerWrap.bleedRect.y}
                  width={outerWrap.bleedRect.width}
                  height={outerWrap.bleedRect.height}
                  fill="none"
                  stroke="#4ADE80"
                  strokeWidth="0.95"
                  strokeDasharray="5 3"
                  data-testid="blueprint-bleed-rect"
                />
              )}
              <path
                d={GeometryPrimitives.polygonToSvgPath(outerWrap.outerCutPolygon, 2)}
                fill={PAPER_SHEET_FILL}
                stroke="#D93829"
                strokeWidth="1.25"
                data-testid="blueprint-cut-polygon"
              />

              {[
                { label: 'BACK BOARD', rect: outerWrap.backBoardRect },
                { label: 'SPINE', rect: outerWrap.spineRect },
                { label: 'FRONT BOARD', rect: outerWrap.frontBoardRect },
              ].map(({ label, rect }) => {
                const c = GeometryPrimitives.rectCenter(rect);
                return (
                  <g key={label}>
                    <rect
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      fill="#1D5BD6"
                      fillOpacity="0.06"
                      stroke="#1D5BD6"
                      strokeWidth="0.9"
                      strokeDasharray="6 3"
                    />
                    <text
                      x={c.x}
                      y={c.y - (label === 'SPINE' ? 0 : 5)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={label === 'SPINE' ? '6.5' : '8'}
                      fontWeight="700"
                      fill="#1D5BD6"
                      transform={label === 'SPINE' ? `rotate(-90 ${c.x} ${c.y})` : undefined}
                    >
                      {label}
                    </text>
                    {label !== 'SPINE' && (
                      <text
                        x={c.x}
                        y={c.y + 6}
                        textAnchor="middle"
                        fontSize="6"
                        fill="#1D5BD6"
                        opacity="0.88"
                      >
                        {UnitConverter.formatDimensions(rect.width, rect.height, unit)}
                      </text>
                    )}
                  </g>
                );
              })}

              {[outerWrap.leftHingeRect, outerWrap.rightHingeRect].map((hinge, i) => {
                const c = GeometryPrimitives.rectCenter(hinge);
                return (
                  <g key={i}>
                    <rect
                      x={hinge.x}
                      y={hinge.y}
                      width={hinge.width}
                      height={hinge.height}
                      fill="#C59B48"
                      fillOpacity="0.18"
                      stroke="#A67B2E"
                      strokeWidth="0.65"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={c.x}
                      y={c.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="5"
                      fontWeight="700"
                      fill="#8A6019"
                      transform={`rotate(-90 ${c.x} ${c.y})`}
                    >
                      {roundTo(cutList.hingeSpacerMm, 1)} mm
                    </text>
                  </g>
                );
              })}
            </g>
          ) : (
            <g data-testid="blueprint-split-panels">
              {outerLayout.positionedPanels.map(({ panel, xOffset }) => (
                <g key={panel.id} transform={`translate(${xOffset}, 0)`}>
                  {outerWrap.includeBleed && outerWrap.bleedMm > 0 && (
                    <rect
                      x={-outerWrap.bleedMm}
                      y={-outerWrap.bleedMm}
                      width={panel.widthMm + outerWrap.bleedMm * 2}
                      height={panel.heightMm + outerWrap.bleedMm * 2}
                      fill="none"
                      stroke="#4ADE80"
                      strokeWidth="0.95"
                      strokeDasharray="5 3"
                    />
                  )}
                  <path
                    d={GeometryPrimitives.polygonToSvgPath(panel.cutPolygon, 2)}
                    fill={PAPER_SHEET_FILL}
                    stroke="#D93829"
                    strokeWidth="1.25"
                  />
                  {panel.guideRects.map((g) => (
                    <rect
                      key={g.label}
                      x={g.rect.x}
                      y={g.rect.y}
                      width={g.rect.width}
                      height={g.rect.height}
                      fill="#1D5BD6"
                      fillOpacity="0.07"
                      stroke="#1D5BD6"
                      strokeWidth="0.8"
                      strokeDasharray="5 2.5"
                    />
                  ))}
                  <text
                    x={panel.widthMm / 2}
                    y={panel.heightMm / 2 - 4}
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="700"
                    fill="#1D5BD6"
                  >
                    {panel.label.toUpperCase()}
                  </text>
                  <text
                    x={panel.widthMm / 2}
                    y={panel.heightMm / 2 + 6}
                    textAnchor="middle"
                    fontSize="5.8"
                    fill="#1D5BD6"
                  >
                    {UnitConverter.formatDimensions(panel.widthMm, panel.heightMm, unit)}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
