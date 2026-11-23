import { useMemo, useRef, useState } from 'react';
import { getBindingStrategy } from '@/core/bindingStyles';
import type { SplitMode } from '@/types/bookParams';
import { GeometryPrimitives, type CaseGeometry } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';
import {
  CornerMiterCallout,
  CumulativeRulerStrip,
  GrainDirectionArrow,
  HorizontalDimLine,
  VerticalDimLine,
  type CumulativeRulerStop,
} from './BlueprintDimensionLines';

export interface OuterBlueprintCanvasProps {
  readonly geometry: CaseGeometry;
  readonly splitMode: SplitMode;
  readonly unit: UnitSystem;
  readonly zoom: number;
  readonly onAdjustZoom: (delta: number) => void;
  readonly pan: { readonly x: number; readonly y: number };
  readonly onPanChange: (next: { readonly x: number; readonly y: number }) => void;
  readonly showDimensions?: boolean;
}

const PAPER_SHEET_FILL = '#FAF6EE';

/**
 * Pure 1:1 mm structural CAD blueprint for the Outer Case Wrap
 * (supports Single-Piece Continuous Wrap and 3-Piece Quarter-Bound Split with zoom, pan,
 * and architectural manual-cutting dimension lines for non-printable materials like leather & bookcloth).
 */
