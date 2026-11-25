import {
  ArrowDown,
  ArrowUp,
  Expand,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Minus,
  Pipette,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef } from 'react';
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
import { Separator } from '@/components/ui/separator';
import type { CoverStudioState, CutLineExportMode } from '@/types/studio';
import {
  getLayerVisualRect,
  nextQuarterTurn,
  normalizeQuarterTurn,
  type CoverImageLayer,
  type LayerClipZone,
  type QuickFitTarget,
  type StubExtensionMode,
} from '@/types/studioLayer';
import { roundTo } from '@/types/units';

export type EyedropperTarget = 'spine' | 'back' | 'both' | null;

export interface ArtworkControlsCardProps {
  readonly studio: CoverStudioState;
  readonly selectedLayerId: string | null;
  readonly eyedropperTarget: EyedropperTarget;
  readonly extendingStub?: boolean;
  readonly sampledEdgeHex?: string | null;
  readonly onSelectLayer: (id: string | null) => void;
  readonly onAddImageFiles: (files: readonly File[]) => void;
  readonly onQuickFitLayer: (id: string, target: QuickFitTarget) => void;
  readonly onExtendLayerStub?: (id: string, mode: StubExtensionMode) => void;
  readonly onMatchSpineBackToEdge?: (hex: string) => void;
  readonly onSetLayerClip: (id: string, clipZone: LayerClipZone) => void;
  readonly onScaleLayer: (id: string, factor: number) => void;
  readonly onToggleLayerFlip?: (id: string, axis: 'x' | 'y') => void;
  readonly onUpdateLayer?: (id: string, patch: Partial<CoverImageLayer>) => void;
  readonly onReorderLayer: (id: string, direction: 'forward' | 'backward') => void;
  readonly onDeleteLayer: (id: string) => void;
  readonly onUpdateStudio: (patch: Partial<CoverStudioState>) => void;
  readonly onToggleEyedropper: (target: Exclude<EyedropperTarget, null>) => void;
}

const STUB_EXTENSION_MODES: readonly {
  readonly id: StubExtensionMode;
  readonly label: string;
  readonly title: string;
}[] = [
  { id: 'none', label: 'Off', title: 'Keep original unextended image on board' },
  {
    id: 'edge-smear',
    label: 'Edge Smear',
    title: 'Stretch outer edge colors/gradients smoothly across the 18 mm turn-in + bleed (no mirrored text)',
  },
  {
    id: 'soft-mirror',
    label: 'Soft Mirror',
    title: 'Reflect artwork edges across the turn-in + bleed with subtle feathering for paintings/textures',
  },
  {
    id: 'mirror',
    label: 'Mirror',
    title: 'Crisp gallery-wrap reflection across the turn-in + bleed',
  },
];

const QUICK_FIT_OPTIONS: readonly { readonly id: QuickFitTarget; readonly label: string }[] = [
  { id: 'front', label: 'Fit Front' },
  { id: 'spine', label: 'Fit Spine' },
  { id: 'back', label: 'Fit Back' },
  { id: 'fullWrap', label: 'Full Wrap' },
];

