import {
  BookOpen,
  Box,
  Compass,
  Eye,
  EyeOff,
  FileCode2,
  FileImage,
  FileText,
  Layers,
  Magnet,
  Maximize2,
  Pipette,
  ShieldAlert,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from '@/components/FloatingHudToolbar';
import { OuterBlueprintCanvas } from '@/components/OuterBlueprintCanvas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  triggerBlobDownload,
  triggerBytesDownload,
  triggerTextDownload,
} from '@/core/storage';
import { BookParametersModel, type BookParameters } from '@/types/bookParams';
import { GeometryPrimitives, type CaseGeometry, type Rect2D } from '@/types/geometry';
import {
  CoverStudioModel,
  type CoverStudioState,
  type SpineTypographyConfig,
} from '@/types/studio';
import {
  CoverImageLayerModel,
  type CoverImageLayer,
  type LayerClipZone,
  type QuickFitTarget,
  type StubExtensionMode,
} from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import { ArtworkControlsCard, type EyedropperTarget } from './ArtworkControlsCard';
import { Book3DPreview } from './Book3DPreview';
import { LayerSelectionOverlay } from './LayerSelectionOverlay';
import { PreflightCard } from './PreflightCard';
import { SpineTypographyCard } from './SpineTypographyCard';
import {
  BOOK_3D_PRESETS,
  Book3DModel,
  DEFAULT_BOOK_3D_ANGLE,
  type Book3DCameraAngle,
} from './book3d';
import {
  applyStubExtensionToLayer,
  detectLayerCoverSide,
  type StubExtensionSide,
} from './edgeExtend';
import {
  loadCustomFontFromFile,
  resolveFontCssFamily,
  type CustomFontAsset,
} from './fonts';
import { PreflightEngine, type PreflightQuickFix } from './preflight';
import {
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  exportCoverPng300Dpi,
  generateAffinityCoverSvg,
  generatePrintReadyRollPdf,
  renderCoverArtworkCanvas,
  resolveQuickFitRect,
  resolveZoneClipRect,
} from './renderEngine';
import { buildCanvasSnapTargets } from './snapGuides';
import {
  isSupportedImageFile,
  readImageFile,
  useInteractiveLayers,
} from './useInteractiveLayers';

export interface CoverStylerProps {
  readonly params?: BookParameters;
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly exportingOuterPdf?: boolean;
  readonly onChange: (next: CoverStudioState) => void;
  readonly onUpdateParams?: (patch: Partial<BookParameters>) => void;
  readonly onDownloadOuterSvg?: () => void;
  readonly onDownloadOuterPdf?: () => void;
  readonly onStatusMessage: (message: string) => void;
}

