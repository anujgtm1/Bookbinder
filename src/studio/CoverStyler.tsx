import {
  Download,
  FileCode2,
  FileImage,
  FileText,
  ImagePlus,
  Pipette,
  RotateCcw,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
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
  type CoverStudioState,
  type CutLineExportMode,
  type SpineLayoutPreset,
  type SpineOrientation,
  type StudioFontId,
} from '@/types/studio';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import {
  CURATED_FONTS,
  loadCustomFontFromFile,
  resolveFontCssFamily,
  type CustomFontAsset,
} from './fonts';
import {
  computeImageDrawRect,
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

type EyedropperTarget = 'spine' | 'back' | 'both' | null;

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
  const [customFont, setCustomFont] = useState<CustomFontAsset | null>(null);
  const [eyedropperTarget, setEyedropperTarget] = useState<EyedropperTarget>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportingKind, setExportingKind] = useState<'pdf' | 'png' | 'svg' | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    active: boolean;
    startClientX: number;
    startClientY: number;
    origOffsetX: number;
    origOffsetY: number;
    mmPerPx: number;
  }>({
    active: false,
    startClientX: 0,
    startClientY: 0,
    origOffsetX: 0,
    origOffsetY: 0,
    mmPerPx: 1,
  });

  const spec = useMemo(() => computeStudioCanvasSpec(geometry, PRINT_DPI), [geometry]);
  const targetZone = studio.imageMode === 'full-wrap' ? spec.fullWrapRect : spec.frontZoneRect;
  const imageDrawRect = useMemo(
    () => computeImageDrawRect(targetZone, studio.image),
    [targetZone, studio.image],
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

  const shiftedCutPolygon = useMemo(
    () =>
      GeometryPrimitives.translatePolygon(
        geometry.outerWrap.outerCutPolygon,
        spec.bleedMm,
        spec.bleedMm,
      ),
    [geometry.outerWrap.outerCutPolygon, spec.bleedMm],
  );

  const updateStudio = (patch: Partial<CoverStudioState>) => {
    onChange({ ...studio, ...patch });
  };

  const updateSpineText = (patch: Partial<CoverStudioState['spineText']>) => {
    onChange({
      ...studio,
      spineText: { ...studio.spineText, ...patch },
    });
  };

  const updateImage = (patch: Partial<CoverStudioState['image']>) => {
    onChange({
      ...studio,
      image: { ...studio.image, ...patch },
    });
  };

  const handleImageUpload = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      onStatusMessage('Please upload a PNG, JPG, or WEBP cover image.');
      return;
    }
    try {
      const decoded = await readImageFile(file);
      onChange({
        ...studio,
        image: {
          dataUrl: decoded.dataUrl,
          fileName: file.name,
          naturalWidth: decoded.width,
          naturalHeight: decoded.height,
          zoom: 1.0,
          offsetXMm: 0,
          offsetYMm: 0,
        },
      });
      onStatusMessage(`Loaded cover image "${file.name}" (${decoded.width}×${decoded.height}px)`);
    } catch (err) {
      onStatusMessage(err instanceof Error ? err.message : 'Failed to load cover image.');
    }
  };

  const handleCustomFontUpload = async (file: File) => {
    try {
      const asset = await loadCustomFontFromFile(file);
      setCustomFont(asset);
      updateSpineText({
        fontId: 'custom',
        customFontName: asset.fileName,
      });
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
    const svgEl = svgRef.current;
    if (!svgEl) return;

    let relX: number;
    let relY: number;
    const ctm = typeof svgEl.getScreenCTM === 'function' ? svgEl.getScreenCTM() : null;
    if (ctm && typeof DOMPoint !== 'undefined') {
      const svgPt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      relX = svgPt.x / spec.totalWidthMm;
      relY = svgPt.y / spec.totalHeightMm;
    } else {
      const rect = svgEl.getBoundingClientRect();
      relX = (clientX - rect.left) / Math.max(1, rect.width);
      relY = (clientY - rect.top) / Math.max(1, rect.height);
    }

    try {
      const sampleCanvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
        includeSpineText: false,
        dpi: 72,
      });
      const px = Math.min(
        sampleCanvas.width - 1,
        Math.max(0, Math.floor(relX * sampleCanvas.width)),
      );
      const py = Math.min(
        sampleCanvas.height - 1,
        Math.max(0, Math.floor(relY * sampleCanvas.height)),
      );
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
      if (studio.image.dataUrl) {
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
                Drop cover artwork onto the canvas, drag to pan, scroll to zoom, and export at exact
                1:1 mm / 300 DPI ({spec.pixelWidth} × {spec.pixelHeight} px).
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
                  {studio.image.fileName
                    ? `Artwork: ${studio.image.fileName} — drag canvas to pan`
                    : 'Drop a PNG, JPG, or WEBP onto the canvas or upload below'}
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

          {/* Interactive 1:1 Proportional Drop + Pan/Zoom + Eyedropper Surface */}
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
              if (file) void handleImageUpload(file);
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
                  : studio.image.dataUrl
                    ? 'cursor-grab active:cursor-grabbing'
                    : 'cursor-default'
              }`}
              style={{ touchAction: 'none' }}
              onClick={(e) => {
                if (eyedropperTarget) {
                  void sampleColorAtSvgClick(e.clientX, e.clientY, eyedropperTarget);
                }
              }}
              onWheel={(e) => {
                if (!studio.image.dataUrl) return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.1 : -0.1;
                const nextZoom = roundTo(
                  Math.min(
                    STUDIO_BOUNDS.zoom.max,
                    Math.max(STUDIO_BOUNDS.zoom.min, studio.image.zoom + delta),
                  ),
                  2,
                );
                updateImage({ zoom: nextZoom });
              }}
              onPointerDown={(e) => {
                if (eyedropperTarget || !studio.image.dataUrl) return;
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.setPointerCapture(e.pointerId);
                dragRef.current = {
                  active: true,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  origOffsetX: studio.image.offsetXMm,
                  origOffsetY: studio.image.offsetYMm,
                  mmPerPx: spec.totalWidthMm / Math.max(1, rect.width),
                };
              }}
              onPointerMove={(e) => {
                if (!dragRef.current.active) return;
                const dxMm = (e.clientX - dragRef.current.startClientX) * dragRef.current.mmPerPx;
                const dyMm = (e.clientY - dragRef.current.startClientY) * dragRef.current.mmPerPx;
                updateImage({
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
                <clipPath id="studio-image-zone-clip">
                  <rect
                    x={targetZone.x}
                    y={targetZone.y}
                    width={targetZone.width}
                    height={targetZone.height}
                  />
                </clipPath>
              </defs>

              {/* Background Zone Fills */}
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

              {/* Uploaded Artwork Image */}
              {studio.image.dataUrl && imageDrawRect && (
                <g clipPath="url(#studio-image-zone-clip)">
                  <image
                    href={studio.image.dataUrl}
                    x={imageDrawRect.x}
                    y={imageDrawRect.y}
                    width={imageDrawRect.width}
                    height={imageDrawRect.height}
                    preserveAspectRatio="none"
                    data-testid="studio-cover-image"
                  />
                </g>
              )}

              {/* Spine Vector Typography Preview */}
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

              {/* Fold, Board & Cut Guides Overlay */}
              {showGuides && (
                <g pointerEvents="none">
                  <path
                    d={GeometryPrimitives.polygonToSvgPath(shiftedCutPolygon, 2)}
                    fill="none"
                    stroke="#FF3B30"
                    strokeWidth="0.9"
                    strokeDasharray={studio.cutLineMode === 'bleed-registration' ? '4 2.5' : undefined}
                  />
                  {[
                    geometry.outerWrap.backBoardRect,
                    geometry.outerWrap.spineRect,
                    geometry.outerWrap.frontBoardRect,
                  ].map((r, i) => (
                    <rect
                      key={i}
                      x={r.x + spec.bleedMm}
                      y={r.y + spec.bleedMm}
                      width={r.width}
                      height={r.height}
                      fill="none"
                      stroke="#ffffff"
                      strokeOpacity="0.65"
                      strokeWidth="0.7"
                      strokeDasharray="5 3"
                    />
                  ))}
                  {/* Subtle zone labels when no image is placed */}
                  {!studio.image.dataUrl && (
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
                        fontSize="8"
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
                        fontSize="8"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        DROP FRONT COVER ARTWORK
                      </text>
                    </>
                  )}
                </g>
              )}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Zone-Based Controls Grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Card A: Artwork Placement + Background Fills + Eyedropper */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-serif text-base">
              <ImagePlus className="h-4 w-4 text-primary" aria-hidden="true" />
              Cover Artwork &amp; Color Fill
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => imageInputRef.current?.click()}
                data-testid="studio-upload-image-btn"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Upload Cover Image
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="visually-hidden"
                aria-label="Upload cover artwork image"
                data-testid="studio-upload-image-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleImageUpload(file);
                    e.target.value = '';
                  }
                }}
              />
              {studio.image.dataUrl && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateImage({ zoom: 1, offsetXMm: 0, offsetYMm: 0 })}
                    data-testid="studio-reset-framing-btn"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Center
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() =>
                      updateImage({
                        dataUrl: null,
                        fileName: null,
                        naturalWidth: 0,
                        naturalHeight: 0,
                        zoom: 1,
                        offsetXMm: 0,
                        offsetYMm: 0,
                      })
                    }
                    data-testid="studio-clear-image-btn"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                </>
              )}
            </div>

            {/* Full-Wrap Panoramic Mode Toggle */}
            <div className="flex items-center justify-between rounded-md border border-border bg-secondary/35 p-2.5">
              <div>
                <Label htmlFor="full-wrap-mode-toggle">Full-Wrap Panoramic Mode</Label>
                <p className="text-[11px] text-muted-foreground">
                  Span one wide image across Back + Spine + Front + Turn-ins
                </p>
              </div>
              <Switch
                id="full-wrap-mode-toggle"
                data-testid="studio-full-wrap-toggle"
                checked={studio.imageMode === 'full-wrap'}
                onCheckedChange={(checked) =>
                  updateStudio({ imageMode: checked ? 'full-wrap' : 'front-cover' })
                }
              />
            </div>

            {/* Image Zoom Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="studio-image-zoom">Artwork Zoom</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {Math.round(studio.image.zoom * 100)}%
                </span>
              </div>
              <Slider
                id="studio-image-zoom"
                aria-label="Cover artwork zoom"
                disabled={!studio.image.dataUrl}
                min={STUDIO_BOUNDS.zoom.min}
                max={STUDIO_BOUNDS.zoom.max}
                step={0.05}
                value={[studio.image.zoom]}
                onValueChange={([zoom]) => updateImage({ zoom })}
              />
            </div>

            <Separator />

            {/* Zone Background Color Pickers + Eyedropper */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Zone Background Colors
                </span>
                <Button
                  variant={eyedropperTarget === 'both' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() =>
                    setEyedropperTarget((prev) => (prev === 'both' ? null : 'both'))
                  }
                  data-testid="studio-eyedropper-both-btn"
                >
                  <Pipette className="h-3.5 w-3.5" aria-hidden="true" />
                  {eyedropperTarget === 'both' ? 'Cancel Sample' : 'Eyedropper (Spine + Back)'}
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'back-color',
                    label: 'Back Cover',
                    value: studio.backBgColor,
                    testId: 'studio-back-color-input',
                    onColor: (backBgColor: string) => updateStudio({ backBgColor }),
                    sampleTarget: 'back' as const,
                  },
                  {
                    id: 'spine-color',
                    label: 'Spine & Hinges',
                    value: studio.spineBgColor,
                    testId: 'studio-spine-color-input',
                    onColor: (spineBgColor: string) => updateStudio({ spineBgColor }),
                    sampleTarget: 'spine' as const,
                  },
                  {
                    id: 'front-color',
                    label: 'Front Base',
                    value: studio.frontBgColor,
                    testId: 'studio-front-color-input',
                    onColor: (frontBgColor: string) => updateStudio({ frontBgColor }),
                    sampleTarget: null,
                  },
                ].map((swatch) => (
                  <div key={swatch.id} className="space-y-1">
                    <Label htmlFor={swatch.id}>{swatch.label}</Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id={swatch.id}
                        data-testid={swatch.testId}
                        type="color"
                        value={swatch.value}
                        onChange={(e) => swatch.onColor(e.target.value)}
                        className="h-8 w-10 cursor-pointer rounded border border-input bg-card p-0.5"
                      />
                      <span className="font-mono text-[11px] uppercase text-muted-foreground">
                        {swatch.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Print Cut-Line Export Toggle */}
            <div className="space-y-1.5">
              <Label htmlFor="cut-line-export-mode">Print-Ready PDF Cut Guides</Label>
              <Select
                value={studio.cutLineMode}
                onValueChange={(val) => updateStudio({ cutLineMode: val as CutLineExportMode })}
              >
                <SelectTrigger id="cut-line-export-mode" data-testid="studio-cut-mode-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bleed-registration">
                    Bleed + Outer Corner Registration Marks Only (Recommended)
                  </SelectItem>
                  <SelectItem value="full-cut-miter">
                    Full Cut &amp; 45° Miter Hairline Guides
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Card B: Spine Typography */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 font-serif text-base">
                <Type className="h-4 w-4 text-primary" aria-hidden="true" />
                Spine Typography
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[11px]" data-testid="spine-max-pt-badge">
                Auto-clamped ≤ {maxFontSizePt} pt
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="spine-title-input">Spine Title</Label>
                <Input
                  id="spine-title-input"
                  data-testid="studio-spine-title-input"
                  placeholder="e.g. Dune"
                  value={studio.spineText.title}
                  onChange={(e) => updateSpineText({ title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="spine-author-input">Spine Author</Label>
                <Input
                  id="spine-author-input"
                  data-testid="studio-spine-author-input"
                  placeholder="e.g. Frank Herbert"
                  value={studio.spineText.author}
                  onChange={(e) => updateSpineText({ author: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="spine-layout-select">Layout Preset</Label>
                <Select
                  value={studio.spineText.layout}
                  onValueChange={(val) => updateSpineText({ layout: val as SpineLayoutPreset })}
                >
                  <SelectTrigger id="spine-layout-select" data-testid="studio-spine-layout-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inline">Inline (Title — Author)</SelectItem>
                    <SelectItem value="stacked">Stacked (Title + Bottom Author)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="spine-orientation-select">Reading Orientation</Label>
                <Select
                  value={studio.spineText.orientation}
                  onValueChange={(val) =>
                    updateSpineText({ orientation: val as SpineOrientation })
                  }
                >
                  <SelectTrigger
                    id="spine-orientation-select"
                    data-testid="studio-spine-orientation-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top-to-bottom">Top-to-Bottom (US/UK)</SelectItem>
                    <SelectItem value="bottom-to-top">Bottom-to-Top (European)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Font Selector + Custom Font Uploader */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="spine-font-select">Spine Typeface</Label>
                <Select
                  value={studio.spineText.fontId}
                  onValueChange={(val) => updateSpineText({ fontId: val as StudioFontId })}
                >
                  <SelectTrigger id="spine-font-select" data-testid="studio-font-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURATED_FONTS.map((font) => (
                      <SelectItem key={font.id} value={font.id}>
                        {font.label} ({font.category})
                      </SelectItem>
                    ))}
                    {customFont && (
                      <SelectItem value="custom">Custom: {customFont.fileName}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fontInputRef.current?.click()}
                  data-testid="studio-upload-font-btn"
                >
                  <Download className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
                  Custom Font
                </Button>
                <input
                  ref={fontInputRef}
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  className="visually-hidden"
                  aria-label="Upload custom font file"
                  data-testid="studio-upload-font-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleCustomFontUpload(file);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>

            {/* Font Size + Text Color */}
            <div className="grid grid-cols-[1fr_auto] items-center gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="spine-font-size">Font Size</Label>
                  <span className="font-mono text-xs text-foreground" data-testid="spine-font-size-readout">
                    {effectiveFontSizePt} pt
                  </span>
                </div>
                <Slider
                  id="spine-font-size"
                  aria-label="Spine font size in points"
                  min={STUDIO_BOUNDS.fontSizePt.min}
                  max={maxFontSizePt}
                  step={0.5}
                  value={[effectiveFontSizePt]}
                  onValueChange={([fontSizePt]) => updateSpineText({ fontSizePt })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="spine-text-color">Ink Color</Label>
                <input
                  id="spine-text-color"
                  data-testid="studio-spine-text-color"
                  type="color"
                  value={studio.spineText.textColor}
                  onChange={(e) => updateSpineText({ textColor: e.target.value })}
                  className="block h-8 w-11 cursor-pointer rounded border border-input bg-card p-0.5"
                />
              </div>
            </div>

            {/* Optical Horizontal Nudge Slider (±2.0 mm) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="spine-optical-nudge">Optical Horizontal Nudge</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {studio.spineText.opticalNudgeMm >= 0 ? '+' : ''}
                  {studio.spineText.opticalNudgeMm.toFixed(1)} mm
                </span>
              </div>
              <Slider
                id="spine-optical-nudge"
                aria-label="Optical horizontal nudge in millimeters"
                min={STUDIO_BOUNDS.opticalNudgeMm.min}
                max={STUDIO_BOUNDS.opticalNudgeMm.max}
                step={0.1}
                value={[studio.spineText.opticalNudgeMm]}
                onValueChange={([opticalNudgeMm]) => updateSpineText({ opticalNudgeMm })}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
