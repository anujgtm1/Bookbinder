import {
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  Layers,
  Magnet,
  Maximize2,
  Minimize2,
  Palette,
  Ruler,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from '@/components/FloatingHudToolbar';
import {
  PdfExportDialog,
  type InnerPdfExportOptions,
  type PdfExportSelection,
} from '@/components/PdfExportDialog';
import { Button } from '@/components/ui/button';
import { getBindingStrategy } from '@/core/bindingStyles';
import { planInnerTemplateLayout } from '@/core/pdfExport';
import { triggerBytesDownload } from '@/core/storage';
import {
  FULL_PAGE_EXIT_BUTTON_CLASS,
  getFullPageStageClass,
  useFullPageCanvas,
} from '@/hooks/useFullPageCanvas';
import { PAGE_SIZES, type PageSizeId, type PrintMediaId } from '@/types/bookParams';
import { GeometryPrimitives, type CaseGeometry, type Rect2D } from '@/types/geometry';
import type { PocketStyleConfig } from '@/types/studio';
import { CoverImageLayerModel, type CoverImageLayer } from '@/types/studioLayer';
import { roundTo, type UnitSystem } from '@/types/units';
import { LayerSelectionOverlay } from './LayerSelectionOverlay';
import {
  computeInnerPocketsLayout,
  computePocketImagePlacement,
  generateStyledInnerTemplatesPdf,
} from './pocketRenderEngine';
import { PocketBlueprintDimensions } from './pockets/PocketBlueprintDimensions';
import {
  PocketPieceBaseSvg,
  PocketPieceGuidesSvg,
  SpineLinerBaseSvg,
  SpineLinerGuidesSvg,
  type PocketViewMode,
} from './pockets/PocketPieceSvg';
import { PocketStyleControls, type PocketQuickFitTarget } from './pockets/PocketStyleControls';
import { buildLayerFlipTransform } from './renderEngine';
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
  readonly printMediaId?: PrintMediaId;
  readonly unit: UnitSystem;
  readonly exportingInnerPdf?: boolean;
  readonly onChangePocketStyle: (next: PocketStyleConfig) => void;
  readonly onChangePageSize?: (sizeId: PageSizeId) => void;
  readonly onDownloadInnerSvg: () => void;
  readonly onDownloadInnerPdf: (options?: InnerPdfExportOptions) => void | Promise<void>;
  readonly onStatusMessage: (message: string) => void;
}

const EMPTY_LAYERS: readonly CoverImageLayer[] = [];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.5;

