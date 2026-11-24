import {
  ArrowDown,
  ArrowUp,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Grid2x2,
  ImagePlus,
  Minus,
  Palette,
  Plus,
  RotateCw,
  Trash2,
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
import { Slider } from '@/components/ui/slider';
import {
  ENDPAPER_SWATCHES,
  STUDIO_BOUNDS,
  type PocketStyleConfig,
  type PocketStyleScope,
} from '@/types/studio';
import {
  CoverImageLayerModel,
  getLayerVisualRect,
  nextQuarterTurn,
  normalizeQuarterTurn,
  type CoverImageLayer,
} from '@/types/studioLayer';
import { roundTo } from '@/types/units';

export type PocketQuickFitTarget = 'front' | 'back' | 'liner' | 'all';

export interface PocketStyleControlsProps {
  readonly pocketStyle: PocketStyleConfig;
  readonly coverMatchColor: string;
  readonly isFoldedEndpapers?: boolean;
  readonly layers: readonly CoverImageLayer[];
  readonly selectedLayerId: string | null;
  readonly selectedLayer: CoverImageLayer | null;
  readonly onUpdateStyle: (patch: Partial<PocketStyleConfig>) => void;
  readonly onUpdateLayer: (
    id: string,
    updater: (layer: CoverImageLayer) => CoverImageLayer,
  ) => void;
  readonly onSelectLayer: (id: string | null) => void;
  readonly onAddImageFiles: (files: readonly File[]) => Promise<void>;
  readonly onQuickFitLayer: (id: string, target: PocketQuickFitTarget) => void;
  readonly onToggleLayerTile: (layer: CoverImageLayer) => void;
  readonly onCopyToOtherPocket: (layer: CoverImageLayer) => void;
  readonly onStatusMessage: (message: string) => void;
}

const SLIP_POCKET_QUICK_FIT_OPTIONS = [
  { id: 'front' as const, label: 'Fit Front Pocket' },
  { id: 'back' as const, label: 'Fit Back Pocket' },
  { id: 'liner' as const, label: 'Fit Spine Liner' },
  { id: 'all' as const, label: 'Fit All' },
] as const;

const FOLDED_ENDPAPER_QUICK_FIT_OPTIONS = [
  { id: 'front' as const, label: 'Fit Front Endpaper' },
  { id: 'back' as const, label: 'Fit Back Endpaper' },
  { id: 'liner' as const, label: 'Fit Spine Liner' },
  { id: 'all' as const, label: 'Fit All' },
] as const;

/** Bottom styling cards for Endpaper Base Color & Scope and interactive Pocket Artwork Layers. */
export function PocketStyleControls({
  pocketStyle,
  coverMatchColor,
  isFoldedEndpapers = false,
  layers,
  selectedLayerId,
  selectedLayer,
  onUpdateStyle,
  onUpdateLayer,
  onSelectLayer,
  onAddImageFiles,
  onQuickFitLayer,
  onToggleLayerTile,
  onCopyToOtherPocket,
  onStatusMessage,
}: PocketStyleControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickFitOptions = isFoldedEndpapers
    ? FOLDED_ENDPAPER_QUICK_FIT_OPTIONS
    : SLIP_POCKET_QUICK_FIT_OPTIONS;

  return (
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
                onUpdateStyle({ backgroundColor: coverMatchColor });
                onStatusMessage(
                  isFoldedEndpapers
                    ? `Matched folded endpaper color to cover (${coverMatchColor.toUpperCase()})`
                    : `Matched inner pocket color to cover (${coverMatchColor.toUpperCase()})`,
                );
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
                onChange={(e) => onUpdateStyle({ backgroundColor: e.target.value })}
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
                    onClick={() => onUpdateStyle({ backgroundColor: swatch.hex })}
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
            {isFoldedEndpapers ? (
              <p className="text-xs text-muted-foreground">
                Folded endpaper sheets print edge-to-edge across both <strong>Pastedown</strong>{' '}
                and <strong>Flyleaf</strong> — no glue flaps to mask.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="pocket-style-scope">Print Color &amp; Image Clipping Area</Label>
                <Select
                  value={pocketStyle.styleScope}
                  onValueChange={(val) => onUpdateStyle({ styleScope: val as PocketStyleScope })}
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
            )}
          </div>
        </CardContent>
      </Card>

      {/* Interactive Pocket Artwork Layers (mirrors Outer Cover Artwork Card) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 font-serif text-base">
              <ImagePlus className="h-4 w-4 text-brass" aria-hidden="true" />
              {isFoldedEndpapers ? 'Endpaper Artwork Layers' : 'Pocket Artwork Layers'}
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
                    void onAddImageFiles(files);
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3.5">
          {selectedLayer && (() => {
            const selectedVisualRect = getLayerVisualRect(selectedLayer);
            const selectedRotationDeg = normalizeQuarterTurn(selectedLayer.rotationDeg);
            return (
            <div
              className="space-y-2.5 rounded-md border border-primary/30 bg-primary/5 p-2.5"
              data-testid="pocket-selected-layer-controls"
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
                {quickFitOptions.map((opt) => (
                  <Button
                    key={opt.id}
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    data-testid={`pocket-quick-fit-${opt.id}`}
                    onClick={() => onQuickFitLayer(selectedLayer.id, opt.id)}
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
                  title={
                    isFoldedEndpapers
                      ? 'Repeat this image seamlessly across both endpapers (drag corners to adjust tile size)'
                      : 'Repeat this image seamlessly across all inner pockets (drag corners to adjust tile size)'
                  }
                  onClick={() => onToggleLayerTile(selectedLayer)}
                >
                  <Grid2x2 className="h-3 w-3" aria-hidden="true" />
                  {selectedLayer.tiled ? 'Tiled Pattern' : 'Tile Pattern'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  data-testid="pocket-copy-other-btn"
                  title={
                    isFoldedEndpapers
                      ? 'Duplicate this image onto the opposite endpaper'
                      : 'Duplicate this image onto the opposite pocket'
                  }
                  onClick={() => onCopyToOtherPocket(selectedLayer)}
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  {isFoldedEndpapers ? 'Copy to Other Endpaper' : 'Copy to Other Pocket'}
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
                    onValueChange={([imageOpacity]) => onUpdateStyle({ imageOpacity })}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant={selectedLayer.flipX ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 px-2 text-xs"
                    aria-label="Flip selected pocket image horizontally"
                    aria-pressed={Boolean(selectedLayer.flipX)}
                    title="Flip image horizontally"
                    data-testid="pocket-layer-flip-h-btn"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, (layer) => ({
                        ...layer,
                        flipX: !layer.flipX,
                      }))
                    }
                  >
                    <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Flip H
                  </Button>
                  <Button
                    type="button"
                    variant={selectedLayer.flipY ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 px-2 text-xs"
                    aria-label="Flip selected pocket image vertically"
                    aria-pressed={Boolean(selectedLayer.flipY)}
                    title="Flip image vertically"
                    data-testid="pocket-layer-flip-v-btn"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, (layer) => ({
                        ...layer,
                        flipY: !layer.flipY,
                      }))
                    }
                  >
                    <FlipVertical2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Flip V
                  </Button>
                  <Button
                    type="button"
                    variant={selectedRotationDeg ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-8 px-2 text-xs"
                    aria-label="Rotate selected pocket image 90° clockwise"
                    aria-pressed={Boolean(selectedRotationDeg)}
                    title={
                      selectedRotationDeg
                        ? `Rotated ${selectedRotationDeg}° — click to rotate 90° clockwise`
                        : 'Rotate image 90° clockwise'
                    }
                    data-testid="pocket-layer-rotate-90-btn"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, (layer) => ({
                        ...layer,
                        rotationDeg: nextQuarterTurn(layer.rotationDeg),
                      }))
                    }
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {selectedRotationDeg ? `${selectedRotationDeg}°` : '90°'}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Scale selected pocket image down"
                    data-testid="pocket-layer-scale-down-btn"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, (layer) =>
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
                      onUpdateLayer(selectedLayer.id, (layer) =>
                        CoverImageLayerModel.scaleAroundCenter(layer, 1.1),
                      )
                    }
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
            );
          })()}

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
                      onClick={() => onSelectLayer(layer.id)}
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
                          onUpdateStyle({
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
                          onUpdateStyle({
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
                          onUpdateStyle({ layers: remaining });
                          if (selectedLayerId === layer.id) {
                            onSelectLayer(remaining[remaining.length - 1]?.id ?? null);
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
              Drag &amp; drop PNG, JPG, or WEBP images directly onto the{' '}
              {isFoldedEndpapers ? 'endpapers' : 'pockets'} cutting mat above (or click{' '}
              <strong>Add Images</strong>) — then drag to move and pull corners to resize.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
