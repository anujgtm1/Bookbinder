import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  FlipHorizontal2,
  FlipVertical2,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  Type,
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
import { FOIL_SWATCHES } from '@/resources/palettes';
import {
  COVER_TEXT_BOUNDS,
  type CoverElementZone,
  type CoverTextLayer,
  type CoverTextPresetKind,
  type TextAlign,
} from '@/types/coverElements';
import type { StudioFontId } from '@/types/studio';
import { nextQuarterTurn, normalizeQuarterTurn } from '@/types/studioLayer';
import { roundTo } from '@/types/units';
import { CURATED_FONTS, type CustomFontAsset } from './fonts';

export interface CoverTextCardProps {
  readonly textLayers: readonly CoverTextLayer[];
  readonly customFont: CustomFontAsset | null;
  readonly selectedTextId: string | null;
  readonly onSelectText: (id: string | null) => void;
  readonly onAddTextPreset: (preset: CoverTextPresetKind) => void;
  readonly onUpdateTextLayer: (id: string, patch: Partial<CoverTextLayer>) => void;
  readonly onQuickAlignText: (id: string, verticalSlot: 'upper' | 'center' | 'lower') => void;
  readonly onDeleteTextLayer: (id: string) => void;
  readonly onCustomFontSelected?: (file: File, targetTextLayerId: string) => void;
  /** When true, omits the outer Card wrapper and header (used inside CoverElementsCard). */
  readonly embedded?: boolean;
}

