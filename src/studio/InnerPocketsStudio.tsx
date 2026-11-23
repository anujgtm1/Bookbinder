import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  Grid2x2,
  ImagePlus,
  Layers,
  Magnet,
  Maximize2,
  Minus,
  Palette,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  GrainDirectionArrow,
  HorizontalDimLine,
  VerticalDimLine,
} from '@/components/BlueprintDimensionLines';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from '@/components/FloatingHudToolbar';
import { Badge } from '@/components/ui/badge';
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
  type PocketStyleConfig,
  type PocketStyleScope,
} from '@/types/studio';
import { CoverImageLayerModel, type CoverImageLayer } from '@/types/studioLayer';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';
import { LayerSelectionOverlay } from './LayerSelectionOverlay';
import {
  computeInnerPocketsLayout,
  computePocketImagePlacement,
  generateStyledInnerTemplatesPdf,
} from './pocketRenderEngine';
import { buildInnerPocketSnapTargets } from './snapGuides';
import {
  isSupportedImageFile,
  readImageFile,
  useInteractiveLayers,
} from './useInteractiveLayers';

export interface InnerPocketsStudioProps {
  readonly geometry: CaseGeometry;
  readonly pocketStyle: PocketStyleConfig;
  readonly coverMatchColor: string;
  readonly pdfPageSize: PageSizeId;
  readonly unit: UnitSystem;
  readonly exportingInnerPdf?: boolean;
  readonly onChangePocketStyle: (next: PocketStyleConfig) => void;
  readonly onDownloadInnerSvg: () => void;
  readonly onDownloadInnerPdf: (includeLegend?: boolean) => void;
  readonly onStatusMessage: (message: string) => void;
}

type PocketViewMode = 'styled' | 'blueprint';
type PocketQuickFitTarget = 'front' | 'back' | 'liner' | 'all';

const EMPTY_LAYERS: readonly CoverImageLayer[] = [];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.5;
const PAPER_SHEET_FILL = '#FAF6EE';
const PAPER_INK_FILL = '#231F1B';

interface PocketPieceBaseProps {
  readonly idPrefix: string;
  readonly pocket: PocketEnvelopeGeometry;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly style: PocketStyleConfig;
  readonly viewMode: PocketViewMode;
}

/** Renders the paper backing, base endpaper color, and optional legacy background pattern for one pocket. */
function PocketPieceBaseSvg({
  idPrefix,
  pocket,
  offsetX,
  offsetY,
  style,
  viewMode,
}: PocketPieceBaseProps) {
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

      {/* Styled endpaper base fill & optional legacy pattern */}
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
    </g>
  );
}

interface PocketPieceGuidesProps {
  readonly pocket: PocketEnvelopeGeometry;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly unit: UnitSystem;
  readonly viewMode: PocketViewMode;
  readonly showGuides: boolean;
  readonly showEmptyLabel: boolean;
}