type StudioViewMode = '2d' | 'blueprint' | '3d';

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function CoverStyler({
  params,
  geometry,
  studio,
  exportingOuterPdf = false,
  onChange,
  onUpdateParams,
  onDownloadOuterSvg,
  onDownloadOuterPdf,
  onStatusMessage,
}: CoverStylerProps) {
  const effectiveParams = useMemo(
    () => params ?? BookParametersModel.createDefault(),
    [params],
  );
  const [viewMode, setViewMode] = useState<StudioViewMode>('2d');
  const [blueprintZoom, setBlueprintZoom] = useState(1);
  const [blueprintPan, setBlueprintPan] = useState({ x: 0, y: 0 });
  const [book3DAngle, setBook3DAngle] = useState<Book3DCameraAngle>(DEFAULT_BOOK_3D_ANGLE);
  const [book3DCoverOpen, setBook3DCoverOpen] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    () => studio.layers[studio.layers.length - 1]?.id ?? null,
  );
  const [customFont, setCustomFont] = useState<CustomFontAsset | null>(null);
  const [eyedropperTarget, setEyedropperTarget] = useState<EyedropperTarget>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showPreflightOverlays, setShowPreflightOverlays] = useState(true);
  const [checkDpi, setCheckDpi] = useState(true);
  const [ignoredIssueIds, setIgnoredIssueIds] = useState<ReadonlySet<string>>(() => new Set());
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [extendingStub, setExtendingStub] = useState(false);
  const [sampledEdgeHex, setSampledEdgeHex] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportingKind, setExportingKind] = useState<'pdf' | 'png' | 'svg' | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const studioRef = useRef(studio);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    studioRef.current = studio;
    onChangeRef.current = onChange;
  }, [studio, onChange]);

  const spec = useMemo(() => computeStudioCanvasSpec(geometry, PRINT_DPI), [geometry]);
  const canvasBounds = useMemo<Rect2D>(
    () => ({ x: 0, y: 0, width: spec.totalWidthMm, height: spec.totalHeightMm }),
    [spec.totalWidthMm, spec.totalHeightMm],
  );
  const snapTargets = useMemo(() => buildCanvasSnapTargets(geometry, spec), [geometry, spec]);

  const {
    activeSnapGuides,
    suppressNextClickRef,
    toSvgMm,
    startMoveDrag,
    startResizeDrag,
    handleLayerWheel,
  } = useInteractiveLayers({
    svgRef,
    viewBox: canvasBounds,
    layers: studio.layers,
    selectedLayerId,
    snapTargets,
    snapEnabled,
    enabled: viewMode === '2d',
    onChangeLayers: (nextLayers) => {
      onChangeRef.current({ ...studioRef.current, layers: nextLayers });
    },
    onSelectLayer: setSelectedLayerId,
  });
  const preflight = useMemo(
    () =>
      PreflightEngine.evaluate(effectiveParams, geometry, studio, {
        checkDpi,
        ignoredIssueIds,
      }),
    [effectiveParams, geometry, studio, checkDpi, ignoredIssueIds],
  );
  const spinePlacements = useMemo(
    () => computeSpineTextPlacements(geometry, studio),
    [geometry, studio],
  );
  const maxFontSizePt = CoverStudioModel.maxSpineFontSizePt(geometry.outerWrap.spineRect.width);
  const effectiveFontSizePt = CoverStudioModel.effectiveSpineFontSizePt(
    studio.spineText.fontSizePt,
    geometry.outerWrap.spineRect.width,
  );
  const activeFontFamily = resolveFontCssFamily(studio.spineText.fontId, customFont);
  const activePreset3D = Book3DModel.matchPreset(book3DAngle);

  const selectedLayer = useMemo(
    () => studio.layers.find((l) => l.id === selectedLayerId) ?? null,
    [studio.layers, selectedLayerId],
  );

  const shiftedCutPolygon = useMemo(
    () =>
      GeometryPrimitives.translatePolygon(
        geometry.outerWrap.outerCutPolygon,
        spec.bleedMm,
        spec.bleedMm,
      ),
    [geometry.outerWrap.outerCutPolygon, spec.bleedMm],
  );

  const updateStudio = (patch: Partial<CoverStudioState>) => onChange({ ...studio, ...patch });
  const updateSpineText = (patch: Partial<SpineTypographyConfig>) =>
    onChange({ ...studio, spineText: { ...studio.spineText, ...patch } });
  const updateLayer = (id: string, updater: (layer: CoverImageLayer) => CoverImageLayer) => {
    onChange({
      ...studio,
      layers: studio.layers.map((layer) => (layer.id === id ? updater(layer) : layer)),
    });
  };

  const handleExtendLayerStub = async (
    layerId: string,
    mode: StubExtensionMode,
    explicitSide?: StubExtensionSide,
  ) => {
    const targetLayer = studioRef.current.layers.find((l) => l.id === layerId);
    if (!targetLayer) return;
    const side = explicitSide ?? detectLayerCoverSide(targetLayer, geometry);
    setExtendingStub(true);
    try {
      const { layer: updated, sampledSpineEdgeHex } = await applyStubExtensionToLayer(
        targetLayer,
        geometry,
        side,
        mode,
      );
      const latest = studioRef.current;
      onChangeRef.current({
        ...latest,
        layers: latest.layers.map((l) => (l.id === layerId ? updated : l)),
      });
      setSelectedLayerId(layerId);
      setSampledEdgeHex(sampledSpineEdgeHex);
      if (mode === 'none') {
        onStatusMessage(`Restored original "${targetLayer.fileName}" onto ${side} board`);
      } else {
        onStatusMessage(
          `Extended "${targetLayer.fileName}" across ${side} pasting stub (${mode})`,
        );
      }
    } catch {
      onStatusMessage('Could not extend cover edges onto the pasting stub.');
    } finally {
      setExtendingStub(false);
    }
  };

  const clipZoneForQuickFit = (target: QuickFitTarget): LayerClipZone =>
    target === 'fullWrap' ? 'none' : target;

  const handleQuickFitLayer = (id: string, target: QuickFitTarget) => {
    const targetLayer = studioRef.current.layers.find((l) => l.id === id);
    if (!targetLayer) return;

    const nextClipZone = clipZoneForQuickFit(target);
    const activeStubMode = targetLayer.stubExtensionMode;

    // If pasting-stub extension is active on this layer, re-synthesize cleanly for the current book size
    if (activeStubMode && activeStubMode !== 'none') {
      if (target === 'front' || target === 'back') {
        void handleExtendLayerStub(id, activeStubMode, target);
        return;
      }
      // Fitting an extended layer to spine or fullWrap reverts cleanly to the unextended source image
      const sourceLayer: CoverImageLayer = {
        ...targetLayer,
        dataUrl: targetLayer.originalDataUrl ?? targetLayer.dataUrl,
        naturalWidth: targetLayer.originalWidth ?? targetLayer.naturalWidth,
        naturalHeight: targetLayer.originalHeight ?? targetLayer.naturalHeight,
        originalDataUrl: undefined,
        originalWidth: undefined,
        originalHeight: undefined,
        stubExtensionMode: 'none',
        stubExtensionSide: undefined,
      };
      const targetRect = resolveQuickFitRect(spec, target);
      updateLayer(id, () => CoverImageLayerModel.fitToRect(sourceLayer, targetRect, nextClipZone));
      return;
    }

    const targetRect = resolveQuickFitRect(spec, target);
    updateLayer(id, (layer) => CoverImageLayerModel.fitToRect(layer, targetRect, nextClipZone));
  };

  const handleApplyQuickFix = (fix: PreflightQuickFix) => {
    switch (fix.kind) {
      case 'fit-layer': {
        handleQuickFitLayer(fix.layerId, fix.target);
        setSelectedLayerId(fix.layerId);
        onStatusMessage(`Applied Quick Fit (${fix.label})`);
        break;
      }
      case 'extend-stub':
        void handleExtendLayerStub(fix.layerId, 'edge-smear', fix.side);
        break;
      case 'enable-bleed':
        onUpdateParams?.({ includeBleed: true, bleedMm: fix.bleedMm });
        onStatusMessage(`Enabled ${fix.bleedMm} mm outer artwork bleed`);
        break;
      case 'author-vertical':
        updateSpineText({ authorOrientation: 'vertical' });
        onStatusMessage('Switched spine author writing to Vertical');
        break;
      case 'high-contrast-spine-text':
        updateSpineText({ textColor: fix.hexColor });
        onStatusMessage(`Updated spine ink to ${fix.hexColor.toUpperCase()} for high contrast`);
        break;
      case 'enable-split-mode':
        onUpdateParams?.({ splitMode: 'three-piece' });
        onStatusMessage('Enabled 3-Piece Quarter-Bound Split');
        break;
      case 'select-layer':
        setViewMode('2d');
        setSelectedLayerId(fix.layerId);
        break;
      case 'switch-binding-style':
        onUpdateParams?.({ bindingStyle: fix.bindingStyle });
        onStatusMessage(
          fix.bindingStyle === 'flexible-spine'
            ? 'Switched to Flexible Spine (2-board, no rigid spine strip)'
            : fix.bindingStyle === 'softcover-jacket'
              ? 'Switched to 0-Board Softcover Slip-In Jacket'
              : 'Switched to Rigid 3-Board Hardcover Case',
        );
        break;
      case 'apply-pocket-proportions':
        onUpdateParams?.({
          boardThicknessMm: 1.5,
          spineAllowanceMm: 1.5,
          turnInMm: 14,
          overhangForeEdgeMm: 1.5,
          overhangTopBottomMm: 3,
        });
        onStatusMessage('Applied compact pocket proportions (1.5 mm board, 14 mm turn-ins)');
        break;
    }
  };

  const defaultPlacementRectForDrop = (dropPoint?: { xMm: number; yMm: number }): Rect2D => {
    if (dropPoint) {
      if (dropPoint.xMm < spec.spineZoneRect.x) return spec.backZoneRect;
      if (dropPoint.xMm < spec.frontZoneRect.x) return spec.spineZoneRect;
      return spec.frontZoneRect;
    }
    const count = studio.layers.length;
    if (count === 0) return spec.frontZoneRect;
    if (count === 1) return spec.backZoneRect;
    if (count === 2) return spec.spineZoneRect;
    return {
      x: spec.totalWidthMm * 0.25,
      y: spec.totalHeightMm * 0.2,
      width: spec.totalWidthMm * 0.5,
      height: spec.totalHeightMm * 0.6,
    };
  };

  const handleAddImageFiles = async (
    files: readonly File[],
    dropPoint?: { xMm: number; yMm: number },
  ) => {
    const validFiles = files.filter(isSupportedImageFile);
    if (validFiles.length === 0) {
      onStatusMessage('Please upload PNG, JPG, or WEBP image files.');
      return;
    }

    const addedLayers: CoverImageLayer[] = [];
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const decoded = await readImageFile(file);
        const baseRect = defaultPlacementRectForDrop(dropPoint);
        const offset = i * 8;
        const targetRect = {
          x: baseRect.x + offset,
          y: baseRect.y + offset,
          width: baseRect.width,
          height: baseRect.height,
        };
        const layer = CoverImageLayerModel.createInRect({
          dataUrl: decoded.dataUrl,
          fileName: file.name,
          naturalWidth: decoded.width,
          naturalHeight: decoded.height,
          targetRect,
          clipZone: 'none',
          mode: 'contain',
        });
        addedLayers.push(layer);
      } catch {
        onStatusMessage(`Could not read image "${file.name}".`);
      }
    }

    if (addedLayers.length > 0) {
      onChange({
        ...studio,
        layers: [...studio.layers, ...addedLayers],
      });
      setSelectedLayerId(addedLayers[addedLayers.length - 1].id);
      onStatusMessage(
        addedLayers.length === 1
          ? `Added "${addedLayers[0].fileName}" — drag to move or pull corners to resize`
          : `Added ${addedLayers.length} artwork images to canvas`,
      );
    }
  };

  const handleCustomFontUpload = async (file: File) => {
    try {
      const asset = await loadCustomFontFromFile(file);
      setCustomFont(asset);
      updateSpineText({ fontId: 'custom', customFontName: asset.fileName });
      onStatusMessage(
        asset.pdfEmbeddable
          ? `Loaded custom font "${asset.fileName}"`
          : `Loaded "${asset.fileName}" for preview/PNG (PDF export uses serif fallback for .woff2)`,
      );
    } catch (err) {
      onStatusMessage(err instanceof Error ? err.message : 'Failed to load custom font.');
    }
  };

  const applySampledColor = (hex: string, target: Exclude<EyedropperTarget, null>) => {
    const latest = studioRef.current;
    if (target === 'spine') {
      onChangeRef.current({ ...latest, spineBgColor: hex });
    } else if (target === 'back') {
      onChangeRef.current({ ...latest, backBgColor: hex });
    } else {
      onChangeRef.current({
        ...latest,
        spineBgColor: hex,
        backBgColor: hex,
        frontBgColor: hex,
      });
    }
    setEyedropperTarget(null);
    onStatusMessage(`Sampled ${hex.toUpperCase()} from cover`);
  };

  const sampleColorAtSvgClick = async (
    clientX: number,
    clientY: number,
    target: Exclude<EyedropperTarget, null>,
  ) => {
    const pt = toSvgMm(clientX, clientY);
    if (!pt) return;
    const relX = pt.xMm / spec.totalWidthMm;
    const relY = pt.yMm / spec.totalHeightMm;

    try {
      const sampleCanvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
        includeSpineText: false,
        dpi: 72,
      });
      const px = Math.min(sampleCanvas.width - 1, Math.max(0, Math.floor(relX * sampleCanvas.width)));
      const py = Math.min(sampleCanvas.height - 1, Math.max(0, Math.floor(relY * sampleCanvas.height)));
      const ctx = sampleCanvas.getContext('2d');
      if (!ctx) return;
      const pixel = ctx.getImageData(px, py, 1, 1).data;
      applySampledColor(rgbToHex(pixel[0], pixel[1], pixel[2]), target);
    } catch {
      setEyedropperTarget(null);
      onStatusMessage('Could not sample color from cover image.');
    }
  };

  const handleExportPrintPdf = async () => {
    setExportingKind('pdf');
    try {
      const bytes = await generatePrintReadyRollPdf(geometry, studio, customFont);
      triggerBytesDownload(bytes, 'outer_cover_print.pdf', 'application/pdf');
      onStatusMessage('Exported outer_cover_print.pdf (300 DPI + vector spine text)');
    } catch {
      onStatusMessage('Failed to generate Print-Ready Roll PDF.');
    } finally {
      setExportingKind(null);
    }
  };

  const handleExportAffinityPng = async () => {
    setExportingKind('png');
    try {
      const blob = await exportCoverPng300Dpi(geometry, studio, customFont);
      triggerBlobDownload(blob, 'outer_cover_300dpi.png');
      onStatusMessage(
        `Exported outer_cover_300dpi.png (${spec.pixelWidth}×${spec.pixelHeight}px @ 300 DPI)`,
      );
    } catch {
      onStatusMessage('Failed to export 300 DPI PNG.');
    } finally {
      setExportingKind(null);
    }
  };

  const handleExportAffinitySvg = async () => {
    setExportingKind('svg');
    try {
      let artworkDataUrl: string | undefined;
      if (studio.layers.length > 0) {
        const canvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
          includeSpineText: false,
          dpi: PRINT_DPI,
        });
        artworkDataUrl = canvas.toDataURL('image/png');
      }
      const svg = generateAffinityCoverSvg(geometry, studio, customFont, artworkDataUrl);
      triggerTextDownload(svg, 'outer_cover_300dpi.svg', 'image/svg+xml;charset=utf-8');
      onStatusMessage('Exported outer_cover_300dpi.svg (1:1 mm Affinity round-trip)');
    } catch {
      onStatusMessage('Failed to export Affinity SVG.');
    } finally {
      setExportingKind(null);
    }
  };

  const adjustBlueprintZoom = (delta: number) => {
    setBlueprintZoom((prev) => roundTo(Math.min(3.5, Math.max(0.5, prev + delta)), 2));
  };

  const resetBlueprintView = () => {
    setBlueprintZoom(1);
    setBlueprintPan({ x: 0, y: 0 });
  };

  const handleCornerSize = Math.max(7.5, spec.totalWidthMm * 0.022);

  return (
    <div className="flex flex-col gap-4" data-testid="cover-styler">
      {/* Edge-to-Edge Unified Outer Case Wrap Workbench connected flush under the Folio Index Tabs */}
      <section
        aria-label="Interactive Cover and Spine Workbench"
        className="overflow-hidden rounded-b-lg rounded-tr-lg border border-border bg-card shadow-xs"
      >
        {/* Compact Header + Grouped Styled (300 DPI) & Cut-Only (1:1 mm) Export Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="font-serif text-base font-semibold tracking-tight text-foreground">
              Outer Case Wrap &amp; Cover Styler
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Style artwork &amp; spine lettering, inspect the 1:1 mm CAD blueprint, or orbit in 3D ({spec.pixelWidth} ×{' '}
              {spec.pixelHeight} px @ 300 DPI).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Styled 300 DPI Artwork Exports */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="default"
                size="sm"
                onClick={handleExportPrintPdf}
                disabled={exportingKind !== null}
                data-testid="studio-export-pdf-btn"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                {exportingKind === 'pdf' ? 'Rendering…' : 'Print PDF (300 DPI)'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportAffinityPng}
                disabled={exportingKind !== null}
                data-testid="studio-export-png-btn"
              >
                <FileImage className="h-4 w-4" aria-hidden="true" />
                {exportingKind === 'png' ? 'Rendering…' : 'PNG'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportAffinitySvg}
                disabled={exportingKind !== null}
                data-testid="studio-export-svg-btn"
              >
                <FileCode2 className="h-4 w-4" aria-hidden="true" />
                Affinity SVG
              </Button>
            </div>

            {/* 1:1 mm Unstyled Structural Cut Templates */}
            {(onDownloadOuterSvg || onDownloadOuterPdf) && (
              <div
                className="flex items-center gap-1 rounded-md border border-border bg-secondary/45 px-2 py-1"
                aria-label="Structural cut-only outer wrap downloads"
              >
                <span className="pr-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Cut-Only
                </span>
                {onDownloadOuterSvg && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={onDownloadOuterSvg}
                    aria-label="Download Outer Case Wrap as SVG"
                    data-testid="download-outer-svg-btn"
                  >
                    SVG
                  </Button>
                )}
                {onDownloadOuterPdf && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={onDownloadOuterPdf}
                    disabled={exportingOuterPdf}
                    aria-label="Download Outer Case Wrap as PDF"
                    data-testid="download-outer-pdf-btn"
                  >
                    {exportingOuterPdf ? '…' : 'PDF'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Full-Bleed Self-Healing Bindery Cutting Mat Stage */}
        <div
          id="studio-mat-viewport"
          data-testid="studio-canvas-dropzone"
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
            const dropPt =
              viewMode === '2d' ? (toSvgMm(e.clientX, e.clientY) ?? undefined) : undefined;
            void handleAddImageFiles(files, dropPt);
          }}
          className={`cutting-mat-surface relative flex h-[470px] w-full items-center justify-center overflow-hidden border-y transition-colors sm:h-[510px] ${
            isDraggingOver
              ? 'border-brass-bright ring-2 ring-inset ring-brass-bright/70'
              : eyedropperTarget
                ? 'border-amber-400 cursor-crosshair'
                : 'border-border/80'
          }`}
        >
          {/* Contextual Top Banner (Eyedropper active or helpful status pill) */}
          <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2">
            {eyedropperTarget && (
              <Badge
                variant="warning"
                data-testid="eyedropper-active-banner"
                className="pointer-events-auto border-amber-400/60 bg-amber-950/90 text-amber-100 shadow-md"
              >
                <Pipette className="h-3.5 w-3.5" aria-hidden="true" />
                Click anywhere on the cover preview to sample color for {eyedropperTarget}
              </Badge>
            )}
          </div>

          {/* Dropzone visual cue */}
          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-brass-bright bg-black/45 backdrop-blur-[1px]">
              <span className="rounded-full border border-brass-bright/60 bg-black/75 px-4 py-1.5 font-serif text-sm font-semibold text-[#faf6ee] shadow-lg">
                Drop image onto Back Cover, Spine, or Front Cover
              </span>
            </div>
          )}

          {viewMode === '2d' ? (
            <div className="flex h-full w-full items-center justify-center p-6 pb-16">
              <svg
                ref={svgRef}
                role="img"
                aria-label="Interactive hardcover outer wrap canvas with draggable images and spine typography"
                data-testid="studio-preview-svg"
                viewBox={`0 0 ${spec.totalWidthMm} ${spec.totalHeightMm}`}
                className={`max-h-full max-w-full select-none drop-shadow-[0_16px_28px_rgba(0,0,0,0.48)] ${
                  eyedropperTarget ? 'cursor-crosshair' : 'cursor-default'
                }`}
                style={{ touchAction: 'none' }}
                onClick={(e) => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    return;
                  }
                  if (eyedropperTarget) {
                    void sampleColorAtSvgClick(e.clientX, e.clientY, eyedropperTarget);
                  } else if (e.target === e.currentTarget) {
                    setSelectedLayerId(null);
                  }
                }}
                onWheel={(e) => {
                  if (!selectedLayer) return;
                  e.preventDefault();
                  handleLayerWheel(selectedLayer, e.deltaY);
                }}
              >
                <title>Outer Cover Styler Interactive Canvas</title>
                <defs>
                  <clipPath id="studio-clip-none">
                    <rect x={0} y={0} width={spec.totalWidthMm} height={spec.totalHeightMm} />
                  </clipPath>
                  <clipPath id="studio-clip-back">
                    <rect
                      x={spec.backZoneRect.x}
                      y={spec.backZoneRect.y}
                      width={spec.backZoneRect.width}
                      height={spec.backZoneRect.height}
                    />
                  </clipPath>
                  <clipPath id="studio-clip-spine">
                    <rect
                      x={spec.spineZoneRect.x}
                      y={spec.spineZoneRect.y}
                      width={spec.spineZoneRect.width}
                      height={spec.spineZoneRect.height}
                    />
                  </clipPath>
                  <clipPath id="studio-clip-front">
                    <rect
                      x={spec.frontZoneRect.x}
                      y={spec.frontZoneRect.y}
                      width={spec.frontZoneRect.width}
                      height={spec.frontZoneRect.height}
                    />
                  </clipPath>
                  <pattern
                    id="preflight-hatch-error"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="rgba(239, 68, 68, 0.24)" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="1.6" />
                  </pattern>
                  <pattern
                    id="preflight-hatch-warning"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="rgba(249, 115, 22, 0.20)" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#f97316" strokeWidth="1.4" />
                  </pattern>
                  <filter id="brass-snap-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor="#facc15" floodOpacity="0.9" />
                  </filter>
                </defs>

                {/* Base Zone Background Fills */}
                <rect
                  x={spec.backZoneRect.x}
                  y={spec.backZoneRect.y}
                  width={spec.backZoneRect.width}
                  height={spec.backZoneRect.height}
                  fill={studio.backBgColor}
                  data-testid="studio-back-fill"
                  onClick={(e) => {
                    if (!eyedropperTarget) {
                      e.stopPropagation();
                      setSelectedLayerId(null);
                    }
                  }}
                />
                <rect
                  x={spec.spineZoneRect.x}
                  y={spec.spineZoneRect.y}
                  width={spec.spineZoneRect.width}
                  height={spec.spineZoneRect.height}
                  fill={studio.spineBgColor}
                  data-testid="studio-spine-fill"
                  onClick={(e) => {
                    if (!eyedropperTarget) {
                      e.stopPropagation();
                      setSelectedLayerId(null);
                    }
                  }}
                />
                <rect
                  x={spec.frontZoneRect.x}
                  y={spec.frontZoneRect.y}
                  width={spec.frontZoneRect.width}
                  height={spec.frontZoneRect.height}
                  fill={studio.frontBgColor}
                  data-testid="studio-front-fill"
                  onClick={(e) => {
                    if (!eyedropperTarget) {
                      e.stopPropagation();
                      setSelectedLayerId(null);
                    }
                  }}
                />

                {/* Free-Form Draggable & Resizable Artwork Layers */}
                {studio.layers.map((layer, index) => {
                  const clipId = `studio-clip-${layer.clipZone}`;
                  return (
                    <g key={layer.id} clipPath={`url(#${clipId})`}>
                      <image
                        href={layer.dataUrl}
                        x={layer.xMm}
                        y={layer.yMm}
                        width={layer.widthMm}
                        height={layer.heightMm}
                        preserveAspectRatio="none"
                        data-testid={`studio-layer-${index}`}
                        className={
                          eyedropperTarget ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
                        }
                        onClick={(e) => {
                          if (eyedropperTarget) return;
                          e.stopPropagation();
                          setSelectedLayerId(layer.id);
                        }}
                        onPointerDown={(e) => {
                          if (eyedropperTarget) return;
                          e.stopPropagation();
                          startMoveDrag(layer, e.clientX, e.clientY);
                        }}
                      />
                    </g>
                  );
                })}

                {/* Spine Typography Overlay */}
                <g data-testid="studio-spine-typography" pointerEvents="none">
                  {spinePlacements.map((item, idx) => (
                    <text
                      key={`${item.kind}-${idx}`}
                      x={item.anchorXMm}
                      y={item.anchorYMm}
                      fill={studio.spineText.textColor}
                      fontFamily={activeFontFamily}
                      fontSize={UnitConverter.pointsToMm(item.fontSizePt)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${item.rotationDegCss} ${item.anchorXMm} ${item.anchorYMm})`}
                    >
                      {item.text}
                    </text>
                  ))}
                </g>

                {/* Fold, Board & Cut Guides Overlay */}
                {showGuides && (
                  <g pointerEvents="none">
                    <path
                      d={GeometryPrimitives.polygonToSvgPath(shiftedCutPolygon, 2)}
                      fill="none"
                      stroke="#FF4D3D"
                      strokeWidth="0.95"
                      strokeDasharray={
                        studio.cutLineMode === 'bleed-registration' ? '4 2.5' : undefined
                      }
                    />
                    {[
                      geometry.outerWrap.backBoardRect,
                      geometry.outerWrap.spineRect,
                      geometry.outerWrap.frontBoardRect,
                    ].map((rect, i) => (
                      <rect
                        key={i}
                        x={rect.x + spec.bleedMm}
                        y={rect.y + spec.bleedMm}
                        width={rect.width}
                        height={rect.height}
                        fill="none"
                        stroke="#ffffff"
                        strokeOpacity="0.68"
                        strokeWidth="0.7"
                        strokeDasharray="5 3"
                      />
                    ))}
                    {studio.layers.length === 0 && (
                      <>
                        <text
                          x={
                            spec.bleedMm +
                            geometry.outerWrap.backBoardRect.x +
                            geometry.outerWrap.backBoardRect.width / 2
                          }
                          y={spec.totalHeightMm / 2}
                          fill="#ffffff"
                          fillOpacity="0.45"
                          fontSize="7.5"
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          BACK COVER
                        </text>
                        <text
                          x={
                            spec.bleedMm +
                            geometry.outerWrap.frontBoardRect.x +
                            geometry.outerWrap.frontBoardRect.width / 2
                          }
                          y={spec.totalHeightMm / 2}
                          fill="#ffffff"
                          fillOpacity="0.45"
                          fontSize="7.5"
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          DROP IMAGES ANYWHERE
                        </text>
                      </>
                    )}
                  </g>
                )}

                {/* Preview-Only Red/Amber Preflight Consistency Overlays */}
                {(showPreflightOverlays || activeIssueId !== null) &&
                  preflight.issues.some((i) => i.highlights.length > 0) && (
                    <g data-testid="studio-preflight-overlays" pointerEvents="none">
                      {preflight.issues.map((issue) => {
                        if (issue.highlights.length === 0) return null;
                        if (!showPreflightOverlays && activeIssueId !== issue.id) return null;
                        const dimmed = activeIssueId !== null && activeIssueId !== issue.id;
                        return (
                          <g key={issue.id} opacity={dimmed ? 0.22 : 1}>
                            {issue.highlights.map((hl, idx) => {
                              const isErr = hl.severity === 'error';
                              const isOutline = hl.style === 'outline';
                              const strokeColor = isErr ? '#ef4444' : '#f97316';
                              const fillValue = isOutline
                                ? 'none'
                                : isErr
                                  ? 'url(#preflight-hatch-error)'
                                  : 'url(#preflight-hatch-warning)';
                              const pillW = Math.min(hl.rect.width * 0.9, 44);
                              const cx = isOutline
                                ? hl.rect.x + hl.rect.width - pillW / 2 - 3
                                : hl.rect.x + hl.rect.width / 2;
                              const cy = isOutline
                                ? hl.rect.y + 7
                                : hl.rect.y + hl.rect.height / 2;
                              const showTag =
                                Boolean(hl.label) && hl.rect.width >= 16 && hl.rect.height >= 7;
                              return (
                                <g key={idx}>
                                  <rect
                                    x={hl.rect.x}
                                    y={hl.rect.y}
                                    width={hl.rect.width}
                                    height={hl.rect.height}
                                    fill={fillValue}
                                    stroke={strokeColor}
                                    strokeWidth={isErr ? '1.3' : '1.0'}
                                    strokeDasharray={isErr ? undefined : '4 2'}
                                    data-testid="preflight-highlight-rect"
                                  />
                                  {showTag && (
                                    <g>
                                      <rect
                                        x={cx - pillW / 2}
                                        y={cy - 4.2}
                                        width={pillW}
                                        height={8.4}
                                        rx={2}
                                        fill={isErr ? '#991b1b' : '#9a3412'}
                                        fillOpacity="0.92"
                                      />
                                      <text
                                        x={cx}
                                        y={cy + 0.4}
                                        fill="#fff7ed"
                                        fontSize="4.8"
                                        fontWeight="700"
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                      >
                                        {hl.label}
                                      </text>
                                    </g>
                                  )}
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                    </g>
                  )}

                <LayerSelectionOverlay
                  canvasBounds={canvasBounds}
                  activeSnapGuides={activeSnapGuides}
                  selectedLayer={selectedLayer}
                  clipBoundaryRect={
                    selectedLayer && selectedLayer.clipZone !== 'none'
                      ? resolveZoneClipRect(spec, selectedLayer.clipZone)
                      : null
                  }
                  hideSelection={Boolean(eyedropperTarget)}
                  handleCornerSizeMm={handleCornerSize}
                  onStartResize={startResizeDrag}
                />
              </svg>
            </div>
          ) : viewMode === 'blueprint' ? (
            <OuterBlueprintCanvas
              geometry={geometry}
              splitMode={effectiveParams.splitMode}
              unit={effectiveParams.unit}
              zoom={blueprintZoom}
              onAdjustZoom={adjustBlueprintZoom}
              pan={blueprintPan}
              onPanChange={setBlueprintPan}
            />
          ) : (
            <div className="h-full w-full pb-12">
              <Book3DPreview
                geometry={geometry}
                studio={studio}
                customFont={customFont}
                angle={book3DAngle}
                isCoverOpen={book3DCoverOpen}
                onAngleChange={setBook3DAngle}
              />
            </div>
          )}

          {/* Floating Bottom-Center HUD Pill Toolbar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3.5 z-20 flex justify-center px-3">
            <FloatingHudToolbar
              label="Cover preview view and overlay controls"
              controlsId="studio-mat-viewport"
              className="pointer-events-auto max-w-full overflow-x-auto"
              testId="studio-hud-toolbar"
            >
              <HudGroup label="Preview mode">
                <HudButton
                  pressed={viewMode === '2d'}
                  onClick={() => setViewMode('2d')}
                  data-testid="studio-view-2d-btn"
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  Styled Cover
                </HudButton>
                <HudButton
                  pressed={viewMode === 'blueprint'}
                  onClick={() => {
                    setEyedropperTarget(null);
                    setViewMode('blueprint');
                  }}
                  data-testid="studio-view-blueprint-btn"
                >
                  <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                  Blueprint
                </HudButton>
                <HudButton
                  pressed={viewMode === '3d'}
                  onClick={() => {
                    setEyedropperTarget(null);
                    setViewMode('3d');
                  }}
                  data-testid="studio-view-3d-btn"
                >
                  <Box className="h-3.5 w-3.5" aria-hidden="true" />
                  3D Book
                </HudButton>
              </HudGroup>

              <HudSeparator />

              {viewMode === '2d' ? (
                <HudGroup label="Canvas overlays">
                  <HudButton
                    pressed={showGuides}
                    onClick={() => setShowGuides((v) => !v)}
                    data-testid="studio-guides-btn"
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
                    data-testid="studio-snap-btn"
                  >
                    <Magnet className="h-3.5 w-3.5" aria-hidden="true" />
                    Snap
                  </HudButton>
                  <HudButton
                    pressed={showPreflightOverlays}
                    onClick={() => setShowPreflightOverlays((v) => !v)}
                    data-testid="studio-preflight-hud-btn"
                  >
                    {preflight.status === 'pass' ? (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {preflight.status === 'pass'
                      ? 'Preflight OK'
                      : `Preflight (${preflight.errorCount + preflight.warningCount})`}
                  </HudButton>
                </HudGroup>
              ) : viewMode === 'blueprint' ? (
                <HudGroup label="Blueprint zoom">
                  <HudButton
                    aria-label="Zoom out blueprint"
                    title="Zoom out"
                    onClick={() => adjustBlueprintZoom(-0.25)}
                    className="px-2"
                  >
                    <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                  </HudButton>
                  <span className="min-w-11 text-center font-mono text-[11px] text-[#f6efe2]/90">
                    {Math.round(blueprintZoom * 100)}%
                  </span>
                  <HudButton
                    aria-label="Zoom in blueprint"
                    title="Zoom in"
                    onClick={() => adjustBlueprintZoom(0.25)}
                    className="px-2"
                  >
                    <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                  </HudButton>
                  <HudButton
                    aria-label="Reset blueprint zoom and pan"
                    title="Reset zoom & pan"
                    onClick={resetBlueprintView}
                    className="px-2"
                  >
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </HudButton>
                </HudGroup>
              ) : (
                <>
                  <HudGroup label="3D camera angles">
                    {BOOK_3D_PRESETS.map((preset) => (
                      <HudButton
                        key={preset.id}
                        pressed={activePreset3D === preset.id}
                        onClick={() => setBook3DAngle(preset.angle)}
                        data-testid={`book3d-preset-${preset.id}`}
                      >
                        {preset.label}
                      </HudButton>
                    ))}
                  </HudGroup>
                  <HudSeparator />
                  <HudGroup label="Book cover state">
                    <HudButton
                      pressed={book3DCoverOpen}
                      onClick={() => {
                        setBook3DCoverOpen((wasOpen) => {
                          const nextOpen = !wasOpen;
                          if (nextOpen) {
                            setBook3DAngle({ yawDeg: -10, pitchDeg: -8 });
                          }
                          return nextOpen;
                        });
                      }}
                      data-testid="book3d-open-cover-btn"
                      title="Swing open the front cover to peek inside at your styled inner pocket"
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      {book3DCoverOpen ? 'Close Cover' : 'Open Cover'}
                    </HudButton>
                  </HudGroup>
                </>
              )}
            </FloatingHudToolbar>
          </div>
        </div>

        {/* Subtle Contextual Hint Footer Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground">
          <span>
            {viewMode === '3d'
              ? 'Drag directly on the hardcover volume (or use Arrow keys) to inspect Front, Spine, and Back proportions.'
              : viewMode === 'blueprint'
                ? 'Solid Red: 45° Miter Cut Line • Dashed Blue: Board Guides • Brass: Hinge Spacers • Green: Bleed.'
                : selectedLayer
                  ? `Selected "${selectedLayer.fileName}" — drag to position, pull corners or scroll wheel to resize, Backspace to remove.`
                  : 'Drop PNG, JPG, or WEBP artwork anywhere onto the cutting mat or click Add Images below.'}
          </span>
          <span className="font-mono text-[11px] text-brass">
            {spec.totalWidthMm.toFixed(1)} × {spec.totalHeightMm.toFixed(1)} mm @ 300 DPI
          </span>
        </div>
      </section>

      {/* Live Print Preflight Consistency Check Panel */}
      <PreflightCard
        report={preflight}
        showOverlays={showPreflightOverlays}
        checkDpi={checkDpi}
        activeIssueId={activeIssueId}
        onToggleOverlays={setShowPreflightOverlays}
        onToggleCheckDpi={(next) => {
          setCheckDpi(next);
          onStatusMessage(next ? '300 DPI print check enabled' : '300 DPI print check paused');
        }}
        onHighlightIssue={setActiveIssueId}
        onApplyQuickFix={handleApplyQuickFix}
        onIgnoreIssue={(issueId) => {
          setIgnoredIssueIds((prev) => {
            const next = new Set(prev);
            next.add(issueId);
            return next;
          });
          setActiveIssueId((prev) => (prev === issueId ? null : prev));
        }}
        onRestoreIgnored={() => {
          setIgnoredIssueIds(new Set());
          onStatusMessage('Restored all ignored preflight warnings');
        }}
      />

      {/* Decoupled Controls Grid */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ArtworkControlsCard
          studio={studio}
          selectedLayerId={selectedLayerId}
          eyedropperTarget={eyedropperTarget}
          extendingStub={extendingStub}
          sampledEdgeHex={sampledEdgeHex}
          onSelectLayer={setSelectedLayerId}
          onAddImageFiles={(files) => void handleAddImageFiles(files)}
          onQuickFitLayer={handleQuickFitLayer}
          onExtendLayerStub={(id, mode) => void handleExtendLayerStub(id, mode)}
          onMatchSpineBackToEdge={(hex) => {
            updateStudio({ spineBgColor: hex, backBgColor: hex, frontBgColor: hex });
            onStatusMessage(`Matched spine & back color to cover edge (${hex.toUpperCase()})`);
          }}
          onSetLayerClip={(id, clipZone: LayerClipZone) =>
            updateLayer(id, (layer) => ({ ...layer, clipZone }))
          }
          onScaleLayer={(id, factor) =>
            updateLayer(id, (layer) => CoverImageLayerModel.scaleAroundCenter(layer, factor))
          }
          onReorderLayer={(id, direction) =>
            onChange({
              ...studio,
              layers: CoverImageLayerModel.reorder(studio.layers, id, direction),
            })
          }
          onDeleteLayer={(id) => {
            const remaining = studio.layers.filter((l) => l.id !== id);
            onChange({ ...studio, layers: remaining });
            if (selectedLayerId === id) {
              setSelectedLayerId(remaining[remaining.length - 1]?.id ?? null);
            }
          }}
          onUpdateStudio={updateStudio}
          onToggleEyedropper={(target) => {
            setViewMode('2d');
            setEyedropperTarget((prev) => (prev === target ? null : target));
          }}
        />

        <SpineTypographyCard
          spineText={studio.spineText}
          maxFontSizePt={maxFontSizePt}
          effectiveFontSizePt={effectiveFontSizePt}
          customFont={customFont}
          onUpdateSpineText={updateSpineText}
          onCustomFontSelected={(file) => void handleCustomFontUpload(file)}
        />
      </div>
    </div>
  );
}
