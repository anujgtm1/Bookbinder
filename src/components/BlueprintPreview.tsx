import { Download, FileCode2, FileText, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from '@/components/FloatingHudToolbar';
import { Button } from '@/components/ui/button';
import { planInnerTemplateLayout } from '@/core/pdfExport';
import { PAGE_SIZES, type PageSizeId, type SplitMode } from '@/types/bookParams';
import { GeometryPrimitives, type CaseGeometry, type PocketEnvelopeGeometry } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export interface BlueprintPreviewProps {
  readonly geometry: CaseGeometry;
  readonly splitMode: SplitMode;
  readonly pdfPageSize: PageSizeId;
  readonly unit: UnitSystem;
  readonly exportingTarget?: 'outer-pdf' | 'inner-pdf' | null;
  readonly onDownloadOuterSvg: () => void;
  readonly onDownloadOuterPdf: () => void;
  readonly onDownloadInnerSvg: () => void;
  readonly onDownloadInnerPdf: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.5;

const PAPER_SHEET_FILL = '#FAF6EE';
const PAPER_INK_FILL = '#231F1B';

function PocketSvgGroup({
  pocket,
  offsetX,
  offsetY,
  unit,
}: {
  readonly pocket: PocketEnvelopeGeometry;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly unit: UnitSystem;
}) {
  const center = GeometryPrimitives.rectCenter(pocket.faceRect);
  const openX = pocket.openEdge === 'right' ? pocket.faceRect.x + pocket.faceRect.width : 0;

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`}>
      {/* Crisp cotton-paper sheet backing so pattern pops off the spruce cutting mat */}
      <path
        d={GeometryPrimitives.polygonToSvgPath(pocket.outerCutPolygon, 2)}
        fill={PAPER_SHEET_FILL}
      />
      {pocket.glueFlapPolygons.map((flap, idx) => (
        <polygon
          key={idx}
          points={GeometryPrimitives.polygonToSvgPoints(flap, 2)}
          fill="url(#glue-hatch)"
          fillOpacity="0.65"
        />
      ))}
      <path
        d={GeometryPrimitives.polygonToSvgPath(pocket.outerCutPolygon, 2)}
        fill="none"
        stroke="#D93829"
        strokeWidth="1.0"
      />
      {pocket.scoreLines.map((line, idx) => (
        <line
          key={idx}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#1D5BD6"
          strokeWidth="0.75"
          strokeDasharray="4 2.5"
        />
      ))}
      {/* Open edge indicator */}
      <line
        x1={openX}
        y1={pocket.faceRect.y}
        x2={openX}
        y2={pocket.faceRect.y + pocket.faceRect.height}
        stroke="#0F8A47"
        strokeWidth="1.5"
      />
      <text
        x={center.x}
        y={center.y - 6}
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fill={PAPER_INK_FILL}
      >
        {pocket.label.toUpperCase()}
      </text>
      <text
        x={center.x}
        y={center.y + 4}
        textAnchor="middle"
        fontSize="5.5"
        fill={PAPER_INK_FILL}
        opacity="0.75"
      >
        {UnitConverter.formatDimensions(pocket.pocketWidthMm, pocket.pocketHeightMm, unit)}
      </text>
      <text
        x={center.x}
        y={center.y + 13}
        textAnchor="middle"
        fontSize="5"
        fontWeight="600"
        fill="#0F8A47"
      >
        OPEN EDGE: {pocket.openEdge.toUpperCase()} (SPINE)
      </text>
    </g>
  );
}

export function BlueprintPreview({
  geometry,
  splitMode,
  pdfPageSize,
  unit,
  exportingTarget = null,
  onDownloadOuterSvg,
  onDownloadOuterPdf,
  onDownloadInnerSvg,
  onDownloadInnerPdf,
}: BlueprintPreviewProps) {
  const [activeSheet, setActiveSheet] = useState<'outer' | 'inner'>('outer');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const pdfPlan = useMemo(
    () => planInnerTemplateLayout(geometry, pdfPageSize),
    [geometry, pdfPageSize],
  );

  const adjustZoom = (delta: number) => {
    setZoom((prev) => roundTo(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)), 2));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const selectSheet = (sheet: 'outer' | 'inner') => {
    setActiveSheet(sheet);
    resetView();
  };

  const { outerWrap, splitPanels, spineLiner, frontPocket, backPocket, cutList } = geometry;
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

  const innerLayout = useMemo(() => {
    const gap = 18;
    const pad = 16;
    const backX = 0;
    const linerX = backPocket.totalWidthMm + gap;
    const frontX = linerX + spineLiner.widthMm + gap;
    const totalW = frontX + frontPocket.totalWidthMm;
    const maxH = Math.max(backPocket.totalHeightMm, spineLiner.heightMm, frontPocket.totalHeightMm);
    const linerY = (maxH - spineLiner.heightMm) / 2;

    return {
      backX,
      linerX,
      linerY,
      frontX,
      viewBox: `${-pad} ${-pad} ${totalW + pad * 2} ${maxH + pad * 2}`,
    };
  }, [backPocket, spineLiner, frontPocket]);

  return (
    <section
      aria-label="Interactive 1:1 Structural Blueprint"
      data-testid="blueprint-preview-card"
      className="overflow-hidden rounded-b-lg rounded-tr-lg border border-border bg-card shadow-xs"
    >
      {/* Compact Workbench Header + 2 × 2 Export Matrix */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="font-serif text-base font-semibold tracking-tight text-foreground">
            Interactive 1:1 Structural Blueprint
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Drag to pan or scroll to zoom. Cut lines, hinges, and 45° miters export at exact 1:1 mm scale.
          </p>
        </div>

        {/* Clean 2 × 2 Export Matrix: Outer Wrap & Pockets × SVG & PDF */}
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Structural template downloads"
          data-testid="structural-export-matrix"
        >
          <div
            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
              activeSheet === 'outer'
                ? 'border-brass/60 bg-brass/10'
                : 'border-border bg-secondary/45'
            }`}
          >
            <div className="pr-1">
              <p className="text-xs font-semibold leading-tight text-foreground">Outer Wrap</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {splitMode === 'three-piece' ? '3-piece • 1:1 mm' : 'Roll • 1:1 mm'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={activeSheet === 'outer' ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={onDownloadOuterSvg}
                aria-label="Download Outer Case Wrap as SVG"
                data-testid="download-outer-svg-btn"
              >
                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                SVG
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={onDownloadOuterPdf}
                disabled={exportingTarget === 'outer-pdf'}
                aria-label="Download Outer Case Wrap as PDF"
                data-testid="download-outer-pdf-btn"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {exportingTarget === 'outer-pdf' ? '…' : 'PDF'}
              </Button>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
              activeSheet === 'inner'
                ? 'border-brass/60 bg-brass/10'
                : 'border-border bg-secondary/45'
            }`}
          >
            <div className="pr-1">
              <p className="text-xs font-semibold leading-tight text-foreground">
                Pockets &amp; Liner
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {pdfPlan.pageCount}p {PAGE_SIZES[pdfPageSize].id.toUpperCase()} • 1:1 mm
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={onDownloadInnerSvg}
                aria-label="Download Inner Pockets and Spine Liner as SVG"
                data-testid="download-inner-svg-btn"
              >
                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                SVG
              </Button>
              <Button
                variant={activeSheet === 'inner' ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={onDownloadInnerPdf}
                disabled={exportingTarget === 'inner-pdf'}
                aria-label="Download Inner Pockets and Spine Liner as PDF"
                data-testid="download-inner-pdf-btn"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {exportingTarget === 'inner-pdf' ? '…' : 'PDF'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Edge-to-Edge Self-Healing Bindery Cutting Mat Viewport */}
      <div
        id="blueprint-mat-viewport"
        className="cutting-mat-surface relative h-[470px] w-full overflow-hidden border-y border-border/80 select-none cursor-grab active:cursor-grabbing sm:h-[510px]"
        style={{ touchAction: 'none' }}
        onWheel={(e) => {
          e.preventDefault();
          adjustZoom(e.deltaY < 0 ? 0.15 : -0.15);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
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
          setPan({
            x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
            y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
          });
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
        }}
      >
        {/* Top-left subtle cutting-mat scale badge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-[#efe8d8]/85"
        >
          <span>
            {activeSheet === 'outer'
              ? `OUTER WRAP • ${UnitConverter.formatDimensions(outerWrap.widthMm, outerWrap.heightMm, unit)}`
              : `POCKETS & LINER • 1:1 mm`}
          </span>
        </div>

        {/* Top-right pagination badge when viewing Inner Pockets */}
        {activeSheet === 'inner' && (
          <div className="pointer-events-none absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-brass-bright/40 bg-black/35 px-2.5 py-0.5 font-mono text-[11px] text-[#f6efe2]">
            <Download className="h-3 w-3 text-brass-bright" aria-hidden="true" />
            <span>
              {pdfPlan.pageCount} {pdfPlan.pageCount === 1 ? 'page' : 'pages'} •{' '}
              {PAGE_SIZES[pdfPageSize].id.toUpperCase()}
            </span>
          </div>
        )}

        {/* Pannable & Zoomable 1:1 Blueprint Stage */}
        <div
          className="flex h-full w-full items-center justify-center p-6 pb-16"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          {activeSheet === 'outer' ? (
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
          ) : (
            <svg
              role="img"
              aria-label="Inner Spine Liner and Front/Back Slip-In Pocket Envelopes blueprint"
              data-testid="inner-blueprint-svg"
              viewBox={innerLayout.viewBox}
              className="max-h-full max-w-full drop-shadow-[0_14px_26px_rgba(0,0,0,0.42)]"
            >
              <title>Inner Spine Liner and Front &amp; Back Slip-In Pocket Envelopes</title>
              <defs>
                <pattern
                  id="glue-hatch"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#b08968" strokeWidth="1.6" />
                </pattern>
              </defs>

              <PocketSvgGroup
                pocket={backPocket}
                offsetX={innerLayout.backX}
                offsetY={0}
                unit={unit}
              />

              {/* Spine Reinforcement Liner */}
              <g transform={`translate(${innerLayout.linerX}, ${innerLayout.linerY})`}>
                <rect
                  x={0}
                  y={0}
                  width={spineLiner.widthMm}
                  height={spineLiner.heightMm}
                  fill={PAPER_SHEET_FILL}
                  stroke="#D93829"
                  strokeWidth="1.0"
                />
                {spineLiner.scoreLines.map((line, i) => (
                  <line
                    key={i}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#1D5BD6"
                    strokeWidth="0.75"
                    strokeDasharray="4 2.5"
                  />
                ))}
                <text
                  x={spineLiner.widthMm / 2}
                  y={spineLiner.heightMm / 2 - 4}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontWeight="700"
                  fill={PAPER_INK_FILL}
                >
                  SPINE LINER
                </text>
                <text
                  x={spineLiner.widthMm / 2}
                  y={spineLiner.heightMm / 2 + 5}
                  textAnchor="middle"
                  fontSize="5.2"
                  fill={PAPER_INK_FILL}
                  opacity="0.75"
                >
                  {UnitConverter.formatDimensions(spineLiner.widthMm, spineLiner.heightMm, unit)}
                </text>
              </g>

              <PocketSvgGroup
                pocket={frontPocket}
                offsetX={innerLayout.frontX}
                offsetY={0}
                unit={unit}
              />
            </svg>
          )}
        </div>

        {/* Floating Bottom-Center HUD Pill Toolbar */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3.5 z-20 flex justify-center px-3">
          <FloatingHudToolbar
            label="Blueprint sheet and zoom controls"
            controlsId="blueprint-mat-viewport"
            className="pointer-events-auto max-w-full overflow-x-auto"
            testId="blueprint-hud-toolbar"
          >
            <HudGroup label="Template sheet">
              <HudButton
                pressed={activeSheet === 'outer'}
                onClick={() => selectSheet('outer')}
                data-testid="blueprint-tab-outer"
              >
                Outer Wrap ({splitMode === 'three-piece' ? '3-Piece' : 'Single'})
              </HudButton>
              <HudButton
                pressed={activeSheet === 'inner'}
                onClick={() => selectSheet('inner')}
                data-testid="blueprint-tab-inner"
              >
                Pockets &amp; Liner
              </HudButton>
            </HudGroup>

            <HudSeparator />

            <HudGroup label="Viewport zoom">
              <HudButton
                aria-label="Zoom out blueprint"
                title="Zoom out"
                onClick={() => adjustZoom(-0.25)}
                className="px-2"
              >
                <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
              </HudButton>
              <span className="min-w-11 text-center font-mono text-[11px] text-[#f6efe2]/90">
                {Math.round(zoom * 100)}%
              </span>
              <HudButton
                aria-label="Zoom in blueprint"
                title="Zoom in"
                onClick={() => adjustZoom(0.25)}
                className="px-2"
              >
                <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              </HudButton>
              <HudButton
                aria-label="Reset blueprint zoom and pan"
                title="Reset zoom & pan"
                onClick={resetView}
                className="px-2"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              </HudButton>
            </HudGroup>
          </FloatingHudToolbar>
        </div>
      </div>

      {/* Compact Blueprint Legend Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#D93829]" aria-hidden="true" />
            Solid Red: Cut Line (45° Miters)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#1D5BD6]"
              aria-hidden="true"
            />
            Dashed Blue: Board Guides / Score Lines
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#0F8A47]"
              aria-hidden="true"
            />
            Green: Artwork Bleed / Pocket Open Edge
          </span>
        </div>
        <span className="font-mono text-[11px] text-brass">
          Brass zones: {roundTo(cutList.hingeSpacerMm, 1)} mm hinge spacers
        </span>
      </div>
    </section>
  );
}
