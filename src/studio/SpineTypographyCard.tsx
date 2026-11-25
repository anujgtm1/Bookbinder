import { Download, Type } from 'lucide-react';
import { useRef } from 'react';
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
import { Slider } from '@/components/ui/slider';
import {
  STUDIO_BOUNDS,
  type AuthorOrientation,
  type SpineLayoutPreset,
  type SpineOrientation,
  type SpineTypographyConfig,
  type StudioFontId,
} from '@/types/studio';
import { FontSelect } from './FontSelect';
import type { CustomFontAsset } from './fonts';

export interface SpineTypographyCardProps {
  readonly spineText: SpineTypographyConfig;
  readonly maxFontSizePt: number;
  readonly effectiveFontSizePt: number;
  readonly customFont: CustomFontAsset | null;
  readonly onUpdateSpineText: (patch: Partial<SpineTypographyConfig>) => void;
  readonly onCustomFontSelected: (file: File) => void;
}

export function SpineTypographyCard({
  spineText,
  maxFontSizePt,
  effectiveFontSizePt,
  customFont,
  onUpdateSpineText,
  onCustomFontSelected,
}: SpineTypographyCardProps) {
  const fontInputRef = useRef<HTMLInputElement>(null);

  return (
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
              value={spineText.title}
              onChange={(e) => onUpdateSpineText({ title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="spine-author-input">Spine Author</Label>
            <Input
              id="spine-author-input"
              data-testid="studio-spine-author-input"
              placeholder="e.g. Frank Herbert"
              value={spineText.author}
              onChange={(e) => onUpdateSpineText({ author: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label htmlFor="spine-layout-select">Layout Preset</Label>
            <Select
              value={spineText.layout}
              onValueChange={(val) => onUpdateSpineText({ layout: val as SpineLayoutPreset })}
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
              value={spineText.orientation}
              onValueChange={(val) => onUpdateSpineText({ orientation: val as SpineOrientation })}
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

        {/* Author Writing Orientation Toggle (Vertical vs Horizontal) */}
        <div className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-secondary/35 px-2.5 py-2">
          <div>
            <span className="text-xs font-medium text-foreground">Author Writing</span>
            <p className="text-[11px] text-muted-foreground">
              Flip author name vertical along spine or horizontal across tail
            </p>
          </div>
          <div
            role="group"
            aria-label="Author writing orientation"
            className="inline-flex shrink-0 rounded-md border border-input bg-muted p-0.5"
          >
            {(
              [
                { id: 'vertical', label: 'Vertical' },
                { id: 'horizontal', label: 'Horizontal' },
              ] as const satisfies readonly { id: AuthorOrientation; label: string }[]
            ).map((opt) => {
              const active = spineText.authorOrientation === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`author-orientation-${opt.id}`}
                  onClick={() => onUpdateSpineText({ authorOrientation: opt.id })}
                  className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Selector + Custom Font Uploader */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="spine-font-select">Spine Typeface</Label>
            <FontSelect
              id="spine-font-select"
              value={spineText.fontId}
              customFont={customFont}
              triggerTestId="studio-font-select"
              customLabelStyle="filename"
              onValueChange={(fontId: StudioFontId) => onUpdateSpineText({ fontId })}
            />
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
                  onCustomFontSelected(file);
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
              onValueChange={([fontSizePt]) => onUpdateSpineText({ fontSizePt })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="spine-text-color">Ink Color</Label>
            <input
              id="spine-text-color"
              data-testid="studio-spine-text-color"
              type="color"
              value={spineText.textColor}
              onChange={(e) => onUpdateSpineText({ textColor: e.target.value })}
              className="block h-8 w-11 cursor-pointer rounded border border-input bg-card p-0.5"
            />
          </div>
        </div>

        {/* Optical Horizontal Nudge Slider (±2.0 mm) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="spine-optical-nudge">Optical Horizontal Nudge</Label>
            <span className="font-mono text-xs text-muted-foreground">
              {spineText.opticalNudgeMm >= 0 ? '+' : ''}
              {spineText.opticalNudgeMm.toFixed(1)} mm
            </span>
          </div>
          <Slider
            id="spine-optical-nudge"
            aria-label="Optical horizontal nudge in millimeters"
            min={STUDIO_BOUNDS.opticalNudgeMm.min}
            max={STUDIO_BOUNDS.opticalNudgeMm.max}
            step={0.1}
            value={[spineText.opticalNudgeMm]}
            onValueChange={([opticalNudgeMm]) => onUpdateSpineText({ opticalNudgeMm })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
