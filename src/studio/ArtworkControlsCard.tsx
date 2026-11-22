import { ImagePlus, Pipette, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
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
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  COVER_ZONES,
  CoverStudioModel,
  STUDIO_BOUNDS,
  type CoverImagePlacement,
  type CoverImageSlot,
  type CoverStudioState,
  type CoverZoneId,
  type CutLineExportMode,
} from '@/types/studio';

export type EyedropperTarget = 'spine' | 'back' | 'both' | null;

export interface ArtworkControlsCardProps {
  readonly studio: CoverStudioState;
  readonly activeZone: CoverZoneId;
  readonly eyedropperTarget: EyedropperTarget;
  readonly onActiveZoneChange: (zone: CoverZoneId) => void;
  readonly onUpdateStudio: (patch: Partial<CoverStudioState>) => void;
  readonly onUpdateImageSlot: (slot: CoverImageSlot, patch: Partial<CoverImagePlacement>) => void;
  readonly onImageFileSelected: (slot: CoverImageSlot, file: File) => void;
  readonly onToggleEyedropper: (target: Exclude<EyedropperTarget, null>) => void;
}

const SLOT_LABELS: Readonly<Record<CoverImageSlot, string>> = {
  front: 'Front Cover',
  spine: 'Spine',
  back: 'Back Cover',
  fullWrap: 'Full-Wrap Panoramic',
};

export function ArtworkControlsCard({
  studio,
  activeZone,
  eyedropperTarget,
  onActiveZoneChange,
  onUpdateStudio,
  onUpdateImageSlot,
  onImageFileSelected,
  onToggleEyedropper,
}: ArtworkControlsCardProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const activeSlot: CoverImageSlot = studio.imageMode === 'full-wrap' ? 'fullWrap' : activeZone;
  const activeImage = studio.images[activeSlot];
  const slotLabel = SLOT_LABELS[activeSlot];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-base">
          <ImagePlus className="h-4 w-4 text-primary" aria-hidden="true" />
          Cover Artwork &amp; Color Fill
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Full-Wrap Panoramic Mode Toggle */}
        <div className="flex items-center justify-between rounded-md border border-border bg-secondary/35 p-2.5">
          <div>
            <Label htmlFor="full-wrap-mode-toggle">Full-Wrap Panoramic Mode</Label>
            <p className="text-[11px] text-muted-foreground">
              {studio.imageMode === 'full-wrap'
                ? 'One wide image spans Back + Spine + Front + Turn-ins'
                : 'Upload separate images for Front, Spine, and Back covers'}
            </p>
          </div>
          <Switch
            id="full-wrap-mode-toggle"
            data-testid="studio-full-wrap-toggle"
            checked={studio.imageMode === 'full-wrap'}
            onCheckedChange={(checked) =>
              onUpdateStudio({ imageMode: checked ? 'full-wrap' : 'per-zone' })
            }
          />
        </div>

        {/* Per-Zone Image Slot Selector (Front / Spine / Back) */}
        {studio.imageMode === 'per-zone' && (
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Artwork Zone
            </span>
            <Tabs
              value={activeZone}
              onValueChange={(val) => onActiveZoneChange(val as CoverZoneId)}
            >
              <TabsList className="grid w-full grid-cols-3">
                {COVER_ZONES.map((zone) => {
                  const hasImg = studio.images[zone.id].dataUrl !== null;
                  return (
                    <TabsTrigger
                      key={zone.id}
                      value={zone.id}
                      data-testid={`studio-zone-tab-${zone.id}`}
                    >
                      <span>{zone.label}</span>
                      {hasImg && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-primary"
                          aria-label={`${zone.label} image loaded`}
                        />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Active Slot Upload / Center / Remove */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
              data-testid="studio-upload-image-btn"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Upload {slotLabel} Image
            </Button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="visually-hidden"
              aria-label={`Upload ${slotLabel} artwork image`}
              data-testid="studio-upload-image-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImageFileSelected(activeSlot, file);
                  e.target.value = '';
                }
              }}
            />
            {activeImage.dataUrl && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onUpdateImageSlot(activeSlot, { zoom: 1, offsetXMm: 0, offsetYMm: 0 })
                  }
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
                    onUpdateImageSlot(activeSlot, CoverStudioModel.createEmptyImage())
                  }
                  data-testid="studio-clear-image-btn"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </Button>
              </>
            )}
          </div>

          {activeImage.fileName && (
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {slotLabel}: {activeImage.fileName} ({activeImage.naturalWidth}×
              {activeImage.naturalHeight}px)
            </p>
          )}
        </div>

        {/* Active Image Zoom Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="studio-image-zoom">{slotLabel} Zoom</Label>
            <span className="font-mono text-xs text-muted-foreground">
              {Math.round(activeImage.zoom * 100)}%
            </span>
          </div>
          <Slider
            id="studio-image-zoom"
            aria-label={`${slotLabel} artwork zoom`}
            disabled={!activeImage.dataUrl}
            min={STUDIO_BOUNDS.zoom.min}
            max={STUDIO_BOUNDS.zoom.max}
            step={0.05}
            value={[activeImage.zoom]}
            onValueChange={([zoom]) => onUpdateImageSlot(activeSlot, { zoom })}
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

        {/* Print Cut-Line Export Toggle */}
        <div className="space-y-1.5">
          <Label htmlFor="cut-line-export-mode">Print-Ready PDF Cut Guides</Label>
          <Select
            value={studio.cutLineMode}
            onValueChange={(val) => onUpdateStudio({ cutLineMode: val as CutLineExportMode })}
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
  );
}