export function InnerPocketsStudio({
  geometry,
  pocketStyle,
  coverMatchColor,
  pdfPageSize,
  printMediaId = 'exact-auto',
  unit,
  exportingInnerPdf = false,
  onChangePocketStyle,
  onChangePageSize,
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
  const [pdfDialogTarget, setPdfDialogTarget] = useState<'inner-styled' | 'inner-blueprint' | null>(
    null,
  );
  const [localPageSize, setLocalPageSize] = useState<PageSizeId>(pdfPageSize);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    () => layers[layers.length - 1]?.id ?? null,
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportingStyledPdf, setExportingStyledPdf] = useState(false);
  const { isExpanded, toggleExpanded, exitExpanded } = useFullPageCanvas();

  const activePageSize = onChangePageSize ? pdfPageSize : localPageSize;

  const svgRef = useRef<SVGSVGElement>(null);
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
    () => planInnerTemplateLayout(geometry, activePageSize, { includeLegend: includePdfLegend }),
    [geometry, activePageSize, includePdfLegend],
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

  const handleDownloadStyledPdf = async (options?: {
    readonly pageSizeId?: PageSizeId;
    readonly includeGuides?: boolean;
    readonly includeLegend?: boolean;
  }) => {
    const effectivePageSize = options?.pageSizeId ?? activePageSize;
    const effectiveGuides = options?.includeGuides ?? includePdfGuides;
    const effectiveLegend = options?.includeLegend ?? includePdfLegend;
    setIncludePdfGuides(effectiveGuides);
    setIncludePdfLegend(effectiveLegend);
    setExportingStyledPdf(true);
    try {
      const { bytes, plan } = await generateStyledInnerTemplatesPdf(
        geometry,
        effectivePageSize,
        pocketStyle,
        undefined,
        { includeLegend: effectiveLegend, includeGuides: effectiveGuides },
      );
      triggerBytesDownload(bytes, 'inner_pockets_styled.pdf', 'application/pdf');
      onStatusMessage(
        `Exported inner_pockets_styled.pdf (${plan.pageCount} ${plan.pageCount === 1 ? 'page' : 'pages'}, 300 DPI${effectiveLegend ? ' with legend' : ''})`,
      );
    } catch {
      onStatusMessage('Failed to generate Styled Pockets PDF.');
    } finally {
      setExportingStyledPdf(false);
    }
  };

  const handleConfirmPdfExport = async (selection: PdfExportSelection) => {
    setIncludePdfGuides(selection.includeGuides);
    setIncludePdfLegend(selection.includeLegend);
    if (selection.target === 'inner-styled') {
      await handleDownloadStyledPdf({
        pageSizeId: selection.pageSizeId,
        includeGuides: selection.includeGuides,
        includeLegend: selection.includeLegend,
      });
      return;
    }
    await onDownloadInnerPdf({
      pageSizeId: selection.pageSizeId,
      includeLegend: selection.includeLegend,
    });
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

  const bindingStrategy = getBindingStrategy(geometry.bindingStyle);

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
              {!bindingStrategy.capabilities.usesInnerPockets
                ? `Note: ${bindingStrategy.shortLabel} does not require separate inner pocket sheets — these templates are optional.`
                : 'Drop images directly onto any pocket, drag and resize with magnetic guides, or inspect 1:1 mm fold flaps and auto-paginated print sheets.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => setPdfDialogTarget('inner-styled')}
              disabled={exportingStyledPdf}
              data-testid="download-styled-inner-pdf-btn"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {exportingStyledPdf ? 'Rendering PDF…' : 'Styled Pockets PDF…'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPdfDialogTarget('inner-blueprint')}
              disabled={exportingInnerPdf}
              aria-label="Open Inner Pockets Plain Cut PDF export dialog"
              data-testid="download-inner-pdf-btn"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {exportingInnerPdf ? '…' : 'Plain Cut PDF…'}
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
          data-testid="pockets-canvas-stage"
          data-expanded={isExpanded ? 'true' : 'false'}
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
          className={`cutting-mat-surface overflow-hidden select-none transition-colors ${getFullPageStageClass(isExpanded)} ${
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

          {/* Top-right pagination badge & full-page exit button */}
          <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-brass-bright/40 bg-black/35 px-2.5 py-0.5 font-mono text-[11px] text-[#f6efe2]">
              <Download className="h-3 w-3 text-brass-bright" aria-hidden="true" />
              <span>
                {pdfPlan.pageCount} {pdfPlan.pageCount === 1 ? 'page' : 'pages'} •{' '}
                {PAGE_SIZES[activePageSize].id.toUpperCase()}
              </span>
            </div>
            {isExpanded && (
              <button
                type="button"
                onClick={exitExpanded}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                data-testid="pockets-exit-fullscreen-btn"
                aria-label="Exit full screen canvas"
                title="Exit full screen (Esc)"
                className={FULL_PAGE_EXIT_BUTTON_CLASS}
              >
                <Minimize2 className="h-3.5 w-3.5 text-brass-bright" aria-hidden="true" />
                <span>Exit Full Screen</span>
                <kbd className="rounded border border-[#f6efe2]/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#f6efe2]/80">
                  Esc
                </kbd>
              </button>
            )}
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
                            transform={buildLayerFlipTransform(
                              0,
                              0,
                              tileW,
                              tileH,
                              layer.flipX,
                              layer.flipY,
                            )}
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
                <SpineLinerBaseSvg
                  uniquePrefix={uniquePrefix}
                  spineLiner={spineLiner}
                  offsetX={innerLayout.linerX}
                  offsetY={innerLayout.linerY}
                  style={pocketStyle}
                  viewMode={viewMode}
                  linerImgPlacement={linerImgPlacement}
                />
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
                        transform={buildLayerFlipTransform(
                          layer.xMm,
                          layer.yMm,
                          layer.widthMm,
                          layer.heightMm,
                          layer.flipX,
                          layer.flipY,
                        )}
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
              <SpineLinerGuidesSvg
                spineLiner={spineLiner}
                offsetX={innerLayout.linerX}
                offsetY={innerLayout.linerY}
                unit={unit}
                viewMode={viewMode}
                showGuides={showGuides}
              />
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
                <PocketBlueprintDimensions
                  geometry={geometry}
                  innerLayout={innerLayout}
                  unit={unit}
                />
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

              <HudSeparator />

              <HudGroup label="Canvas size">
                <HudButton
                  pressed={isExpanded}
                  onClick={toggleExpanded}
                  title="Expand canvas to full page (Esc to exit)"
                  data-testid="pockets-fullscreen-btn"
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isExpanded ? 'Exit' : 'Full Screen'}
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
      <PocketStyleControls
        pocketStyle={pocketStyle}
        coverMatchColor={coverMatchColor}
        layers={layers}
        selectedLayerId={selectedLayerId}
        selectedLayer={selectedLayer}
        onUpdateStyle={updateStyle}
        onUpdateLayer={updateLayer}
        onSelectLayer={setSelectedLayerId}
        onAddImageFiles={handleAddImageFiles}
        onQuickFitLayer={handleQuickFitPocketLayer}
        onToggleLayerTile={handleToggleLayerTile}
        onCopyToOtherPocket={handleCopyToOtherPocket}
        onStatusMessage={onStatusMessage}
      />

      {/* Unified Print & Export PDF Modal */}
      <PdfExportDialog
        open={pdfDialogTarget !== null}
        target={pdfDialogTarget ?? 'inner-styled'}
        geometry={geometry}
        unit={unit}
        printMediaId={printMediaId}
        onChangePrintMedia={() => {}}
        pageSizeId={activePageSize}
        onChangePageSize={(sizeId) => {
          setLocalPageSize(sizeId);
          onChangePageSize?.(sizeId);
        }}
        splitMode="single"
        defaultIncludeGuides={includePdfGuides}
        defaultIncludeLegend={includePdfLegend}
        exporting={exportingStyledPdf || exportingInnerPdf}
        onConfirmExport={handleConfirmPdfExport}
        onClose={() => setPdfDialogTarget(null)}
      />
    </div>
  );
}