/** Renders vector cut/score/glue guides and labels ABOVE the artwork layers (pointerEvents="none"). */
function PocketPieceGuidesSvg({
  pocket,
  offsetX,
  offsetY,
  unit,
  viewMode,
  showGuides,
  showEmptyLabel,
}: PocketPieceGuidesProps) {
  const center = GeometryPrimitives.rectCenter(pocket.faceRect);
  const openX = pocket.openEdge === 'right' ? pocket.faceRect.x + pocket.faceRect.width : 0;
  const isStyled = viewMode === 'styled';

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`} pointerEvents="none">
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

      {viewMode === 'blueprint' ? (
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
      ) : (
        showGuides &&
        showEmptyLabel && (
          <text
            x={center.x}
            y={center.y}
            textAnchor="middle"
            fontSize="6.5"
            fontWeight="600"
            fill={PAPER_INK_FILL}
            opacity="0.32"
          >
            {pocket.label.toUpperCase()}
          </text>
        )
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
  const layers = pocketStyle.layers ?? EMPTY_LAYERS;

  const [viewMode, setViewMode] = useState<PocketViewMode>('styled');
  const [showGuides, setShowGuides] = useState(true);
  const [showBlueprintDimensions, setShowBlueprintDimensions] = useState(true);
  const [includePdfGuides, setIncludePdfGuides] = useState(true);
  const [includePdfLegend, setIncludePdfLegend] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    () => layers[layers.length - 1]?.id ?? null,
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportingStyledPdf, setExportingStyledPdf] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const pocketStyleRef = useRef(pocketStyle);
  const onChangeRef = useRef(onChangePocketStyle);
  useEffect(() => {
    pocketStyleRef.current = pocketStyle;
    onChangeRef.current = onChangePocketStyle;
  }, [pocketStyle, onChangePocketStyle]);

  const pdfPlan = useMemo(
    () => planInnerTemplateLayout(geometry, pdfPageSize, { includeLegend: includePdfLegend }),
    [geometry, pdfPageSize, includePdfLegend],
  );

  const { backPocket, spineLiner, frontPocket } = geometry;
  const innerLayout = useMemo(() => computeInnerPocketsLayout(geometry), [geometry]);
  const snapTargets = useMemo(() => buildInnerPocketSnapTargets(innerLayout), [innerLayout]);

  const {
    activeSnapGuides,
    suppressNextClickRef,
    toSvgMm,
    startMoveDrag,
    startResizeDrag,
    handleLayerWheel,
  } = useInteractiveLayers({
    svgRef,
    viewBox: innerLayout.viewBoxRect,
    layers,
    selectedLayerId,
    snapTargets,
    snapEnabled,
    enabled: viewMode === 'styled',
    onChangeLayers: (nextLayers) => {
      onChangeRef.current({ ...pocketStyleRef.current, layers: nextLayers });
    },
    onSelectLayer: setSelectedLayerId,
  });

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) ?? null,
    [layers, selectedLayerId],
  );

  const updateStyle = (patch: Partial<PocketStyleConfig>) => {
    onChangePocketStyle({ ...pocketStyle, ...patch });
  };

  const updateLayer = (id: string, updater: (layer: CoverImageLayer) => CoverImageLayer) => {
    updateStyle({
      layers: layers.map((layer) => (layer.id === id ? updater(layer) : layer)),
    });
  };

  const adjustZoom = (delta: number) => {
    setZoom((prev) => roundTo(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)), 2));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const targetRectForScope = (target: PocketQuickFitTarget): Rect2D => {
    const full = pocketStyle.styleScope === 'full-envelope';
    switch (target) {
      case 'back':
        return full ? innerLayout.backFullRect : innerLayout.backFaceRect;
      case 'front':
        return full ? innerLayout.frontFullRect : innerLayout.frontFaceRect;
      case 'liner':
        return innerLayout.linerRect;
      case 'all':
        return {
          x: 0,
          y: 0,
          width: innerLayout.totalWidthMm,
          height: innerLayout.totalHeightMm,
        };
    }
  };

  const defaultPlacementRectForDrop = (dropPoint?: { xMm: number; yMm: number }): Rect2D => {
    if (dropPoint) {
      if (dropPoint.xMm < innerLayout.linerX - 9) {
        return targetRectForScope('back');
      }
      if (dropPoint.xMm < innerLayout.frontX - 9) {
        return targetRectForScope('liner');
      }
      return targetRectForScope('front');
    }
    const count = layers.length;
    if (count === 0) return targetRectForScope('front');
    if (count === 1) return targetRectForScope('back');
    if (count === 2) return targetRectForScope('liner');
    return targetRectForScope('front');
  };

  const handleAddImageFiles = async (
    files: readonly File[],
    dropPoint?: { xMm: number; yMm: number },
  ) => {
    const validFiles = files.filter(isSupportedImageFile);
    if (validFiles.length === 0) {
      onStatusMessage('Please upload PNG, JPG, or WEBP images for the inner pockets.');
      return;
    }

    const added: CoverImageLayer[] = [];
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const decoded = await readImageFile(file);
        const baseRect = defaultPlacementRectForDrop(dropPoint);
        const offset = i * 6;
        const layer = CoverImageLayerModel.createInRect({
          dataUrl: decoded.dataUrl,
          fileName: file.name,
          naturalWidth: decoded.width,
          naturalHeight: decoded.height,
          targetRect: {
            x: baseRect.x + offset,
            y: baseRect.y + offset,
            width: baseRect.width,
            height: baseRect.height,
          },
          clipZone: 'none',
          mode: 'cover',
        });
        added.push(layer);
      } catch {
        onStatusMessage(`Could not read image "${file.name}".`);
      }
    }

    if (added.length > 0) {
      updateStyle({ layers: [...layers, ...added] });
      setSelectedLayerId(added[added.length - 1].id);
      setViewMode('styled');
      onStatusMessage(
        added.length === 1
          ? `Added "${added[0].fileName}" — drag to move or pull corners to resize`
          : `Added ${added.length} artwork images to inner pockets`,
      );
    }
  };

  const handleQuickFitPocketLayer = (id: string, target: PocketQuickFitTarget) => {
    const rect = targetRectForScope(target);
    updateLayer(id, (layer) => CoverImageLayerModel.fitToRect(layer, rect, 'none'));
  };

  const handleToggleLayerTile = (layer: CoverImageLayer) => {
    const nextTiled = !layer.tiled;
    updateLayer(layer.id, (current) => {
      if (!nextTiled) {
        return { ...current, tiled: false };
      }
      // If the layer is very large, scale down to a crisp swatch size so the repeat pattern shows immediately
      const maxTileW = 48;
      if (current.widthMm > maxTileW) {
        const ratio = maxTileW / current.widthMm;
        const newW = roundTo(maxTileW, 2);
        const newH = roundTo(Math.max(12, current.heightMm * ratio), 2);
        return {
          ...current,
          widthMm: newW,
          heightMm: newH,
          tiled: true,
        };
      }
      return { ...current, tiled: true };
    });
    onStatusMessage(
      nextTiled
        ? `Tiled "${layer.fileName}" as a seamless endpaper pattern (pull corners to resize repeat)`
        : `Switched "${layer.fileName}" back to single image`,
    );
  };

  const handleCopyToOtherPocket = (layer: CoverImageLayer) => {
    const layerCenterX = layer.xMm + layer.widthMm / 2;
    const midX = innerLayout.linerX + innerLayout.linerRect.width / 2;
    const isOnBackSide = layerCenterX < midX;
    const sourceFace = isOnBackSide ? innerLayout.backFaceRect : innerLayout.frontFaceRect;
    const destFace = isOnBackSide ? innerLayout.frontFaceRect : innerLayout.backFaceRect;

    const relX = layer.xMm - sourceFace.x;
    const relY = layer.yMm - sourceFace.y;
    const copy: CoverImageLayer = {
      ...layer,
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      xMm: roundTo(destFace.x + relX, 2),
      yMm: roundTo(destFace.y + relY, 2),
    };
    updateStyle({ layers: [...layers, copy] });
    setSelectedLayerId(copy.id);
    onStatusMessage(
      `Copied "${layer.fileName}" to ${isOnBackSide ? 'Front Pocket' : 'Back Pocket'}`,
    );
  };

  const handleDownloadStyledPdf = async () => {
    setExportingStyledPdf(true);
    try {
      const { bytes, plan } = await generateStyledInnerTemplatesPdf(
        geometry,
        pdfPageSize,
        pocketStyle,
        undefined,
        { includeLegend: includePdfLegend, includeGuides: includePdfGuides },
      );
      triggerBytesDownload(bytes, 'inner_pockets_styled.pdf', 'application/pdf');
      onStatusMessage(
        `Exported inner_pockets_styled.pdf (${plan.pageCount} ${plan.pageCount === 1 ? 'page' : 'pages'}, 300 DPI${includePdfLegend ? ' with legend' : ''})`,
      );
    } catch {
      onStatusMessage('Failed to generate Styled Pockets PDF.');
    } finally {
      setExportingStyledPdf(false);
    }
  };

  const handleCornerSize = Math.max(7, innerLayout.totalWidthMm * 0.018);

  const linerLocalRect: Rect2D = {
    x: 0,
    y: 0,
    width: spineLiner.widthMm,
    height: spineLiner.heightMm,
  };
  const linerImgPlacement =
    viewMode === 'styled' && pocketStyle.imageDataUrl
      ? computePocketImagePlacement(
          linerLocalRect,
          pocketStyle.imageNaturalWidth || 100,
          pocketStyle.imageNaturalHeight || 100,
          pocketStyle.imageFitMode,
          pocketStyle.imageScale,
        )
      : null;

  const translatedBackPolygon = useMemo(
    () => GeometryPrimitives.translatePolygon(backPocket.outerCutPolygon, innerLayout.backX, 0),
    [backPocket.outerCutPolygon, innerLayout.backX],
  );
  const translatedFrontPolygon = useMemo(
    () => GeometryPrimitives.translatePolygon(frontPocket.outerCutPolygon, innerLayout.frontX, 0),
    [frontPocket.outerCutPolygon, innerLayout.frontX],
  );

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
              {geometry.bindingStyle === 'softcover-jacket'
                ? 'Note: Softcover Slip-In Jacket already includes built-in tuck flaps on the Outer Wrap — these separate inner pocket sheets are optional.'
                : 'Drop images directly onto any pocket, drag and resize with magnetic guides, or inspect 1:1 mm fold flaps and auto-paginated print sheets.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={includePdfGuides ? 'secondary' : 'outline'}
              size="sm"
              className={`h-8 px-2.5 text-xs ${
                includePdfGuides ? 'border-brass/60 text-foreground' : 'border-dashed text-muted-foreground'
              }`}
              aria-pressed={includePdfGuides}
              data-testid="pocket-pdf-guides-toggle"
              title="Include red cut lines and dashed blue fold lines on the Styled Pockets PDF (on by default)"
              onClick={() => setIncludePdfGuides((v) => !v)}
            >
              <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
              {includePdfGuides ? 'Cut & Fold Lines: On' : 'Cut & Fold Lines: Off'}
            </Button>
            <Button
              variant={includePdfLegend ? 'secondary' : 'outline'}
              size="sm"
              className={`h-8 px-2.5 text-xs ${
                includePdfLegend ? 'border-brass/60 text-foreground' : 'border-dashed text-muted-foreground'
              }`}
              aria-pressed={includePdfLegend}
              data-testid="pocket-pdf-legend-toggle"
              title="Include 50 × 50 mm scale square & cut/score legend in PDF (off by default to fit more pieces per page)"
              onClick={() => setIncludePdfLegend((v) => !v)}
            >
              <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
              {includePdfLegend ? 'PDF Legend: On' : 'PDF Legend: Off'}
            </Button>
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
              onClick={() => onDownloadInnerPdf(includePdfLegend)}
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
          data-testid="pockets-canvas-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            const files = Array.from(e.dataTransfer.files ?? []);
            if (files.length === 0) return;
            const dropPt = toSvgMm(e.clientX, e.clientY) ?? undefined;
            void handleAddImageFiles(files, dropPt);
          }}
          onWheel={(e) => {
            if (viewMode === 'styled' && selectedLayer) {
              e.preventDefault();
              handleLayerWheel(selectedLayer, e.deltaY);
              return;
            }
            e.preventDefault();
            adjustZoom(e.deltaY < 0 ? 0.15 : -0.15);
          }}
          onPointerDown={(e) => {
            if (viewMode === 'styled') return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            panDragRef.current = {
              active: true,
              startX: e.clientX,
              startY: e.clientY,
              origX: pan.x,
              origY: pan.y,
            };
          }}
          onPointerMove={(e) => {
            if (!panDragRef.current.active) return;
            setPan({
              x: panDragRef.current.origX + (e.clientX - panDragRef.current.startX),
              y: panDragRef.current.origY + (e.clientY - panDragRef.current.startY),
            });
          }}
          onPointerUp={() => {
            panDragRef.current.active = false;
          }}
          onPointerCancel={() => {
            panDragRef.current.active = false;
          }}
          style={{ touchAction: 'none' }}
          className={`cutting-mat-surface relative h-[470px] w-full overflow-hidden border-y select-none transition-colors sm:h-[510px] ${
            viewMode === 'blueprint' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
          } ${
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

          {/* Dropzone visual cue */}
          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-brass-bright bg-black/45 backdrop-blur-[1px]">
              <span className="rounded-full border border-brass-bright/60 bg-black/75 px-4 py-1.5 font-serif text-sm font-semibold text-[#faf6ee] shadow-lg">
                Drop image onto Back Pocket, Spine Liner, or Front Pocket
              </span>
            </div>
          )}

          <div
            className="flex h-full w-full items-center justify-center p-6 pb-16"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <svg
              ref={svgRef}
              role="img"
              aria-label="Inner Spine Liner and Front/Back Slip-In Pocket Envelopes"
              data-testid="inner-blueprint-svg"
              viewBox={
                viewMode === 'blueprint' && showBlueprintDimensions
                  ? `${innerLayout.viewBoxRect.x - 16} ${innerLayout.viewBoxRect.y - 12} ${innerLayout.viewBoxRect.width + 32} ${innerLayout.viewBoxRect.height + 24}`
                  : innerLayout.viewBox
              }
              className="max-h-full max-w-full drop-shadow-[0_14px_26px_rgba(0,0,0,0.44)]"
              onClick={(e) => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                if (e.target === e.currentTarget) {
                  setSelectedLayerId(null);
                }
              }}
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
                <filter
                  id={`${uniquePrefix}-brass-snap-glow`}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feDropShadow
                    dx="0"
                    dy="0"
                    stdDeviation="1.4"
                    floodColor="#facc15"
                    floodOpacity="0.9"
                  />
                </filter>
                <clipPath id={`${uniquePrefix}-liner-clip`}>
                  <rect x={0} y={0} width={spineLiner.widthMm} height={spineLiner.heightMm} />
                </clipPath>
                {/* Unified multi-shape clip mask for all 3 inner pieces */}
                <clipPath id={`${uniquePrefix}-all-shapes-clip`}>
                  {pocketStyle.styleScope === 'full-envelope' ? (
                    <>
                      <path d={GeometryPrimitives.polygonToSvgPath(translatedBackPolygon, 2)} />
                      <rect
                        x={innerLayout.linerRect.x}
                        y={innerLayout.linerRect.y}
                        width={innerLayout.linerRect.width}
                        height={innerLayout.linerRect.height}
                      />
                      <path d={GeometryPrimitives.polygonToSvgPath(translatedFrontPolygon, 2)} />
                    </>
                  ) : (
                    <>
                      <rect
                        x={innerLayout.backFaceRect.x}
                        y={innerLayout.backFaceRect.y}
                        width={innerLayout.backFaceRect.width}
                        height={innerLayout.backFaceRect.height}
                      />
                      <rect
                        x={innerLayout.linerRect.x}
                        y={innerLayout.linerRect.y}
                        width={innerLayout.linerRect.width}
                        height={innerLayout.linerRect.height}
                      />
                      <rect
                        x={innerLayout.frontFaceRect.x}
                        y={innerLayout.frontFaceRect.y}
                        width={innerLayout.frontFaceRect.width}
                        height={innerLayout.frontFaceRect.height}
                      />
                    </>
                  )}
                </clipPath>
                {viewMode === 'styled' &&
                  layers
                    .filter((layer) => layer.tiled)
                    .map((layer) => {
                      const tileW = Math.max(8, layer.widthMm);
                      const tileH = Math.max(8, layer.heightMm);
                      return (
                        <pattern
                          key={`tile-def-${layer.id}`}
                          id={`${uniquePrefix}-layer-tile-${layer.id}`}
                          x={layer.xMm}
                          y={layer.yMm}
                          width={tileW}
                          height={tileH}
                          patternUnits="userSpaceOnUse"
                        >
                          <image
                            href={layer.dataUrl}
                            x={0}
                            y={0}
                            width={tileW}
                            height={tileH}
                            preserveAspectRatio="none"
                          />
                        </pattern>
                      );
                    })}
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

              {/* 1. Base Paper & Endpaper Color Fills for all 3 shapes */}
              <g onClick={() => setSelectedLayerId(null)}>
                <PocketPieceBaseSvg
                  idPrefix={`${uniquePrefix}-back`}
                  pocket={backPocket}
                  offsetX={innerLayout.backX}
                  offsetY={0}
                  style={pocketStyle}
                  viewMode={viewMode}
                />

                {/* Spine Reinforcement Liner Base */}
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
                </g>

                <PocketPieceBaseSvg
                  idPrefix={`${uniquePrefix}-front`}
                  pocket={frontPocket}
                  offsetX={innerLayout.frontX}
                  offsetY={0}
                  style={pocketStyle}
                  viewMode={viewMode}
                />
              </g>

              {/* 2. Interactive Draggable & Resizable Artwork Layers (clipped cleanly to envelope shapes) */}
              {viewMode === 'styled' && layers.length > 0 && (
                <g
                  clipPath={`url(#${uniquePrefix}-all-shapes-clip)`}
                  opacity={pocketStyle.imageOpacity}
                >
                  {layers.map((layer, index) =>
                    layer.tiled ? (
                      <rect
                        key={layer.id}
                        x={0}
                        y={0}
                        width={innerLayout.totalWidthMm}
                        height={innerLayout.totalHeightMm}
                        fill={`url(#${uniquePrefix}-layer-tile-${layer.id})`}
                        data-testid={`pocket-layer-${index}`}
                        data-tiled="true"
                        className="cursor-grab active:cursor-grabbing"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLayerId(layer.id);
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          startMoveDrag(layer, e.clientX, e.clientY);
                        }}
                      />
                    ) : (
                      <image
                        key={layer.id}
                        href={layer.dataUrl}
                        x={layer.xMm}
                        y={layer.yMm}
                        width={layer.widthMm}
                        height={layer.heightMm}
                        preserveAspectRatio="none"
                        data-testid={`pocket-layer-${index}`}
                        className="cursor-grab active:cursor-grabbing"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLayerId(layer.id);
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          startMoveDrag(layer, e.clientX, e.clientY);
                        }}
                      />
                    ),
                  )}
                </g>
              )}

              {/* 3. Vector Cut, Score, Glue Flaps & CAD Labels (always crisp on top) */}
              <PocketPieceGuidesSvg
                pocket={backPocket}
                offsetX={innerLayout.backX}
                offsetY={0}
                unit={unit}
                viewMode={viewMode}
                showGuides={showGuides}
                showEmptyLabel={layers.length === 0 && !pocketStyle.imageDataUrl}
              />

              <g
                transform={`translate(${innerLayout.linerX}, ${innerLayout.linerY})`}
                pointerEvents="none"
              >
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

              <PocketPieceGuidesSvg
                pocket={frontPocket}
                offsetX={innerLayout.frontX}
                offsetY={0}
                unit={unit}
                viewMode={viewMode}
                showGuides={showGuides}
                showEmptyLabel={layers.length === 0 && !pocketStyle.imageDataUrl}
              />

              {/* 4. Shared Brass Magnetic Snap Guides + Selection Frame & Corner Resize Handles */}
              {viewMode === 'styled' && (
                <LayerSelectionOverlay
                  canvasBounds={{
                    x: 0,
                    y: 0,
                    width: innerLayout.totalWidthMm,
                    height: innerLayout.totalHeightMm,
                  }}
                  activeSnapGuides={activeSnapGuides}
                  selectedLayer={selectedLayer}
                  snapGlowFilterId={`${uniquePrefix}-brass-snap-glow`}
                  handleCornerSizeMm={handleCornerSize}
                  onStartResize={startResizeDrag}
                />
              )}

              {/* 5. Manual-Cutting CAD Dimension Lines & Grain Arrows in Blueprint Mode */}
              {viewMode === 'blueprint' && showBlueprintDimensions && (
                <g data-testid="pockets-blueprint-dimensions">
                  {/* Grain Direction Arrows parallel to spine */}
                  <GrainDirectionArrow
                    x={innerLayout.backFaceRect.x + 14}
                    centerY={innerLayout.backFaceRect.y + innerLayout.backFaceRect.height / 2}
                    lengthMm={36}
                  />
                  <GrainDirectionArrow
                    x={innerLayout.frontFaceRect.x + innerLayout.frontFaceRect.width - 14}
                    centerY={innerLayout.frontFaceRect.y + innerLayout.frontFaceRect.height / 2}
                    lengthMm={36}
                  />

                  {/* Back Pocket Overall Width (top) & Flap/Face Breakdown (bottom) */}
                  <HorizontalDimLine
                    x1={innerLayout.backX}
                    x2={innerLayout.backX + backPocket.totalWidthMm}
                    y={-12}
                    anchorY={0}
                    label={UnitConverter.format(backPocket.totalWidthMm, unit)}
                    emphasized
                    fontSize={4.4}
                  />
                  <HorizontalDimLine
                    x1={innerLayout.backX}
                    x2={innerLayout.backFaceRect.x}
                    y={backPocket.totalHeightMm + 11}
                    anchorY={backPocket.totalHeightMm}
                    label={UnitConverter.formatValue(backPocket.flapWidthMm, unit)}
                    fontSize={4.0}
                  />
                  <HorizontalDimLine
                    x1={innerLayout.backFaceRect.x}
                    x2={innerLayout.backFaceRect.x + backPocket.pocketWidthMm}
                    y={backPocket.totalHeightMm + 11}
                    anchorY={backPocket.totalHeightMm}
                    label={UnitConverter.format(backPocket.pocketWidthMm, unit)}
                    fontSize={4.2}
                  />

                  {/* Left Vertical Breakdown for Pocket Flaps & Face Height */}
                  <VerticalDimLine
                    y1={0}
                    y2={backPocket.flapWidthMm}
                    x={-12}
                    anchorX={0}
                    label={UnitConverter.formatValue(backPocket.flapWidthMm, unit)}
                    fontSize={4.0}
                  />
                  <VerticalDimLine
                    y1={backPocket.flapWidthMm}
                    y2={backPocket.flapWidthMm + backPocket.pocketHeightMm}
                    x={-12}
                    anchorX={0}
                    label={UnitConverter.format(backPocket.pocketHeightMm, unit)}
                    fontSize={4.4}
                  />
                  <VerticalDimLine
                    y1={backPocket.flapWidthMm + backPocket.pocketHeightMm}
                    y2={backPocket.totalHeightMm}
                    x={-12}
                    anchorX={0}
                    label={UnitConverter.formatValue(backPocket.flapWidthMm, unit)}
                    fontSize={4.0}
                  />

                  {/* Spine Liner Overall Width (top) & Segment Breakdown (bottom) */}
                  <HorizontalDimLine
                    x1={innerLayout.linerX}
                    x2={innerLayout.linerX + spineLiner.widthMm}
                    y={-12}
                    anchorY={innerLayout.linerY}
                    label={UnitConverter.format(spineLiner.widthMm, unit)}
                    emphasized
                    fontSize={4.4}
                  />
                  <HorizontalDimLine
                    x1={innerLayout.linerX}
                    x2={innerLayout.linerX + spineLiner.boardOverlapMm}
                    y={innerLayout.linerY + spineLiner.heightMm + 11}
                    anchorY={innerLayout.linerY + spineLiner.heightMm}
                    label={UnitConverter.formatValue(spineLiner.boardOverlapMm, unit)}
                    fontSize={3.8}
                  />
                  <HorizontalDimLine
                    x1={innerLayout.linerX + spineLiner.spineZoneRect.x}
                    x2={
                      innerLayout.linerX +
                      spineLiner.spineZoneRect.x +
                      spineLiner.spineZoneRect.width
                    }
                    y={innerLayout.linerY + spineLiner.heightMm + 11}
                    anchorY={innerLayout.linerY + spineLiner.heightMm}
                    label={UnitConverter.formatValue(spineLiner.spineZoneRect.width, unit)}
                    fontSize={3.8}
                  />
                  <HorizontalDimLine
                    x1={innerLayout.linerX + spineLiner.widthMm - spineLiner.boardOverlapMm}
                    x2={innerLayout.linerX + spineLiner.widthMm}
                    y={innerLayout.linerY + spineLiner.heightMm + 11}
                    anchorY={innerLayout.linerY + spineLiner.heightMm}
                    label={UnitConverter.formatValue(spineLiner.boardOverlapMm, unit)}
                    fontSize={3.8}
                  />

                  {/* Front Pocket Overall Width (top), Face/Flap Breakdown (bottom) & Overall Height (right) */}
                  <HorizontalDimLine
                    x1={innerLayout.frontX}
                    x2={innerLayout.frontX + frontPocket.totalWidthMm}
                    y={-12}
                    anchorY={0}
                    label={UnitConverter.format(frontPocket.totalWidthMm, unit)}
                    emphasized
                    fontSize={4.4}
                  />
                  <HorizontalDimLine
                    x1={innerLayout.frontFaceRect.x}
                    x2={innerLayout.frontFaceRect.x + frontPocket.pocketWidthMm}
                    y={frontPocket.totalHeightMm + 11}
                    anchorY={frontPocket.totalHeightMm}
                    label={UnitConverter.format(frontPocket.pocketWidthMm, unit)}
                    fontSize={4.2}
                  />
                  <HorizontalDimLine
                    x1={innerLayout.frontFaceRect.x + frontPocket.pocketWidthMm}
                    x2={innerLayout.frontX + frontPocket.totalWidthMm}
                    y={frontPocket.totalHeightMm + 11}
                    anchorY={frontPocket.totalHeightMm}
                    label={UnitConverter.formatValue(frontPocket.flapWidthMm, unit)}
                    fontSize={4.0}
                  />
                  <VerticalDimLine
                    y1={0}
                    y2={frontPocket.totalHeightMm}
                    x={innerLayout.totalWidthMm + 12}
                    anchorX={innerLayout.totalWidthMm}
                    label={`TOTAL H: ${UnitConverter.format(frontPocket.totalHeightMm, unit)}`}
                    emphasized
                    fontSize={4.4}
                  />
                </g>
              )}
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

              {viewMode === 'styled' ? (
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
                      Guides
                    </HudButton>
                    <HudButton
                      pressed={snapEnabled}
                      onClick={() => setSnapEnabled((v) => !v)}
                      title="Magnetic smart snap guides (hold Alt while dragging to bypass)"
                      data-testid="pockets-snap-btn"
                    >
                      <Magnet className="h-3.5 w-3.5" aria-hidden="true" />
                      Snap
                    </HudButton>
                  </HudGroup>
                </>
              ) : (
                <>
                  <HudSeparator />
                  <HudGroup label="Blueprint overlays">
                    <HudButton
                      pressed={showBlueprintDimensions}
                      onClick={() => setShowBlueprintDimensions((v) => !v)}
                      title="Show/hide manual-cutting dimension lines and grain arrows"
                      data-testid="pockets-dimensions-btn"
                    >
                      <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                      Dimensions
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

        {/* Legend & Contextual Hint Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[#D93829]" aria-hidden="true" />
              Solid Red: Cut Line
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
              Green: Open Slip-In Edge
            </span>
          </div>
          <span className="font-mono text-[11px] text-brass">
            {selectedLayer
              ? `Selected "${selectedLayer.fileName}" — drag to move, pull corners or scroll wheel to resize`
              : 'Drop PNG, JPG, or WEBP images anywhere onto the cutting mat'}
          </span>
        </div>
      </section>

      {/* Inner Pocket & Endpaper Styling Controls */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Endpaper Base Color & Scope */}
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
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs">
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

              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Archival endpaper swatches"
              >
                {ENDPAPER_SWATCHES.map((swatch) => {
                  const active =
                    pocketStyle.backgroundColor.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.hex}
                      type="button"
                      title={swatch.label}
                      aria-label={`Set endpaper color to ${swatch.label}`}
                      aria-pressed={active}
                      onClick={() => updateStyle({ backgroundColor: swatch.hex })}
                      className={`h-7 w-7 cursor-pointer rounded-full border transition-transform ${
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
                <Label htmlFor="pocket-style-scope">Print Color &amp; Image Clipping Area</Label>
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
                      Full Cut Envelope (extends color &amp; artwork across glue flaps)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Interactive Pocket Artwork Layers (mirrors Outer Cover Artwork Card) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 font-serif text-base">
                <ImagePlus className="h-4 w-4 text-brass" aria-hidden="true" />
                Pocket Artwork Layers
              </CardTitle>
              <div className="flex items-center gap-2">
                {layers.length > 0 && (
                  <Badge variant="secondary" data-testid="pocket-layer-count-badge">
                    {layers.length} {layers.length === 1 ? 'image' : 'images'}
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="pocket-upload-btn"
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add Images
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="visually-hidden"
                  aria-label="Upload artwork images for inner pockets"
                  data-testid="pocket-upload-image-input"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) {
                      void handleAddImageFiles(files);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3.5">
            {selectedLayer && (
              <div
                className="space-y-2.5 rounded-md border border-primary/30 bg-primary/5 p-2.5"
                data-testid="pocket-selected-layer-controls"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-foreground">
                    Selected: {selectedLayer.fileName}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {roundTo(selectedLayer.widthMm, 1)} × {roundTo(selectedLayer.heightMm, 1)} mm
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'front' as const, label: 'Fit Front Pocket' },
                      { id: 'back' as const, label: 'Fit Back Pocket' },
                      { id: 'liner' as const, label: 'Fit Spine Liner' },
                      { id: 'all' as const, label: 'Fit All' },
                    ] as const
                  ).map((opt) => (
                    <Button
                      key={opt.id}
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      data-testid={`pocket-quick-fit-${opt.id}`}
                      onClick={() => handleQuickFitPocketLayer(selectedLayer.id, opt.id)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                  <Button
                    variant={selectedLayer.tiled ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    aria-pressed={Boolean(selectedLayer.tiled)}
                    data-testid="pocket-tile-toggle-btn"
                    title="Repeat this image seamlessly across all inner pockets (drag corners to adjust tile size)"
                    onClick={() => handleToggleLayerTile(selectedLayer)}
                  >
                    <Grid2x2 className="h-3 w-3" aria-hidden="true" />
                    {selectedLayer.tiled ? 'Tiled Pattern' : 'Tile Pattern'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    data-testid="pocket-copy-other-btn"
                    title="Duplicate this image onto the opposite pocket"
                    onClick={() => handleCopyToOtherPocket(selectedLayer)}
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    Copy to Other Pocket
                  </Button>
                </div>

                <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="pocket-opacity-slider">Artwork Opacity</Label>
                      <span className="font-mono text-muted-foreground">
                        {Math.round(pocketStyle.imageOpacity * 100)}%
                      </span>
                    </div>
                    <Slider
                      id="pocket-opacity-slider"
                      aria-label="Pocket artwork opacity"
                      min={STUDIO_BOUNDS.pocketImageOpacity.min}
                      max={STUDIO_BOUNDS.pocketImageOpacity.max}
                      step={0.05}
                      value={[pocketStyle.imageOpacity]}
                      onValueChange={([imageOpacity]) => updateStyle({ imageOpacity })}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Scale selected pocket image down"
                      data-testid="pocket-layer-scale-down-btn"
                      onClick={() =>
                        updateLayer(selectedLayer.id, (layer) =>
                          CoverImageLayerModel.scaleAroundCenter(layer, 0.9),
                        )
                      }
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Scale selected pocket image up"
                      data-testid="pocket-layer-scale-up-btn"
                      onClick={() =>
                        updateLayer(selectedLayer.id, (layer) =>
                          CoverImageLayerModel.scaleAroundCenter(layer, 1.1),
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {layers.length > 0 ? (
              <ul className="space-y-1.5" data-testid="pocket-layer-list">
                {[...layers].reverse().map((layer, revIdx) => {
                  const index = layers.length - 1 - revIdx;
                  const isSelected = layer.id === selectedLayerId;
                  return (
                    <li
                      key={layer.id}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                        isSelected
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-border bg-secondary/35'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                        data-testid={`pocket-layer-select-${index}`}
                        onClick={() => setSelectedLayerId(layer.id)}
                      >
                        <img
                          src={layer.dataUrl}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded border border-border object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {layer.fileName}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {layer.naturalWidth} × {layer.naturalHeight} px
                          </div>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={index === layers.length - 1}
                          aria-label={`Bring ${layer.fileName} forward`}
                          onClick={() =>
                            updateStyle({
                              layers: CoverImageLayerModel.reorder(layers, layer.id, 'forward'),
                            })
                          }
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={index === 0}
                          aria-label={`Send ${layer.fileName} backward`}
                          onClick={() =>
                            updateStyle({
                              layers: CoverImageLayerModel.reorder(layers, layer.id, 'backward'),
                            })
                          }
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label={`Remove ${layer.fileName}`}
                          data-testid={
                            isSelected || layers.length === 1
                              ? 'pocket-remove-image-btn'
                              : `pocket-remove-layer-${index}`
                          }
                          onClick={() => {
                            const remaining = layers.filter((l) => l.id !== layer.id);
                            updateStyle({ layers: remaining });
                            if (selectedLayerId === layer.id) {
                              setSelectedLayerId(remaining[remaining.length - 1]?.id ?? null);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-secondary/35 px-3.5 py-5 text-center text-xs text-muted-foreground">
                Drag &amp; drop PNG, JPG, or WEBP images directly onto the pockets cutting mat above
                (or click <strong>Add Images</strong>) — then drag to move and pull corners to
                resize.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
