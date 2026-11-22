import { FileCode2, FileImage, FileText, Pipette } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  triggerBlobDownload,
  triggerBytesDownload,
  triggerTextDownload,
} from '@/core/storage';
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
  type ResizeCorner,
} from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter } from '@/types/units';
import { ArtworkControlsCard, type EyedropperTarget } from './ArtworkControlsCard';
import { SpineTypographyCard } from './SpineTypographyCard';
import {
  loadCustomFontFromFile,
  resolveFontCssFamily,
  type CustomFontAsset,
} from './fonts';
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

export interface CoverStylerProps {
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly onChange: (next: CoverStudioState) => void;
  readonly onStatusMessage: (message: string) => void;
}

type DragInteraction =
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

const CORNER_CURSORS: Readonly<Record<ResizeCorner, string>> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
};

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
      .join('')
  );
}

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

export function CoverStyler({
  geometry,
  studio,
  onChange,
  onStatusMessage,
}: CoverStylerProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    () => studio.layers[studio.layers.length - 1]?.id ?? null,
  );
  const [customFont, setCustomFont] = useState<CustomFontAsset | null>(null);
  const [eyedropperTarget, setEyedropperTarget] = useState<EyedropperTarget>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportingKind, setExportingKind] = useState<'pdf' | 'png' | 'svg' | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragInteraction>({ mode: 'none' });
  const suppressNextClickRef = useRef(false);
  const studioRef = useRef(studio);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    studioRef.current = studio;
    onChangeRef.current = onChange;
  }, [studio, onChange]);

  const spec = useMemo(() => computeStudioCanvasSpec(geometry, PRINT_DPI), [geometry]);
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

  // Window-level pointer move/up so dragging or corner-resizing keeps tracking smoothly even outside the SVG
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag.mode === 'none') return;
      const svgEl = svgRef.current;
      if (!svgEl) return;

      let xMm: number;
      let yMm: number;
      const ctm = typeof svgEl.getScreenCTM === 'function' ? svgEl.getScreenCTM() : null;
      if (ctm && typeof DOMPoint !== 'undefined') {
        const svgPt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
        xMm = svgPt.x;
        yMm = svgPt.y;
      } else {
        const rect = svgEl.getBoundingClientRect();
        xMm = ((e.clientX - rect.left) / Math.max(1, rect.width)) * spec.totalWidthMm;
        yMm = ((e.clientY - rect.top) / Math.max(1, rect.height)) * spec.totalHeightMm;
      }

      suppressNextClickRef.current = true;
      const currentStudio = studioRef.current;
      const nextLayers = currentStudio.layers.map((layer) => {
        if (layer.id !== drag.layerId) return layer;
        if (drag.mode === 'move') {
          return CoverImageLayerModel.moveBy(
            drag.origLayer,
            xMm - drag.startXMm,
            yMm - drag.startYMm,
          );
        }
        return CoverImageLayerModel.resizeFromCorner(drag.origLayer, drag.corner, xMm, yMm);
      });
      onChangeRef.current({ ...currentStudio, layers: nextLayers });
    };

    const onPointerEnd = () => {
      dragRef.current = { mode: 'none' };
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [spec.totalWidthMm, spec.totalHeightMm]);

  // Delete selected layer via Backspace/Delete key when focus is not inside a text control
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedLayerId) return;
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
      const remaining = studio.layers.filter((l) => l.id !== selectedLayerId);
      onChange({ ...studio, layers: remaining });
      setSelectedLayerId(remaining[remaining.length - 1]?.id ?? null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedLayerId, studio, onChange]);

  const clientPointToSvgMm = (
    clientX: number,
    clientY: number,
  ): { xMm: number; yMm: number } | null => {
    const svgEl = svgRef.current;
    if (!svgEl) return null;
    const ctm = typeof svgEl.getScreenCTM === 'function' ? svgEl.getScreenCTM() : null;
    if (ctm && typeof DOMPoint !== 'undefined') {
      const svgPt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { xMm: svgPt.x, yMm: svgPt.y };
    }
    const rect = svgEl.getBoundingClientRect();
    return {
      xMm: ((clientX - rect.left) / Math.max(1, rect.width)) * spec.totalWidthMm,
      yMm: ((clientY - rect.top) / Math.max(1, rect.height)) * spec.totalHeightMm,
    };
  };

  const defaultPlacementRectForDrop = (dropPoint?: { xMm: number; yMm: number }): Rect2D => {
    if (dropPoint) {
      if (dropPoint.xMm < spec.spineZoneRect.x) return spec.backZoneRect;
      if (dropPoint.xMm < spec.frontZoneRect.x) return spec.spineZoneRect;
      return spec.frontZoneRect;
    }
    // Smart sequential default when clicking "Add Images": Front -> Back -> Spine -> Center
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
    const validFiles = files.filter(
      (f) => /^image\/(png|jpeg|webp)$/i.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name),
    );
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
    const pt = clientPointToSvgMm(clientX, clientY);
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

  const handleCornerSize = Math.max(7.5, spec.totalWidthMm * 0.022);

  return (
    <div className="flex flex-col gap-5" data-testid="cover-styler">
      {/* Live Interactive Cover Canvas + Export Toolbar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-base">
                Interactive Cover &amp; Spine Canvas
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Drop any number of images onto the book, click to select, drag to move, pull corner
                handles to resize, and export at 1:1 mm / 300 DPI ({spec.pixelWidth} ×{' '}
                {spec.pixelHeight} px).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleExportPrintPdf}
                disabled={exportingKind !== null}
                data-testid="studio-export-pdf-btn"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                {exportingKind === 'pdf' ? 'Rendering PDF…' : 'Print-Ready PDF (300 DPI)'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportAffinityPng}
                disabled={exportingKind !== null}
                data-testid="studio-export-png-btn"
              >
                <FileImage className="h-4 w-4" aria-hidden="true" />
                {exportingKind === 'png' ? 'Rendering PNG…' : 'Affinity PNG (300 DPI)'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportAffinitySvg}
                disabled={exportingKind !== null}
                data-testid="studio-export-svg-btn"
              >
                <FileCode2 className="h-4 w-4" aria-hidden="true" />
                Affinity SVG (1:1 mm)
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {eyedropperTarget ? (
                <Badge variant="warning" data-testid="eyedropper-active-banner">
                  <Pipette className="h-3.5 w-3.5" aria-hidden="true" />
                  Click anywhere on the cover preview to sample color for {eyedropperTarget}
                </Badge>
              ) : (
                <span className="text-muted-foreground">
                  {selectedLayer
                    ? `Selected "${selectedLayer.fileName}" — drag to move, pull corners or scroll to resize`
                    : 'Drop PNG, JPG, or WEBP images anywhere on the book or click Add Images below'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="studio-guides-switch" className="text-xs text-muted-foreground">
                Show Fold &amp; Cut Guides
              </Label>
              <Switch
                id="studio-guides-switch"
                checked={showGuides}
                onCheckedChange={setShowGuides}
              />
            </div>
          </div>

          <div
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
              const dropPt = clientPointToSvgMm(e.clientX, e.clientY) ?? undefined;
              void handleAddImageFiles(files, dropPt);
            }}
            className={`drafting-surface relative flex h-[430px] w-full items-center justify-center overflow-hidden rounded-lg border-2 p-4 transition-colors ${
              isDraggingOver
                ? 'border-primary bg-primary/5'
                : eyedropperTarget
                  ? 'border-amber-500 cursor-crosshair'
                  : 'border-border'
            }`}
          >
            <svg
              ref={svgRef}
              role="img"
              aria-label="Interactive hardcover outer wrap canvas with draggable images and spine typography"
              data-testid="studio-preview-svg"
              viewBox={`0 0 ${spec.totalWidthMm} ${spec.totalHeightMm}`}
              className={`max-h-full max-w-full select-none shadow-md ${
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
                const factor = e.deltaY < 0 ? 1.06 : 0.94;
                updateLayer(selectedLayer.id, (layer) =>
                  CoverImageLayerModel.scaleAroundCenter(layer, factor),
                );
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
                        setSelectedLayerId(layer.id);
                        const pt = clientPointToSvgMm(e.clientX, e.clientY);
                        if (!pt) return;
                        dragRef.current = {
                          mode: 'move',
                          layerId: layer.id,
                          startXMm: pt.xMm,
                          startYMm: pt.yMm,
                          origLayer: layer,
                        };
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
                    stroke="#FF3B30"
                    strokeWidth="0.9"
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
                      strokeOpacity="0.65"
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

              {/* Selection Frame & Corner Resize Handles for Selected Layer */}
              {selectedLayer && !eyedropperTarget && (
                <g data-testid="studio-selection-handles">
                  {selectedLayer.clipZone !== 'none' && (() => {
                    const clipRect = resolveZoneClipRect(spec, selectedLayer.clipZone);
                    return (
                      <rect
                        x={clipRect.x}
                        y={clipRect.y}
                        width={clipRect.width}
                        height={clipRect.height}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="0.8"
                        strokeDasharray="3 2"
                        pointerEvents="none"
                      />
                    );
                  })()}
                  <rect
                    x={selectedLayer.xMm}
                    y={selectedLayer.yMm}
                    width={selectedLayer.widthMm}
                    height={selectedLayer.heightMm}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="1.2"
                    strokeDasharray="4 2"
                    pointerEvents="none"
                  />
                  {(
                    [
                      { corner: 'nw' as const, x: selectedLayer.xMm, y: selectedLayer.yMm },
                      {
                        corner: 'ne' as const,
                        x: selectedLayer.xMm + selectedLayer.widthMm,
                        y: selectedLayer.yMm,
                      },
                      {
                        corner: 'se' as const,
                        x: selectedLayer.xMm + selectedLayer.widthMm,
                        y: selectedLayer.yMm + selectedLayer.heightMm,
                      },
                      {
                        corner: 'sw' as const,
                        x: selectedLayer.xMm,
                        y: selectedLayer.yMm + selectedLayer.heightMm,
                      },
                    ] as const
                  ).map((handle) => (
                    <rect
                      key={handle.corner}
                      x={handle.x - handleCornerSize / 2}
                      y={handle.y - handleCornerSize / 2}
                      width={handleCornerSize}
                      height={handleCornerSize}
                      rx={1}
                      fill="#ffffff"
                      stroke="#24476e"
                      strokeWidth="1"
                      style={{ cursor: CORNER_CURSORS[handle.corner] }}
                      data-testid={`resize-handle-${handle.corner}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragRef.current = {
                          mode: 'resize',
                          layerId: selectedLayer.id,
                          corner: handle.corner,
                          origLayer: selectedLayer,
                        };
                      }}
                    />
                  ))}
                </g>
              )}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Decoupled Controls Grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ArtworkControlsCard
          studio={studio}
          selectedLayerId={selectedLayerId}
          eyedropperTarget={eyedropperTarget}
          onSelectLayer={setSelectedLayerId}
          onAddImageFiles={(files) => void handleAddImageFiles(files)}
          onQuickFitLayer={(id, target: QuickFitTarget) => {
            const targetRect = resolveQuickFitRect(spec, target);
            updateLayer(id, (layer) => CoverImageLayerModel.fitToRect(layer, targetRect));
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
          onToggleEyedropper={(target) =>
            setEyedropperTarget((prev) => (prev === target ? null : target))
          }
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
