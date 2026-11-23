import {
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  ImagePlus,
  Layers,
  Maximize2,
  Palette,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from '@/components/FloatingHudToolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { planInnerTemplateLayout } from '@/core/pdfExport';
import { triggerBytesDownload } from '@/core/storage';
import { PAGE_SIZES, type PageSizeId } from '@/types/bookParams';
import {
  GeometryPrimitives,
  type CaseGeometry,
  type PocketEnvelopeGeometry,
  type Rect2D,
} from '@/types/geometry';
import {
  ENDPAPER_SWATCHES,
  STUDIO_BOUNDS,
  type PocketImageFitMode,
  type PocketStyleConfig,
  type PocketStyleScope,
} from '@/types/studio';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';
import {
  computePocketImagePlacement,
  generateStyledInnerTemplatesPdf,
} from './pocketRenderEngine';

export interface InnerPocketsStudioProps {
  readonly geometry: CaseGeometry;
  readonly pocketStyle: PocketStyleConfig;
  readonly coverMatchColor: string;
  readonly pdfPageSize: PageSizeId;
  readonly unit: UnitSystem;
  readonly exportingInnerPdf?: boolean;
  readonly onChangePocketStyle: (next: PocketStyleConfig) => void;
  readonly onDownloadInnerSvg: () => void;
  readonly onDownloadInnerPdf: () => void;
  readonly onStatusMessage: (message: string) => void;
}

type PocketViewMode = 'styled' | 'blueprint';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.5;
const PAPER_SHEET_FILL = '#FAF6EE';
const PAPER_INK_FILL = '#231F1B';

function readImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Unsupported or unreadable image file.'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

interface StyledPocketPieceProps {
  readonly idPrefix: string;
  readonly pocket: PocketEnvelopeGeometry;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly unit: UnitSystem;
  readonly style: PocketStyleConfig;
  readonly viewMode: PocketViewMode;
  readonly showGuides: boolean;
}

function PocketPieceSvg({
  idPrefix,
  pocket,
  offsetX,
  offsetY,
  unit,
  style,
  viewMode,
  showGuides,
}: StyledPocketPieceProps) {
  const center = GeometryPrimitives.rectCenter(pocket.faceRect);
  const openX = pocket.openEdge === 'right' ? pocket.faceRect.x + pocket.faceRect.width : 0;
  const clipId = `${idPrefix}-clip`;
  const tilePatternId = `${idPrefix}-tile`;
  const isStyled = viewMode === 'styled';

  const styleTargetRect: Rect2D =
    style.styleScope === 'full-envelope'
      ? { x: 0, y: 0, width: pocket.totalWidthMm, height: pocket.totalHeightMm }
      : pocket.faceRect;

  const imgPlacement =
    isStyled && style.imageDataUrl
      ? computePocketImagePlacement(
          styleTargetRect,
          style.imageNaturalWidth || 100,
          style.imageNaturalHeight || 100,
          style.imageFitMode,
          style.imageScale,
        )
      : null;

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`}>
      <defs>
        <clipPath id={clipId}>
          {style.styleScope === 'full-envelope' ? (
            <path d={GeometryPrimitives.polygonToSvgPath(pocket.outerCutPolygon, 2)} />
          ) : (
            <rect
              x={pocket.faceRect.x}
              y={pocket.faceRect.y}
              width={pocket.faceRect.width}
              height={pocket.faceRect.height}
            />
          )}
        </clipPath>
        {isStyled && style.imageDataUrl && style.imageFitMode === 'tile' && imgPlacement && (
          <pattern
            id={tilePatternId}
            x={styleTargetRect.x}
            y={styleTargetRect.y}
            width={imgPlacement.width}
            height={imgPlacement.height}
            patternUnits="userSpaceOnUse"
          >
            <image
              href={style.imageDataUrl}
              x={0}
              y={0}
              width={imgPlacement.width}
              height={imgPlacement.height}
              preserveAspectRatio="none"
            />
          </pattern>
        )}
      </defs>

      {/* Base paper sheet backing */}
      <path
        d={GeometryPrimitives.polygonToSvgPath(pocket.outerCutPolygon, 2)}
        fill={PAPER_SHEET_FILL}
      />

      {/* Styled endpaper fill & optional custom image */}
      {isStyled && (
        <g clipPath={`url(#${clipId})`} data-testid={`styled-${pocket.side}-pocket`}>
          <rect
            x={styleTargetRect.x}
            y={styleTargetRect.y}
            width={styleTargetRect.width}
            height={styleTargetRect.height}
            fill={style.backgroundColor}
            data-testid={`styled-${pocket.side}-pocket-fill`}
          />
          {style.imageDataUrl && imgPlacement && (
            <g opacity={style.imageOpacity}>
              {style.imageFitMode === 'tile' ? (
                <rect
                  x={styleTargetRect.x}
                  y={styleTargetRect.y}
                  width={styleTargetRect.width}
                  height={styleTargetRect.height}
                  fill={`url(#${tilePatternId})`}
                />
              ) : (
                <image
                  href={style.imageDataUrl}
                  x={imgPlacement.x}
                  y={imgPlacement.y}
                  width={imgPlacement.width}
                  height={imgPlacement.height}
                  preserveAspectRatio="none"
                />
              )}
            </g>
          )}
        </g>
      )}

      {/* Glue flap hatches & structural cut/score lines */}
      {(viewMode === 'blueprint' || showGuides) && (
        <>
          {pocket.glueFlapPolygons.map((flap, idx) => (
            <polygon
              key={idx}
              points={GeometryPrimitives.polygonToSvgPoints(flap, 2)}
              fill="url(#inner-glue-hatch)"
              fillOpacity={isStyled ? '0.45' : '0.65'}
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
          <line
            x1={openX}
            y1={pocket.faceRect.y}
            x2={openX}
            y2={pocket.faceRect.y + pocket.faceRect.height}
            stroke="#0F8A47"
            strokeWidth="1.5"
          />
        </>
      )}

      {/* Dimension labels in Blueprint mode */}
      {viewMode === 'blueprint' && (
        <>
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
        </>
      )}
    </g>
  );
}

export function InnerPocketsStudio({
  geometry,
  pocketStyle,
  coverMatchColor,
  pdfPageSize,
  unit,
  exportingInnerPdf = false,
  onChangePocketStyle,
  onDownloadInnerSvg,
  onDownloadInnerPdf,
  onStatusMessage,
}: InnerPocketsStudioProps) {
  const uniquePrefix = useId().replace(/:/g, '');
  const [viewMode, setViewMode] = useState<PocketViewMode>('styled');
  const [showGuides, setShowGuides] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportingStyledPdf, setExportingStyledPdf] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const pdfPlan = useMemo(
    () => planInnerTemplateLayout(geometry, pdfPageSize),
    [geometry, pdfPageSize],
  );

  const { backPocket, spineLiner, frontPocket } = geometry;

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

  const updateStyle = (patch: Partial<PocketStyleConfig>) => {
    onChangePocketStyle({ ...pocketStyle, ...patch });
  };

  const adjustZoom = (delta: number) => {
    setZoom((prev) => roundTo(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)), 2));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleUploadImage = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      onStatusMessage('Please upload a PNG, JPG, or WEBP image for the inner pockets.');
      return;
    }
    try {
      const decoded = await readImageFile(file);
      updateStyle({
        imageDataUrl: decoded.dataUrl,
        imageFileName: file.name,
        imageNaturalWidth: decoded.width,
        imageNaturalHeight: decoded.height,
      });
      setViewMode('styled');
      onStatusMessage(`Applied "${file.name}" to inner pockets & liner`);
    } catch {
      onStatusMessage(`Could not read image "${file.name}".`);
    }
  };

  const handleDownloadStyledPdf = async () => {
    setExportingStyledPdf(true);
    try {
      const { bytes, plan } = await generateStyledInnerTemplatesPdf(
        geometry,
        pdfPageSize,
        pocketStyle,
      );
      triggerBytesDownload(bytes, 'inner_pockets_styled.pdf', 'application/pdf');
      onStatusMessage(
        `Exported inner_pockets_styled.pdf (${plan.pageCount} ${plan.pageCount === 1 ? 'page' : 'pages'}, 300 DPI)`,
      );
    } catch {
      onStatusMessage('Failed to generate Styled Pockets PDF.');
    } finally {
      setExportingStyledPdf(false);
    }
  };

  const linerRect: Rect2D = {
    x: 0,
    y: 0,
    width: spineLiner.widthMm,
    height: spineLiner.heightMm,
  };
  const linerImgPlacement =
    viewMode === 'styled' && pocketStyle.imageDataUrl
      ? computePocketImagePlacement(
          linerRect,
          pocketStyle.imageNaturalWidth || 100,
          pocketStyle.imageNaturalHeight || 100,
          pocketStyle.imageFitMode,
          pocketStyle.imageScale,
        )
      : null;

  return (
    <div className="flex flex-col gap-4" data-testid="inner-pockets-studio">
      {/* Unified Inner Pockets & Liner Cutting Mat Workbench */}
      <section
        aria-label="Inner Pockets and Spine Liner Workbench"
        className="overflow-hidden rounded-b-lg rounded-tr-lg border border-border bg-card shadow-xs"
      >
        {/* Header + Export Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="font-serif text-base font-semibold tracking-tight text-foreground">
              Inner Slip-In Pockets &amp; Spine Liner
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Style endpaper color or upload a custom pattern, inspect 1:1 mm fold flaps, and print
              auto-paginated sheets with a 50 × 50 mm calibration square.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => void handleDownloadStyledPdf()}
              disabled={exportingStyledPdf}
              data-testid="download-styled-inner-pdf-btn"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {exportingStyledPdf ? 'Rendering PDF…' : 'Styled Pockets PDF'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadInnerPdf}
              disabled={exportingInnerPdf}
              aria-label="Download Inner Pockets and Spine Liner as Plain Cut PDF"
              data-testid="download-inner-pdf-btn"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {exportingInnerPdf ? '…' : 'Cut PDF (1:1 mm)'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadInnerSvg}
              aria-label="Download Inner Pockets and Spine Liner as SVG"
              data-testid="download-inner-svg-btn"
            >
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
              Cut SVG
            </Button>
          </div>
        </div>

        {/* Full-Bleed Cutting Mat Viewport */}
        <div
          id="pockets-mat-viewport"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleUploadImage(file);
          }}
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
          style={{ touchAction: 'none' }}
          className={`cutting-mat-surface relative h-[470px] w-full overflow-hidden border-y select-none cursor-grab active:cursor-grabbing sm:h-[510px] ${
            isDraggingOver
              ? 'border-brass-bright ring-2 ring-inset ring-brass-bright/70'
              : 'border-border/80'
          }`}
        >
          {/* Top-left scale badge */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-3 left-3 z-10 rounded-full border border-white/15 bg-black/25 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-[#efe8d8]/85"
          >
            POCKETS &amp; LINER • 1:1 mm
          </div>

          {/* Top-right pagination badge */}
          <div className="pointer-events-none absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-brass-bright/40 bg-black/35 px-2.5 py-0.5 font-mono text-[11px] text-[#f6efe2]">
            <Download className="h-3 w-3 text-brass-bright" aria-hidden="true" />
            <span>
              {pdfPlan.pageCount} {pdfPlan.pageCount === 1 ? 'page' : 'pages'} •{' '}
              {PAGE_SIZES[pdfPageSize].id.toUpperCase()}
            </span>
          </div>

          <div
            className="flex h-full w-full items-center justify-center p-6 pb-16"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <svg
              role="img"
              aria-label="Inner Spine Liner and Front/Back Slip-In Pocket Envelopes"
              data-testid="inner-blueprint-svg"
              viewBox={innerLayout.viewBox}
              className="max-h-full max-w-full drop-shadow-[0_14px_26px_rgba(0,0,0,0.44)]"
            >
              <title>Inner Spine Liner and Front &amp; Back Slip-In Pocket Envelopes</title>
              <defs>
                <pattern
                  id="inner-glue-hatch"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#b08968" strokeWidth="1.6" />
                </pattern>
                <clipPath id={`${uniquePrefix}-liner-clip`}>
                  <rect x={0} y={0} width={spineLiner.widthMm} height={spineLiner.heightMm} />
                </clipPath>
                {viewMode === 'styled' &&
                  pocketStyle.imageDataUrl &&
                  pocketStyle.imageFitMode === 'tile' &&
                  linerImgPlacement && (
                    <pattern
                      id={`${uniquePrefix}-liner-tile`}
                      x={0}
                      y={0}
                      width={linerImgPlacement.width}
                      height={linerImgPlacement.height}
                      patternUnits="userSpaceOnUse"
                    >
                      <image
                        href={pocketStyle.imageDataUrl}
                        x={0}
                        y={0}
                        width={linerImgPlacement.width}
                        height={linerImgPlacement.height}
                        preserveAspectRatio="none"
                      />
                    </pattern>
                  )}
              </defs>

              <PocketPieceSvg
                idPrefix={`${uniquePrefix}-back`}
                pocket={backPocket}
                offsetX={innerLayout.backX}
                offsetY={0}
                unit={unit}
                style={pocketStyle}
                viewMode={viewMode}
                showGuides={showGuides}
              />

              {/* Spine Reinforcement Liner */}
              <g transform={`translate(${innerLayout.linerX}, ${innerLayout.linerY})`}>
                <rect
                  x={0}
                  y={0}
                  width={spineLiner.widthMm}
                  height={spineLiner.heightMm}
                  fill={viewMode === 'styled' ? pocketStyle.backgroundColor : PAPER_SHEET_FILL}
                />
                {viewMode === 'styled' && pocketStyle.imageDataUrl && linerImgPlacement && (
                  <g
                    clipPath={`url(#${uniquePrefix}-liner-clip)`}
                    opacity={pocketStyle.imageOpacity}
                  >
                    {pocketStyle.imageFitMode === 'tile' ? (
                      <rect
                        x={0}
                        y={0}
                        width={spineLiner.widthMm}
                        height={spineLiner.heightMm}
                        fill={`url(#${uniquePrefix}-liner-tile)`}
                      />
                    ) : (
                      <image
                        href={pocketStyle.imageDataUrl}
                        x={linerImgPlacement.x}
                        y={linerImgPlacement.y}
                        width={linerImgPlacement.width}
                        height={linerImgPlacement.height}
                        preserveAspectRatio="none"
                      />
                    )}
                  </g>
                )}

                {(viewMode === 'blueprint' || showGuides) && (
                  <>
                    <rect
                      x={0}
                      y={0}
                      width={spineLiner.widthMm}
                      height={spineLiner.heightMm}
                      fill="none"
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
                  </>
                )}

                {viewMode === 'blueprint' && (
                  <>
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
                  </>
                )}
              </g>

              <PocketPieceSvg
                idPrefix={`${uniquePrefix}-front`}
                pocket={frontPocket}
                offsetX={innerLayout.frontX}
                offsetY={0}
                unit={unit}
                style={pocketStyle}
                viewMode={viewMode}
                showGuides={showGuides}
              />
            </svg>
          </div>

          {/* Floating Bottom-Center HUD Pill */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3.5 z-20 flex justify-center px-3">
            <FloatingHudToolbar
              label="Inner pockets view and zoom controls"
              controlsId="pockets-mat-viewport"
              className="pointer-events-auto max-w-full overflow-x-auto"
              testId="pockets-hud-toolbar"
            >
              <HudGroup label="Preview mode">
                <HudButton
                  pressed={viewMode === 'styled'}
                  onClick={() => setViewMode('styled')}
                  data-testid="pockets-view-styled-btn"
                >
                  <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                  Styled Pockets
                </HudButton>
                <HudButton
                  pressed={viewMode === 'blueprint'}
                  onClick={() => setViewMode('blueprint')}
                  data-testid="pockets-view-blueprint-btn"
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  Blueprint
                </HudButton>
              </HudGroup>

              {viewMode === 'styled' && (
                <>
                  <HudSeparator />
                  <HudGroup label="Overlay guides">
                    <HudButton
                      pressed={showGuides}
                      onClick={() => setShowGuides((v) => !v)}
                      data-testid="pockets-guides-btn"
                    >
                      {showGuides ? (
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Cut &amp; Fold Guides
                    </HudButton>
                  </HudGroup>
                </>
              )}

              <HudSeparator />

              <HudGroup label="Viewport zoom">
                <HudButton
                  aria-label="Zoom out pockets"
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
                  aria-label="Zoom in pockets"
                  title="Zoom in"
                  onClick={() => adjustZoom(0.25)}
                  className="px-2"
                >
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                </HudButton>
                <HudButton
                  aria-label="Reset pockets zoom and pan"
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

        {/* Legend Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[#D93829]" aria-hidden="true" />
              Solid Red: Cut Line (45° Mitered Flaps)
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#1D5BD6]"
                aria-hidden="true"
              />
              Dashed Blue: Score &amp; Fold
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[#0F8A47]" aria-hidden="true" />
              Green: Open Slip-In Edge (Faces Spine)
            </span>
          </div>
          <span className="font-mono text-[11px] text-brass">
            Drop an image onto the cutting mat to style pockets
          </span>
        </div>
      </section>

      {/* Inner Pocket & Endpaper Styling Controls */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Endpaper Base Color & Sync */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 font-serif text-base">
                <Palette className="h-4 w-4 text-brass" aria-hidden="true" />
                Endpaper Base Color
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                data-testid="pocket-match-cover-btn"
                onClick={() => {
                  updateStyle({ backgroundColor: coverMatchColor });
                  onStatusMessage(`Matched inner pocket color to cover (${coverMatchColor.toUpperCase()})`);
                }}
              >
                <span
                  className="h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: coverMatchColor }}
                  aria-hidden="true"
                />
                Match Cover Color
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs cursor-pointer">
                <input
                  type="color"
                  value={pocketStyle.backgroundColor}
                  onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                  aria-label="Inner pocket endpaper color"
                  data-testid="pocket-color-input"
                  className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="font-mono text-xs text-foreground">
                  {pocketStyle.backgroundColor.toUpperCase()}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Archival endpaper swatches">
                {ENDPAPER_SWATCHES.map((swatch) => {
                  const active = pocketStyle.backgroundColor.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.hex}
                      type="button"
                      title={swatch.label}
                      aria-label={`Set endpaper color to ${swatch.label}`}
                      aria-pressed={active}
                      onClick={() => updateStyle({ backgroundColor: swatch.hex })}
                      className={`h-7 w-7 rounded-full border transition-transform cursor-pointer ${
                        active
                          ? 'scale-110 border-brass ring-2 ring-brass/40'
                          : 'border-border hover:scale-105'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="kettle-stitch-divider pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="pocket-style-scope">Print Color &amp; Image Area</Label>
                <Select
                  value={pocketStyle.styleScope}
                  onValueChange={(val) => updateStyle({ styleScope: val as PocketStyleScope })}
                >
                  <SelectTrigger id="pocket-style-scope" data-testid="pocket-scope-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="faces-only">
                      Pocket Faces Only (keeps glue flaps white for clean gluing)
                    </SelectItem>
                    <SelectItem value="full-envelope">
                      Full Cut Envelope (extends color/pattern across glue flaps)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Endpaper Picture / Pattern Upload */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 font-serif text-base">
                <ImagePlus className="h-4 w-4 text-brass" aria-hidden="true" />
                Custom Endpaper Picture / Pattern
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="pocket-upload-btn"
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  {pocketStyle.imageDataUrl ? 'Replace Picture' : 'Upload Picture'}
                </Button>
                {pocketStyle.imageDataUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() =>
                      updateStyle({
                        imageDataUrl: null,
                        imageFileName: null,
                        imageNaturalWidth: 0,
                        imageNaturalHeight: 0,
                      })
                    }
                    aria-label="Remove inner pocket picture"
                    data-testid="pocket-remove-image-btn"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="visually-hidden"
                  aria-label="Upload custom picture for inner pockets"
                  data-testid="pocket-upload-image-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleUploadImage(file);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3.5">
            {pocketStyle.imageDataUrl ? (
              <>
                <div className="flex items-center justify-between rounded-md border border-border bg-secondary/45 px-3 py-1.5 text-xs">
                  <span className="truncate font-medium text-foreground">
                    {pocketStyle.imageFileName ?? 'Custom endpaper image'}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {pocketStyle.imageNaturalWidth} × {pocketStyle.imageNaturalHeight} px
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pocket-fit-mode">Image Fit Mode</Label>
                  <Select
                    value={pocketStyle.imageFitMode}
                    onValueChange={(val) => updateStyle({ imageFitMode: val as PocketImageFitMode })}
                  >
                    <SelectTrigger id="pocket-fit-mode" data-testid="pocket-fit-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cover">Cover / Fill (edge-to-edge)</SelectItem>
                      <SelectItem value="contain">Contain (fit whole image inside)</SelectItem>
                      <SelectItem value="tile">Tile Pattern (repeat seamlessly)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="pocket-scale-slider">Image Scale</Label>
                      <span className="font-mono text-muted-foreground">
                        {Math.round(pocketStyle.imageScale * 100)}%
                      </span>
                    </div>
                    <Slider
                      id="pocket-scale-slider"
                      aria-label="Pocket image scale"
                      min={STUDIO_BOUNDS.pocketImageScale.min}
                      max={STUDIO_BOUNDS.pocketImageScale.max}
                      step={0.05}
                      value={[pocketStyle.imageScale]}
                      onValueChange={([imageScale]) => updateStyle({ imageScale })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="pocket-opacity-slider">Opacity</Label>
                      <span className="font-mono text-muted-foreground">
                        {Math.round(pocketStyle.imageOpacity * 100)}%
                      </span>
                    </div>
                    <Slider
                      id="pocket-opacity-slider"
                      aria-label="Pocket image opacity"
                      min={STUDIO_BOUNDS.pocketImageOpacity.min}
                      max={STUDIO_BOUNDS.pocketImageOpacity.max}
                      step={0.05}
                      value={[pocketStyle.imageOpacity]}
                      onValueChange={([imageOpacity]) => updateStyle({ imageOpacity })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-secondary/35 px-3.5 py-5 text-center text-xs text-muted-foreground">
                Upload a marbled paper scan, floral pattern, map, or illustration (PNG, JPG, WEBP)
                to print custom decorative endpaper pockets.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