export function ArtworkControlsCard({
  studio,
  selectedLayerId,
  eyedropperTarget,
  extendingStub = false,
  sampledEdgeHex = null,
  onSelectLayer,
  onAddImageFiles,
  onQuickFitLayer,
  onExtendLayerStub,
  onMatchSpineBackToEdge,
  onSetLayerClip,
  onScaleLayer,
  onToggleLayerFlip,
  onUpdateLayer,
  onReorderLayer,
  onDeleteLayer,
  onUpdateStudio,
  onToggleEyedropper,
}: ArtworkControlsCardProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const selectedLayer: CoverImageLayer | null =
    studio.layers.find((l) => l.id === selectedLayerId) ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 font-serif text-base">
            <ImagePlus className="h-4 w-4 text-primary" aria-hidden="true" />
            Artwork Layers &amp; Color Fill
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[11px]" data-testid="layer-count-badge">
            {studio.layers.length} {studio.layers.length === 1 ? 'image' : 'images'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Upload / Add Images */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => imageInputRef.current?.click()}
            data-testid="studio-upload-image-btn"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Add Images
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Upload as many as you like &amp; drag freely on the book
          </span>
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="visually-hidden"
            aria-label="Add cover artwork images"
            data-testid="studio-upload-image-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) {
                onAddImageFiles(files);
                e.target.value = '';
              }
            }}
          />
        </div>

        {/* Layer Stack List (top-most layer shown first) */}
        {studio.layers.length > 0 && (
          <ul
            aria-label="Uploaded artwork layers"
            data-testid="studio-layer-list"
            className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border bg-secondary/25 p-1.5"
          >
            {[...studio.layers].reverse().map((layer, revIdx) => {
              const actualIdx = studio.layers.length - 1 - revIdx;
              const isSelected = layer.id === selectedLayerId;
              return (
                <li
                  key={layer.id}
                  className={`flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-xs transition-colors ${
                    isSelected
                      ? 'bg-primary/12 text-foreground ring-1 ring-primary/40'
                      : 'hover:bg-accent/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectLayer(layer.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                    data-testid={`layer-select-${actualIdx}`}
                  >
                    <img
                      src={layer.dataUrl}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-xs border border-border object-cover"
                    />
                    <span className="truncate font-medium">{layer.fileName}</span>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={actualIdx === studio.layers.length - 1}
                      aria-label={`Bring ${layer.fileName} forward`}
                      onClick={() => onReorderLayer(layer.id, 'forward')}
                    >
                      <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={actualIdx === 0}
                      aria-label={`Send ${layer.fileName} backward`}
                      onClick={() => onReorderLayer(layer.id, 'backward')}
                    >
                      <ArrowDown className="h-3 w-3" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      aria-label={`Remove ${layer.fileName}`}
                      data-testid={`layer-delete-${actualIdx}`}
                      onClick={() => onDeleteLayer(layer.id)}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Selected Image Quick-Fit, Clip Mask & Scale Controls */}
        {selectedLayer && (() => {
          const selectedVisualRect = getLayerVisualRect(selectedLayer);
          const selectedRotationDeg = normalizeQuarterTurn(selectedLayer.rotationDeg);
          return (
          <div
            className="space-y-2.5 rounded-md border border-primary/30 bg-primary/5 p-2.5"
            data-testid="selected-layer-controls"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-semibold text-foreground">
                Selected: {selectedLayer.fileName}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {roundTo(selectedVisualRect.width, 1)} × {roundTo(selectedVisualRect.height, 1)} mm
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_FIT_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  data-testid={`quick-fit-${opt.id}`}
                  onClick={() => onQuickFitLayer(selectedLayer.id, opt.id)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="layer-clip-select">Clip Mask</Label>
                <Select
                  value={selectedLayer.clipZone}
                  onValueChange={(val) =>
                    onSetLayerClip(selectedLayer.id, val as LayerClipZone)
                  }
                >
                  <SelectTrigger id="layer-clip-select" data-testid="layer-clip-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Free across entire wrap)</SelectItem>
                    <SelectItem value="front">Clip to Front Cover</SelectItem>
                    <SelectItem value="spine">Clip to Spine &amp; Hinges</SelectItem>
                    <SelectItem value="back">Clip to Back Cover</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {onToggleLayerFlip && (
                  <>
                    <Button
                      type="button"
                      variant={selectedLayer.flipX ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 px-2 text-xs"
                      aria-label="Flip selected image horizontally"
                      aria-pressed={Boolean(selectedLayer.flipX)}
                      title="Flip image horizontally"
                      data-testid="layer-flip-h-btn"
                      onClick={() => onToggleLayerFlip(selectedLayer.id, 'x')}
                    >
                      <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Flip H
                    </Button>
                    <Button
                      type="button"
                      variant={selectedLayer.flipY ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 px-2 text-xs"
                      aria-label="Flip selected image vertically"
                      aria-pressed={Boolean(selectedLayer.flipY)}
                      title="Flip image vertically"
                      data-testid="layer-flip-v-btn"
                      onClick={() => onToggleLayerFlip(selectedLayer.id, 'y')}
                    >
                      <FlipVertical2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Flip V
                    </Button>
                  </>
                )}
                {onUpdateLayer && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    aria-label="Rotate selected image 90° clockwise"
                    title="Rotate 90° clockwise"
                    data-rotation={selectedRotationDeg}
                    data-testid="layer-rotate-90-btn"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, {
                        rotationDeg: nextQuarterTurn(selectedLayer.rotationDeg),
                      })
                    }
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    90°
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Scale selected image down"
                  data-testid="layer-scale-down-btn"
                  onClick={() => onScaleLayer(selectedLayer.id, 0.9)}
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Scale selected image up"
                  data-testid="layer-scale-up-btn"
                  onClick={() => onScaleLayer(selectedLayer.id, 1.1)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* Non-Destructive Turn-In / Pasting Stub Edge Extension */}
            {onExtendLayerStub && (
              <div className="kettle-stitch-divider space-y-2 pt-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                    <Expand className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
                    Extend to Pasting Stub (Turn-In &amp; Bleed)
                  </span>
                  {selectedLayer.stubExtensionMode && selectedLayer.stubExtensionMode !== 'none' && (
                    <Badge variant="brass" className="font-mono text-[10px]">
                      {selectedLayer.stubExtensionMode}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Keeps a front-only cover uncropped on the board and extends its outer edges across
                  the folded turn-in stub &amp; bleed.
                </p>
                <div
                  role="group"
                  aria-label="Pasting stub edge extension mode"
                  className="grid grid-cols-4 gap-1"
                >
                  {STUB_EXTENSION_MODES.map((opt) => {
                    const active = (selectedLayer.stubExtensionMode ?? 'none') === opt.id;
                    return (
                      <Button
                        key={opt.id}
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-1.5 text-[11px]"
                        disabled={extendingStub}
                        aria-pressed={active}
                        title={opt.title}
                        data-testid={`stub-extend-${opt.id}`}
                        onClick={() => onExtendLayerStub(selectedLayer.id, opt.id)}
                      >
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
                {sampledEdgeHex && onMatchSpineBackToEdge && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full justify-center gap-1.5 text-xs"
                    data-testid="match-spine-back-edge-btn"
                    onClick={() => onMatchSpineBackToEdge(sampledEdgeHex)}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
                    <span
                      className="h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: sampledEdgeHex }}
                      aria-hidden="true"
                    />
                    Match Spine &amp; Back to Cover Edge ({sampledEdgeHex.toUpperCase()})
                  </Button>
                )}
              </div>
            )}
          </div>
          );
        })()}

        <Separator />

        {/* Zone Background Color Pickers + Eyedropper */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Base Background Colors
            </span>
            <Button
              variant={eyedropperTarget === 'both' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onToggleEyedropper('both')}
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
                onColor: (backBgColor: string) => onUpdateStudio({ backBgColor }),
              },
              {
                id: 'spine-color',
                label: 'Spine & Hinges',
                value: studio.spineBgColor,
                testId: 'studio-spine-color-input',
                onColor: (spineBgColor: string) => onUpdateStudio({ spineBgColor }),
              },
              {
                id: 'front-color',
                label: 'Front Base',
                value: studio.frontBgColor,
                testId: 'studio-front-color-input',
                onColor: (frontBgColor: string) => onUpdateStudio({ frontBgColor }),
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

        {/* Print Cut Outline Export Mode */}
        <div className="space-y-1.5">
          <Label htmlFor="cut-line-export-mode">Print-Ready PDF Cut Outline</Label>
          <Select
            value={studio.cutLineMode}
            onValueChange={(val) => onUpdateStudio({ cutLineMode: val as CutLineExportMode })}
          >
            <SelectTrigger id="cut-line-export-mode" data-testid="studio-cut-mode-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full-cut-miter">
                Cut Lines On (Red outer trim outline)
              </SelectItem>
              <SelectItem value="bleed-registration">
                Crop Marks Only (Outer corner marks in bleed)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
