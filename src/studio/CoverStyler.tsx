import { FileCode2, FileImage, FileText, Pipette } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
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
import { GeometryPrimitives, type CaseGeometry } from '@/types/geometry';
import {
  CoverStudioModel,
  STUDIO_BOUNDS,
  type CoverImagePlacement,
  type CoverImageSlot,
  type CoverStudioState,
  type CoverZoneId,
  type SpineTypographyConfig,
} from '@/types/studio';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import { ArtworkControlsCard, type EyedropperTarget } from './ArtworkControlsCard';
import { SpineTypographyCard } from './SpineTypographyCard';
import {
  loadCustomFontFromFile,
  resolveFontCssFamily,
  type CustomFontAsset,
} from './fonts';
import {
  computeActiveImageLayers,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  exportCoverPng300Dpi,
  generateAffinityCoverSvg,
  generatePrintReadyRollPdf,
  renderCoverArtworkCanvas,
} from './renderEngine';

export interface CoverStylerProps {
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly onChange: (next: CoverStudioState) => void;
  readonly onStatusMessage: (message: string) => void;
}

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
  const [activeZone, setActiveZone] = useState<CoverZoneId>('front');
  const [customFont, setCustomFont] = useState<CustomFontAsset | null>(null);
  const [eyedropperTarget, setEyedropperTarget] = useState<EyedropperTarget>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportingKind, setExportingKind] = useState<'pdf' | 'png' | 'svg' | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    active: boolean;
    slot: CoverImageSlot;
    startClientX: number;
    startClientY: number;
    origOffsetX: number;
    origOffsetY: number;
    mmPerPx: number;
  }>({
    active: false,
    slot: 'front',
    startClientX: 0,
    startClientY: 0,
    origOffsetX: 0,
    origOffsetY: 0,
    mmPerPx: 1,
  });

  const spec = useMemo(() => computeStudioCanvasSpec(geometry, PRINT_DPI), [geometry]);
  const imageLayers = useMemo(() => computeActiveImageLayers(spec, studio), [spec, studio]);
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
  const activeSlot: CoverImageSlot = studio.imageMode === 'full-wrap' ? 'fullWrap' : activeZone;
  const hasAnyImage = CoverStudioModel.hasAnyActiveImage(studio);

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
  const updateImageSlot = (slot: CoverImageSlot, patch: Partial<CoverImagePlacement>) =>
    onChange({
      ...studio,
      images: {
        ...studio.images,
        [slot]: { ...studio.images[slot], ...patch },
      },
    });

  const clientPointToSvgMm = (clientX: number, clientY: number): { xMm: number; yMm: number } | null => {
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

  const detectZoneAtClientPoint = (clientX: number, clientY: number): CoverZoneId => {
    const pt = clientPointToSvgMm(clientX, clientY);
    if (!pt) return activeZone;
    if (pt.xMm < spec.spineZoneRect.x) return 'back';
    if (pt.xMm < spec.frontZoneRect.x) return 'spine';
    return 'front';
  };

  const handleImageUpload = async (slot: CoverImageSlot, file: File) => {
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      onStatusMessage('Please upload a PNG, JPG, or WEBP cover image.');
      return;
    }
    try {
      const decoded = await readImageFile(file);
      updateImageSlot(slot, {
        dataUrl: decoded.dataUrl,
        fileName: file.name,
        naturalWidth: decoded.width,
        naturalHeight: decoded.height,
        zoom: 1.0,
        offsetXMm: 0,
        offsetYMm: 0,
      });
      if (slot !== 'fullWrap') {
        setActiveZone(slot);
      }
      onStatusMessage(
        `Loaded ${slot === 'fullWrap' ? 'full-wrap' : slot} image "${file.name}" (${decoded.width}×${decoded.height}px)`,
      );
    } catch (err) {
      onStatusMessage(err instanceof Error ? err.message : 'Failed to load cover image.');
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
    if (target === 'spine') {
      updateStudio({ spineBgColor: hex });
    } else if (target === 'back') {
      updateStudio({ backBgColor: hex });
    } else {
      updateStudio({ spineBgColor: hex, backBgColor: hex, frontBgColor: hex });
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
      if (hasAnyImage) {
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

  return (
    <div className="flex flex-col gap-5" data-testid="cover-styler">
      {/* Live Interactive Cover Canvas + Export Toolbar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-base">
                Cover &amp; Spine Compositor
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Drop images directly onto Back, Spine, or Front zones, drag to pan, scroll to zoom,
                and export at exact 1:1 mm / 300 DPI ({spec.pixelWidth} × {spec.pixelHeight} px).
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
                  {hasAnyImage
                    ? 'Drag any zone with artwork to pan • Drop new images onto Back, Spine, or Front'
                    : 'Drop PNG, JPG, or WEBP artwork onto Back, Spine, or Front zones — or upload below'}
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
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              const dropSlot: CoverImageSlot =
                studio.imageMode === 'full-wrap'
                  ? 'fullWrap'
                  : detectZoneAtClientPoint(e.clientX, e.clientY);
              void handleImageUpload(dropSlot, file);
            }}
            className={`drafting-surface relative flex h-[410px] w-full items-center justify-center overflow-hidden rounded-lg border-2 p-4 transition-colors ${
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
              aria-label="Interactive hardcover outer wrap preview with spine typography"
              data-testid="studio-preview-svg"
              viewBox={`0 0 ${spec.totalWidthMm} ${spec.totalHeightMm}`}
              className={`max-h-full max-w-full shadow-md ${
                eyedropperTarget
                  ? 'cursor-crosshair'
                  : hasAnyImage
                    ? 'cursor-grab active:cursor-grabbing'
                    : 'cursor-default'
              }`}
              style={{ touchAction: 'none' }}
              onClick={(e) => {
                if (eyedropperTarget) {
                  void sampleColorAtSvgClick(e.clientX, e.clientY, eyedropperTarget);
                } else if (studio.imageMode === 'per-zone') {
                  setActiveZone(detectZoneAtClientPoint(e.clientX, e.clientY));
                }
              }}
              onWheel={(e) => {
                const targetSlot: CoverImageSlot =
                  studio.imageMode === 'full-wrap'
                    ? 'fullWrap'
                    : detectZoneAtClientPoint(e.clientX, e.clientY);
                const img = studio.images[targetSlot];
                if (!img.dataUrl) return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.1 : -0.1;
                const nextZoom = roundTo(
                  Math.min(
                    STUDIO_BOUNDS.zoom.max,
                    Math.max(STUDIO_BOUNDS.zoom.min, img.zoom + delta),
                  ),
                  2,
                );
                updateImageSlot(targetSlot, { zoom: nextZoom });
              }}
              onPointerDown={(e) => {
                if (eyedropperTarget) return;
                const dragSlot: CoverImageSlot =
                  studio.imageMode === 'full-wrap'
                    ? 'fullWrap'
                    : detectZoneAtClientPoint(e.clientX, e.clientY);
                if (dragSlot !== 'fullWrap') {
                  setActiveZone(dragSlot);
                }
                const img = studio.images[dragSlot];
                if (!img.dataUrl) return;
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.setPointerCapture(e.pointerId);
                dragRef.current = {
                  active: true,
                  slot: dragSlot,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  origOffsetX: img.offsetXMm,
                  origOffsetY: img.offsetYMm,
                  mmPerPx: spec.totalWidthMm / Math.max(1, rect.width),
                };
              }}
              onPointerMove={(e) => {
                if (!dragRef.current.active) return;
                const dxMm = (e.clientX - dragRef.current.startClientX) * dragRef.current.mmPerPx;
                const dyMm = (e.clientY - dragRef.current.startClientY) * dragRef.current.mmPerPx;
                updateImageSlot(dragRef.current.slot, {
                  offsetXMm: roundTo(
                    Math.min(
                      STUDIO_BOUNDS.offsetMm.max,
                      Math.max(STUDIO_BOUNDS.offsetMm.min, dragRef.current.origOffsetX + dxMm),
                    ),
                    1,
                  ),
                  offsetYMm: roundTo(
                    Math.min(
                      STUDIO_BOUNDS.offsetMm.max,
                      Math.max(STUDIO_BOUNDS.offsetMm.min, dragRef.current.origOffsetY + dyMm),
                    ),
                    1,
                  ),
                });
              }}
              onPointerUp={() => {
                dragRef.current.active = false;
              }}
              onPointerCancel={() => {
                dragRef.current.active = false;
              }}
            >
              <title>Outer Cover Styler Preview</title>
              <defs>
                {imageLayers.map((layer) => (
                  <clipPath key={layer.slot} id={`studio-clip-${layer.slot}`}>
                    <rect
                      x={layer.zoneRect.x}
                      y={layer.zoneRect.y}
                      width={layer.zoneRect.width}
                      height={layer.zoneRect.height}
                    />
                  </clipPath>
                ))}
              </defs>

              <rect
                x={spec.backZoneRect.x}
                y={spec.backZoneRect.y}
                width={spec.backZoneRect.width}
                height={spec.backZoneRect.height}
                fill={studio.backBgColor}
                data-testid="studio-back-fill"
              />
              <rect
                x={spec.spineZoneRect.x}
                y={spec.spineZoneRect.y}
                width={spec.spineZoneRect.width}
                height={spec.spineZoneRect.height}
                fill={studio.spineBgColor}
                data-testid="studio-spine-fill"
              />
              <rect
                x={spec.frontZoneRect.x}
                y={spec.frontZoneRect.y}
                width={spec.frontZoneRect.width}
                height={spec.frontZoneRect.height}
                fill={studio.frontBgColor}
                data-testid="studio-front-fill"
              />

              {/* Per-Zone or Full-Wrap Uploaded Artwork Images */}
              {imageLayers.map((layer) => (
                <g key={layer.slot} clipPath={`url(#studio-clip-${layer.slot})`}>
                  <image
                    href={layer.image.dataUrl ?? undefined}
                    x={layer.drawRect.x}
                    y={layer.drawRect.y}
                    width={layer.drawRect.width}
                    height={layer.drawRect.height}
                    preserveAspectRatio="none"
                    data-testid={`studio-image-${layer.slot}`}
                  />
                </g>
              ))}

              <g data-testid="studio-spine-typography">
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
                    { id: 'back' as const, rect: geometry.outerWrap.backBoardRect },
                    { id: 'spine' as const, rect: geometry.outerWrap.spineRect },
                    { id: 'front' as const, rect: geometry.outerWrap.frontBoardRect },
                  ].map(({ id, rect }) => {
                    const isActive = activeSlot === id;
                    return (
                      <rect
                        key={id}
                        x={rect.x + spec.bleedMm}
                        y={rect.y + spec.bleedMm}
                        width={rect.width}
                        height={rect.height}
                        fill="none"
                        stroke={isActive ? '#facc15' : '#ffffff'}
                        strokeOpacity={isActive ? '0.9' : '0.6'}
                        strokeWidth={isActive ? '1.1' : '0.7'}
                        strokeDasharray="5 3"
                      />
                    );
                  })}
                  {studio.imageMode === 'per-zone' && !studio.images.back.dataUrl && (
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
                  )}
                  {studio.imageMode === 'per-zone' && !studio.images.front.dataUrl && (
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
                      FRONT COVER
                    </text>
                  )}
                </g>
              )}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Decoupled Zone-Based Controls Grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ArtworkControlsCard
          studio={studio}
          activeZone={activeZone}
          eyedropperTarget={eyedropperTarget}
          onActiveZoneChange={setActiveZone}
          onUpdateStudio={updateStudio}
          onUpdateImageSlot={updateImageSlot}
          onImageFileSelected={(slot, file) => void handleImageUpload(slot, file)}
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