export function OuterBlueprintCanvas({
  geometry,
  splitMode,
  unit,
  zoom,
  onAdjustZoom,
  pan,
  onPanChange,
  showDimensions = true,
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
  const strategy = getBindingStrategy(outerWrap.bindingStyle);
  const { capabilities, panelLabels } = strategy;
  const effectiveSplitMode: SplitMode = capabilities.supportsThreePieceSplit ? splitMode : 'single';
  const bleedPad = outerWrap.includeBleed ? outerWrap.bleedMm : 0;

  const outerLayout = useMemo(() => {
    const padLeft = (showDimensions ? 38 : 14) + bleedPad;
    const padRight = (showDimensions ? 32 : 14) + bleedPad;
    const padTop = (showDimensions ? 36 : 14) + bleedPad;
    const padBottom = (showDimensions ? 34 : 14) + bleedPad;

    if (effectiveSplitMode === 'three-piece') {
      const gap = showDimensions ? 20 : 14;
      let cursorX = 0;
      const positionedPanels = splitPanels.map((panel) => {
        const xOffset = cursorX;
        cursorX += panel.widthMm + gap;
        return { panel, xOffset };
      });
      const totalW = Math.max(0, cursorX - gap);
      return {
        viewBox: `${-padLeft} ${-padTop} ${totalW + padLeft + padRight} ${outerWrap.heightMm + padTop + padBottom}`,
        positionedPanels,
      };
    }
    return {
      viewBox: `${-padLeft} ${-padTop} ${outerWrap.widthMm + padLeft + padRight} ${outerWrap.heightMm + padTop + padBottom}`,
      positionedPanels: [],
    };
  }, [outerWrap, splitPanels, effectiveSplitMode, bleedPad, showDimensions]);

  const singleHorizontalSegments = useMemo(() => {
    const segs: { readonly x1: number; readonly x2: number }[] = [];
    const sideW = capabilities.hasFlaps
      ? outerWrap.jacketFlapWidthMm
      : capabilities.hasTurnIns
        ? outerWrap.turnInMm
        : 0;

    if (sideW > 0.2) segs.push({ x1: 0, x2: sideW });
    segs.push({
      x1: outerWrap.backBoardRect.x,
      x2: outerWrap.backBoardRect.x + outerWrap.backBoardRect.width,
    });
    if (outerWrap.leftHingeRect.width > 0.2) {
      segs.push({
        x1: outerWrap.leftHingeRect.x,
        x2: outerWrap.leftHingeRect.x + outerWrap.leftHingeRect.width,
      });
    }
    segs.push({
      x1: outerWrap.spineRect.x,
      x2: outerWrap.spineRect.x + outerWrap.spineRect.width,
    });
    if (outerWrap.rightHingeRect.width > 0.2) {
      segs.push({
        x1: outerWrap.rightHingeRect.x,
        x2: outerWrap.rightHingeRect.x + outerWrap.rightHingeRect.width,
      });
    }
    segs.push({
      x1: outerWrap.frontBoardRect.x,
      x2: outerWrap.frontBoardRect.x + outerWrap.frontBoardRect.width,
    });
    if (sideW > 0.2) {
      segs.push({ x1: outerWrap.widthMm - sideW, x2: outerWrap.widthMm });
    }
    return segs;
  }, [outerWrap, capabilities.hasFlaps, capabilities.hasTurnIns]);

  const cumulativeStops = useMemo<readonly CumulativeRulerStop[]>(() => {
    const pts: number[] = [0];
    for (const seg of singleHorizontalSegments) {
      pts.push(seg.x1, seg.x2);
    }
    pts.push(outerWrap.widthMm);
    return pts.map((xMm) => ({ xMm }));
  }, [singleHorizontalSegments, outerWrap.widthMm]);

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
        {effectiveSplitMode === 'three-piece' ? ' • 3-PIECE SPLIT' : ''}
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
          <defs>
            <pattern
              id="outer-glue-hatch"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="5" height="5" fill="#C59B48" fillOpacity="0.16" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="#A67B2E" strokeWidth="0.9" strokeOpacity="0.6" />
            </pattern>
          </defs>

          {effectiveSplitMode === 'single' ? (
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
                { label: panelLabels.back, rect: outerWrap.backBoardRect, isSpine: false },
                { label: panelLabels.spine, rect: outerWrap.spineRect, isSpine: true },
                { label: panelLabels.front, rect: outerWrap.frontBoardRect, isSpine: false },
              ].map(({ label, rect, isSpine }) => {
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
                      y={c.y - (isSpine ? 0 : 5)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={isSpine ? '6.2' : '8'}
                      fontWeight="700"
                      fill="#1D5BD6"
                      transform={isSpine ? `rotate(-90 ${c.x} ${c.y})` : undefined}
                    >
                      {label}
                    </text>
                    {!isSpine && (
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

              {/* Strategy fold / score dashed lines */}
              {outerWrap.foldLines.length > 0 && (
                <g data-testid="blueprint-fold-lines">
                  {outerWrap.foldLines.map((line, idx) => (
                    <line
                      key={`fold-${idx}`}
                      data-testid="blueprint-fold-line"
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke="#1D5BD6"
                      strokeWidth="0.85"
                      strokeDasharray="4 2.5"
                      opacity="0.78"
                    />
                  ))}
                </g>
              )}

              {/* Rigid hinge spacers (only when hingeSpacerMm > 0) */}
              {cutList.hingeSpacerMm > 0 &&
                [outerWrap.leftHingeRect, outerWrap.rightHingeRect].map((hinge, i) => {
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

              {/* Integrated Flaps (Slip Cover & Classic Dust Jacket) + Mitered Glue Tabs (Slip Cover only) */}
              {capabilities.hasFlaps && outerWrap.jacketFlapWidthMm > 0 && (
                <g data-testid="blueprint-softcover-flaps-and-tabs">
                  {capabilities.hasGlueTabs &&
                    outerWrap.jacketGlueTabPolygons.map((tabPoly, idx) => {
                      const bbox = GeometryPrimitives.boundingBox(tabPoly);
                      const cx = bbox.x + bbox.width / 2;
                      const cy = bbox.y + bbox.height / 2;
                      return (
                        <g key={`glue-tab-${idx}`}>
                          <path
                            d={GeometryPrimitives.polygonToSvgPath(tabPoly, 2)}
                            fill="url(#outer-glue-hatch)"
                            stroke="#A67B2E"
                            strokeWidth="0.65"
                            strokeDasharray="2.5 1.8"
                          />
                          <text
                            x={cx}
                            y={cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="3.4"
                            fontWeight="700"
                            fill="#7A5212"
                          >
                            GLUE
                          </text>
                        </g>
                      );
                    })}
                  {[
                    {
                      key: 'left-flap',
                      label: panelLabels.leftFlap ?? 'BACK FLAP',
                      rect: {
                        x: 0,
                        y: outerWrap.backBoardRect.y,
                        width: outerWrap.jacketFlapWidthMm,
                        height: outerWrap.backBoardRect.height,
                      },
                    },
                    {
                      key: 'right-flap',
                      label: panelLabels.rightFlap ?? 'FRONT FLAP',
                      rect: {
                        x: outerWrap.widthMm - outerWrap.jacketFlapWidthMm,
                        y: outerWrap.frontBoardRect.y,
                        width: outerWrap.jacketFlapWidthMm,
                        height: outerWrap.frontBoardRect.height,
                      },
                    },
                  ].map(({ key, label, rect }) => {
                    const c = GeometryPrimitives.rectCenter(rect);
                    return (
                      <g key={key}>
                        <rect
                          x={rect.x}
                          y={rect.y}
                          width={rect.width}
                          height={rect.height}
                          fill="#C59B48"
                          fillOpacity="0.14"
                          stroke="#A67B2E"
                          strokeWidth="0.7"
                          strokeDasharray="3 2"
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
                          {label} ({roundTo(outerWrap.jacketFlapWidthMm, 1)} mm)
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Manual-Cutting CAD Dimension Lines, Cumulative Ruler, Miter Callout & Grain Arrow */}
              {showDimensions && (
                <g data-testid="outer-blueprint-dimensions">
                  {/* Grain Direction parallel to spine */}
                  <GrainDirectionArrow
                    x={outerWrap.backBoardRect.x + outerWrap.backBoardRect.width - 14}
                    centerY={outerWrap.heightMm / 2}
                  />

                  {/* Overall Total Width along top */}
                  <HorizontalDimLine
                    x1={0}
                    x2={outerWrap.widthMm}
                    y={-25 - bleedPad}
                    anchorY={0}
                    label={`TOTAL W: ${UnitConverter.format(outerWrap.widthMm, unit)}`}
                    emphasized
                  />

                  {/* Horizontal segment breakdown chain */}
                  {singleHorizontalSegments.map((seg, idx) => (
                    <HorizontalDimLine
                      key={`hseg-${idx}`}
                      x1={seg.x1}
                      x2={seg.x2}
                      y={-10 - bleedPad}
                      anchorY={0}
                      label={UnitConverter.formatValue(seg.x2 - seg.x1, unit)}
                      fontSize={4.2}
                    />
                  ))}

                  {/* Overall Total Height along left */}
                  <VerticalDimLine
                    y1={0}
                    y2={outerWrap.heightMm}
                    x={-16 - bleedPad}
                    anchorX={0}
                    label={`TOTAL H: ${UnitConverter.format(outerWrap.heightMm, unit)}`}
                    emphasized
                  />

                  {/* Right Vertical Breakdown Chain (Top Margin | Cover/Board Height | Bottom Margin) */}
                  {(() => {
                    const vMargin = capabilities.hasGlueTabs
                      ? outerWrap.jacketGlueTabHeightMm
                      : capabilities.hasTurnIns
                        ? outerWrap.turnInMm
                        : 0;
                    if (vMargin <= 0.2) {
                      return (
                        <VerticalDimLine
                          y1={0}
                          y2={outerWrap.heightMm}
                          x={outerWrap.widthMm + 11 + bleedPad}
                          anchorX={outerWrap.widthMm}
                          label={UnitConverter.format(outerWrap.heightMm, unit)}
                          fontSize={4.4}
                        />
                      );
                    }
                    return (
                      <>
                        <VerticalDimLine
                          y1={0}
                          y2={vMargin}
                          x={outerWrap.widthMm + 11 + bleedPad}
                          anchorX={outerWrap.widthMm}
                          label={UnitConverter.formatValue(vMargin, unit)}
                          fontSize={4.2}
                        />
                        <VerticalDimLine
                          y1={vMargin}
                          y2={outerWrap.heightMm - vMargin}
                          x={outerWrap.widthMm + 11 + bleedPad}
                          anchorX={outerWrap.widthMm}
                          label={UnitConverter.format(cutList.coverBoards.heightMm, unit)}
                          fontSize={4.4}
                        />
                        <VerticalDimLine
                          y1={outerWrap.heightMm - vMargin}
                          y2={outerWrap.heightMm}
                          x={outerWrap.widthMm + 11 + bleedPad}
                          anchorX={outerWrap.widthMm}
                          label={UnitConverter.formatValue(vMargin, unit)}
                          fontSize={4.2}
                        />
                      </>
                    );
                  })()}

                  {/* Cumulative Steel-Ruler Datum Strip from 0 along bottom edge */}
                  <CumulativeRulerStrip
                    stops={cumulativeStops}
                    y={outerWrap.heightMm + 12 + bleedPad}
                    anchorY={outerWrap.heightMm}
                    unit={unit}
                  />

                  {/* Exact 45° Corner Miter Cut Leg & Board Clearance Gap Callout (turn-in styles only) */}
                  {capabilities.hasTurnIns && (
                    <CornerMiterCallout
                      miterCutLegMm={outerWrap.miterCutLegMm}
                      miterGapMm={outerWrap.miterGapMm}
                      unit={unit}
                    />
                  )}
                </g>
              )}
            </g>
          ) : (
            <g data-testid="blueprint-split-panels">
              {outerLayout.positionedPanels.map(({ panel, xOffset }, panelIdx) => (
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

                  {showDimensions && (
                    <g data-testid={`split-panel-dims-${panel.id}`}>
                      <HorizontalDimLine
                        x1={0}
                        x2={panel.widthMm}
                        y={-13 - bleedPad}
                        anchorY={0}
                        label={UnitConverter.format(panel.widthMm, unit)}
                        emphasized
                        fontSize={4.5}
                      />
                      {panelIdx === 0 && (
                        <VerticalDimLine
                          y1={0}
                          y2={panel.heightMm}
                          x={-16 - bleedPad}
                          anchorX={0}
                          label={UnitConverter.format(panel.heightMm, unit)}
                          emphasized
                          fontSize={4.5}
                        />
                      )}
                      {panel.id === 'spine' &&
                        panel.guideRects.map((g, gi) => (
                          <HorizontalDimLine
                            key={`sp-sub-${gi}`}
                            x1={g.rect.x}
                            x2={g.rect.x + g.rect.width}
                            y={panel.heightMm + 11 + bleedPad}
                            anchorY={panel.heightMm}
                            label={UnitConverter.formatValue(g.rect.width, unit)}
                            fontSize={3.9}
                          />
                        ))}
                    </g>
                  )}
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