export function CoverTextCard({
  textLayers,
  customFont,
  selectedTextId,
  onSelectText,
  onAddTextPreset,
  onUpdateTextLayer,
  onQuickAlignText,
  onDeleteTextLayer,
  onCustomFontSelected,
  embedded = false,
}: CoverTextCardProps) {
  const coverFontInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const selectedText = textLayers.find((t) => t.id === selectedTextId) ?? null;

  const content = (
    <>
      {/* Quick-Add Cover Text & Presets */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-7 px-2.5 text-xs"
            data-testid="add-cover-text-btn"
            onClick={() => onAddTextPreset('text')}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Text
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            data-testid="add-front-title-btn"
            onClick={() => onAddTextPreset('front-title')}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Front Title
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            data-testid="add-front-author-btn"
            onClick={() => onAddTextPreset('front-author')}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Front Author
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            data-testid="add-back-blurb-btn"
            onClick={() => onAddTextPreset('back-blurb')}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Back Blurb
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Edit any text directly in the list below or drag it on the cover — snaps magnetically to
          board centers &amp; exports as vector curves for Print PDF and Cricut HTV.
        </p>
      </div>

      {/* Cover Text Layer List (inline-editable — stays 1:1 with the actual cover text) */}
      {textLayers.length > 0 && (
        <ul
          aria-label="Cover text layers"
          data-testid="cover-text-layer-list"
          className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border bg-secondary/25 p-1.5"
        >
          {textLayers.map((layer, idx) => {
            const isSelected = layer.id === selectedTextId;
            const hasNewlines = /\r?\n/.test(layer.text);
            const inlineDisplayValue = hasNewlines
              ? layer.text.replace(/\r?\n/g, ' ↵ ')
              : layer.text;
            const snippet = layer.text.split(/\r?\n/)[0]?.trim() || '(Empty text)';
            return (
              <li
                key={layer.id}
                className={`flex items-center justify-between gap-1.5 rounded-sm px-2 py-1 text-xs ${
                  isSelected
                    ? 'bg-primary/12 text-foreground ring-1 ring-primary/40'
                    : 'hover:bg-accent/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectText(layer.id)}
                  data-testid={`cover-text-select-${idx}`}
                  aria-label={`Select text layer ${snippet}`}
                  className="flex shrink-0 items-center cursor-pointer"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: layer.color }}
                  />
                </button>
                <input
                  ref={(el) => {
                    inlineInputRefs.current[layer.id] = el;
                  }}
                  type="text"
                  value={inlineDisplayValue}
                  placeholder="(Empty text)"
                  aria-label={`Cover text ${idx + 1}`}
                  data-testid={`cover-text-inline-input-${idx}`}
                  onFocus={() => onSelectText(layer.id)}
                  onClick={() => onSelectText(layer.id)}
                  onChange={(e) => onUpdateTextLayer(layer.id, { text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-xs bg-transparent px-1 py-0.5 text-xs font-medium text-foreground placeholder:text-muted-foreground/70 hover:bg-background/60 focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Badge variant="outline" className="shrink-0 font-mono text-[9px] uppercase">
                  {layer.zone}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Rename text layer ${snippet}`}
                  title="Rename / edit text"
                  data-testid={`cover-text-rename-${idx}`}
                  onClick={() => {
                    onSelectText(layer.id);
                    const input = inlineInputRefs.current[layer.id];
                    if (input) {
                      input.focus();
                      input.select();
                    }
                  }}
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                  aria-label={`Remove text layer ${snippet}`}
                  data-testid={`cover-text-delete-${idx}`}
                  onClick={() => onDeleteTextLayer(layer.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Selected Text Layer Inspector */}
      {selectedText && (
        <div
          className="space-y-3 rounded-md border border-border bg-secondary/20 p-3"
          data-testid="selected-cover-text-controls"
        >
          <div className="space-y-1">
            <Label htmlFor="cover-text-input">Text Content (multi-line supported)</Label>
            <textarea
              id="cover-text-input"
              rows={2}
              value={selectedText.text}
              data-testid="cover-text-textarea"
              onChange={(e) => onUpdateTextLayer(selectedText.id, { text: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.5fr_1fr]">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1.5">
                <Label htmlFor="cover-text-font">Font</Label>
                {customFont && (
                  <Badge
                    variant="outline"
                    className="h-4 max-w-[140px] truncate px-1.5 font-mono text-[10px]"
                    data-testid="cover-text-custom-font-badge"
                    title={`Custom: ${customFont.familyName}`}
                  >
                    Custom: {customFont.familyName}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Select
                  value={selectedText.fontId}
                  onValueChange={(v) =>
                    onUpdateTextLayer(selectedText.id, { fontId: v as StudioFontId })
                  }
                >
                  <SelectTrigger id="cover-text-font" className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURATED_FONTS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                    {customFont && (
                      <SelectItem value="custom">Custom ({customFont.familyName})</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {onCustomFontSelected && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 px-2 text-xs"
                      data-testid="cover-text-upload-font-btn"
                      title="Upload a custom .ttf, .otf, .woff, or .woff2 font"
                      onClick={() => coverFontInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      Upload Font
                    </Button>
                    <input
                      ref={coverFontInputRef}
                      type="file"
                      accept=".ttf,.otf,.woff,.woff2"
                      className="visually-hidden"
                      aria-label="Upload custom font for cover text"
                      data-testid="cover-text-upload-font-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onCustomFontSelected(file, selectedText.id);
                          e.target.value = '';
                        }
                      }}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cover-text-zone">Cover Zone</Label>
              <Select
                value={selectedText.zone}
                onValueChange={(v) =>
                  onUpdateTextLayer(selectedText.id, { zone: v as CoverElementZone })
                }
              >
                <SelectTrigger id="cover-text-zone" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="front">Front Cover</SelectItem>
                  <SelectItem value="back">Back Cover</SelectItem>
                  <SelectItem value="spine">Spine</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="cover-text-size">Size</Label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {roundTo(selectedText.fontSizePt, 1)} pt
                </span>
              </div>
              <input
                id="cover-text-size"
                type="range"
                min={COVER_TEXT_BOUNDS.fontSizePt.min}
                max={COVER_TEXT_BOUNDS.fontSizePt.max}
                step={0.5}
                value={selectedText.fontSizePt}
                data-testid="cover-text-size-slider"
                onChange={(e) =>
                  onUpdateTextLayer(selectedText.id, { fontSizePt: Number(e.target.value) })
                }
                className="h-2 w-full accent-primary cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="cover-text-tracking">Tracking</Label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {roundTo(selectedText.letterSpacingEm, 2)} em
                </span>
              </div>
              <input
                id="cover-text-tracking"
                type="range"
                min={COVER_TEXT_BOUNDS.letterSpacingEm.min}
                max={COVER_TEXT_BOUNDS.letterSpacingEm.max}
                step={0.01}
                value={selectedText.letterSpacingEm}
                onChange={(e) =>
                  onUpdateTextLayer(selectedText.id, {
                    letterSpacingEm: Number(e.target.value),
                  })
                }
                className="h-2 w-full accent-primary cursor-pointer"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Alignment & Uppercase */}
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Text alignment">
              {(['left', 'center', 'right'] as const satisfies readonly TextAlign[]).map((align) => (
                <Button
                  key={align}
                  type="button"
                  size="icon"
                  variant={selectedText.align === align ? 'default' : 'outline'}
                  className="h-7 w-7"
                  aria-label={`Align ${align}`}
                  onClick={() => onUpdateTextLayer(selectedText.id, { align })}
                >
                  {align === 'left' ? (
                    <AlignLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : align === 'right' ? (
                    <AlignRight className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <AlignCenter className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={selectedText.uppercase ? 'default' : 'outline'}
                className="h-7 px-2 font-mono text-[11px]"
                aria-pressed={Boolean(selectedText.uppercase)}
                title="Toggle all-caps classic title lettering"
                onClick={() =>
                  onUpdateTextLayer(selectedText.id, { uppercase: !selectedText.uppercase })
                }
              >
                AA
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedText.flipX ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                aria-pressed={Boolean(selectedText.flipX)}
                title="Flip text horizontally"
                data-testid="cover-text-flip-h-btn"
                onClick={() =>
                  onUpdateTextLayer(selectedText.id, { flipX: !selectedText.flipX })
                }
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
                Flip H
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedText.flipY ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                aria-pressed={Boolean(selectedText.flipY)}
                title="Flip text vertically"
                data-testid="cover-text-flip-v-btn"
                onClick={() =>
                  onUpdateTextLayer(selectedText.id, { flipY: !selectedText.flipY })
                }
              >
                <FlipVertical2 className="h-3.5 w-3.5" aria-hidden="true" />
                Flip V
              </Button>
              {(() => {
                const rotDeg = normalizeQuarterTurn(selectedText.rotationDeg);
                return (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    aria-label="Rotate text 90° clockwise"
                    title="Rotate 90° clockwise"
                    data-rotation={rotDeg}
                    data-testid="cover-text-rotate-90-btn"
                    onClick={() =>
                      onUpdateTextLayer(selectedText.id, {
                        rotationDeg: nextQuarterTurn(selectedText.rotationDeg),
                      })
                    }
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    90°
                  </Button>
                );
              })()}
            </div>

            {/* Quick Vertical Board Alignment */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => onQuickAlignText(selectedText.id, 'upper')}
              >
                Upper ⅓
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => onQuickAlignText(selectedText.id, 'center')}
              >
                Center
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => onQuickAlignText(selectedText.id, 'lower')}
              >
                Lower ⅓
              </Button>
            </div>
          </div>

          {/* Color & Foil Swatches */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Label htmlFor="cover-text-color" className="text-xs">
              Ink / Foil
            </Label>
            <input
              id="cover-text-color"
              type="color"
              value={selectedText.color}
              onChange={(e) => onUpdateTextLayer(selectedText.id, { color: e.target.value })}
              className="h-7 w-9 cursor-pointer rounded-sm border border-border bg-transparent p-0.5"
            />
            <div className="flex items-center gap-1">
              {FOIL_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  aria-label={`Set text color to ${swatch.label}`}
                  onClick={() => onUpdateTextLayer(selectedText.id, { color: swatch.hex })}
                  className="h-5 w-5 rounded-full border border-border shadow-xs cursor-pointer transition-transform hover:scale-110"
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card data-testid="cover-text-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-base">
          <Type className="h-4 w-4 text-brass" aria-hidden="true" />
          Front &amp; Back Cover Text
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{content}</CardContent>
    </Card>
  );
}
