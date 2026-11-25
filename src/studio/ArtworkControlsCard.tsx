import {
  ArrowDown,
  ArrowUp,
  Dices,
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
import { useMemo, useRef, useState } from 'react';
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
import {
  PROCEDURAL_ARTWORKS,
  PROCEDURAL_ARTWORK_TARGETS,
  type ProceduralArtworkId,
  type ProceduralArtworkIntensity,
  type ProceduralArtworkTarget,
} from '@/resources/proceduralArtworks';
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
import { generateProceduralArtworkSvg, toProceduralArtworkDataUrl } from './proceduralArtwork';

export type EyedropperTarget = 'spine' | 'back' | 'both' | null;

export interface ApplyProceduralArtworkRequest {
  readonly patternId: ProceduralArtworkId;
  readonly target: ProceduralArtworkTarget;
  readonly intensity: ProceduralArtworkIntensity;
  readonly seed: number;
}

export interface ArtworkControlsCardProps {
  readonly studio: CoverStudioState;
  readonly selectedLayerId: string | null;
  readonly eyedropperTarget: EyedropperTarget;
  readonly extendingStub?: boolean;
  readonly sampledEdgeHex?: string | null;
  readonly onSelectLayer: (id: string | null) => void;
  readonly onAddImageFiles: (files: readonly File[]) => void;
  readonly onApplyProceduralArtwork?: (request: ApplyProceduralArtworkRequest) => void;
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
  onApplyProceduralArtwork,
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
  const [selectedPatternId, setSelectedPatternId] =
    useState<ProceduralArtworkId>('suminagashi-marble');
  const [patternIntensity, setPatternIntensity] = useState<ProceduralArtworkIntensity>('subtle');
  const [patternTarget, setPatternTarget] = useState<ProceduralArtworkTarget>('front');
  const [patternSeed, setPatternSeed] = useState<number>(101);

  const selectedLayer: CoverImageLayer | null =
    studio.layers.find((l) => l.id === selectedLayerId) ?? null;

  const previewBaseHex =
    patternTarget === 'back'
      ? studio.backBgColor
      : patternTarget === 'spine'
        ? studio.spineBgColor
        : studio.frontBgColor;
  const previewAccentHex = studio.spineText.textColor;

  const patternThumbnails = useMemo(() => {
    const map = new Map<ProceduralArtworkId, string>();
    for (const spec of PROCEDURAL_ARTWORKS) {
      const svg = generateProceduralArtworkSvg({
        patternId: spec.id,
        widthMm: 64,
        heightMm: 52,
        baseColor: previewBaseHex,
        accentColor: previewAccentHex,
        seed: patternSeed,
        intensity: patternIntensity,
      });
      map.set(spec.id, toProceduralArtworkDataUrl(svg));
    }
    return map;
  }, [previewBaseHex, previewAccentHex, patternSeed, patternIntensity]);

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

        {onApplyProceduralArtwork && (
          <>
            <Separator />

            {/* Built-In Procedural Patterns & Artworks */}
            <div className="space-y-2.5" data-testid="procedural-artwork-section">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
                  Built-In Patterns &amp; Artworks
                </span>
                <div
                  role="group"
                  aria-label="Pattern visual intensity"
                  className="inline-flex rounded-[3px] border border-border bg-secondary/40 p-0.5"
                >
                  {(['subtle', 'vivid'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={patternIntensity === mode}
                      data-testid={`procedural-intensity-${mode}`}
                      onClick={() => setPatternIntensity(mode)}
                      className={`cursor-pointer rounded-[2px] px-2 py-0.5 text-[10.5px] font-medium capitalize transition-colors ${
                        patternIntensity === mode
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="grid grid-cols-3 gap-1.5"
                role="group"
                aria-label="Built-in procedural patterns"
                data-testid="procedural-pattern-grid"
              >
                {PROCEDURAL_ARTWORKS.map((spec) => {
                  const active = selectedPatternId === spec.id;
                  const thumbUrl = patternThumbnails.get(spec.id);
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      aria-pressed={active}
                      title={`${spec.label} — ${spec.description}`}
                      data-testid={`procedural-pattern-${spec.id}`}
                      onClick={() => setSelectedPatternId(spec.id)}
                      className={`group flex cursor-pointer flex-col overflow-hidden rounded-md border text-left transition-colors ${
                        active
                          ? 'border-vermilion bg-primary/10 ring-1 ring-vermilion/60'
                          : 'border-border bg-secondary/25 hover:border-brass/70'
                      }`}
                    >
                      <div className="relative h-11 w-full overflow-hidden border-b border-border/60 bg-secondary/40">
                        {thumbUrl && (
                          <img
                            src={thumbUrl}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        )}
                      </div>
                      <span className="truncate px-1.5 py-1 text-[10.5px] font-medium text-foreground">
                        {spec.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div
                  role="group"
                  aria-label="Pattern target area"
                  className="inline-flex flex-wrap items-center gap-1"
                >
                  {PROCEDURAL_ARTWORK_TARGETS.map((target) => (
                    <Button
                      key={target.id}
                      type="button"
                      size="sm"
                      variant={patternTarget === target.id ? 'default' : 'outline'}
                      aria-pressed={patternTarget === target.id}
                      className="h-6 px-2 text-[10.5px]"
                      data-testid={`procedural-target-${target.id}`}
                      onClick={() => setPatternTarget(target.id)}
                    >
                      {target.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  data-testid="procedural-shuffle-seed-btn"
                  title="Shuffle pattern variation seed"
                  onClick={() => setPatternSeed((prev) => ((prev * 1664525 + 1013904223) >>> 0) % 99991 + 1)}
                >
                  <Dices className="h-3.5 w-3.5" aria-hidden="true" />
                  Shuffle Seed
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-7 flex-1 px-3 text-xs"
                  data-testid="procedural-apply-btn"
                  onClick={() =>
                    onApplyProceduralArtwork({
                      patternId: selectedPatternId,
                      target: patternTarget,
                      intensity: patternIntensity,
                      seed: patternSeed,
                    })
                  }
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Apply Pattern
                </Button>
              </div>
            </div>
          </>
        )}

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
