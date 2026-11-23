import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Maximize2,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
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
  COVER_ORNAMENT_BOUNDS,
  COVER_TEXT_BOUNDS,
  type ClassicOrnamentCategory,
  type ClassicOrnamentId,
  type CoverElementZone,
  type CoverOrnamentLayer,
  type CoverTextLayer,
  type CoverTextPresetKind,
  type CustomSvgRenderMode,
  type TextAlign,
} from '@/types/coverElements';
import type { CoverStudioState, StudioFontId } from '@/types/studio';
import { roundTo } from '@/types/units';
import {
  CLASSIC_ORNAMENTS,
  buildOrnamentCompoundPath,
  getClassicOrnamentSpec,
} from './classicOrnaments';
import { CURATED_FONTS, type CustomFontAsset } from './fonts';

const FOIL_SWATCHES: readonly { readonly label: string; readonly hex: string }[] = [
  { label: 'Antique Gold Foil', hex: '#d9b566' },
  { label: 'Archival Cream', hex: '#f5efe2' },
  { label: 'Silver Foil', hex: '#d4d8de' },
  { label: 'Rose Copper', hex: '#d48b6a' },
  { label: 'Lampblack Ink', hex: '#1f1b16' },
];

export type CoverElementsTab = 'text' | 'ornaments';

export interface CoverElementsCardProps {
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly selectedTextId: string | null;
  readonly selectedOrnamentId: string | null;
  readonly onSelectText: (id: string | null) => void;
  readonly onSelectOrnament: (id: string | null) => void;
  readonly onAddTextPreset: (preset: CoverTextPresetKind) => void;
  readonly onUpdateTextLayer: (id: string, patch: Partial<CoverTextLayer>) => void;
  readonly onQuickAlignText: (id: string, verticalSlot: 'upper' | 'center' | 'lower') => void;
  readonly onDeleteTextLayer: (id: string) => void;
  readonly onAddOrnament: (presetId: ClassicOrnamentId, zone: CoverElementZone, color: string) => void;
  readonly onImportSvgStamp?: (file: File, zone: CoverElementZone, color: string) => void;
  readonly onUpdateOrnament: (id: string, patch: Partial<CoverOrnamentLayer>) => void;
  readonly onScaleOrnament: (id: string, factor: number) => void;
  readonly onFitOrnamentToBoard: (id: string) => void;
  readonly onDeleteOrnament: (id: string) => void;
}

const ORNAMENT_CATEGORY_TABS: readonly {
  readonly id: 'all' | ClassicOrnamentCategory;
  readonly label: string;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'frames', label: 'Frames' },
  { id: 'corners', label: 'Corners' },
  { id: 'dividers', label: 'Dividers' },
  { id: 'emblems', label: 'Emblems' },
  { id: 'spine', label: 'Spine (6)' },
];

function OrnamentThumb({ presetId }: { readonly presetId: ClassicOrnamentId }) {
  const isDivider = presetId.startsWith('divider-');
  const isSpine = presetId.startsWith('spine-');
  const previewLayer: CoverOrnamentLayer = {
    id: `thumb-${presetId}`,
    presetId,
    zone: isSpine ? 'spine' : 'front',
    xMm: isSpine ? 14 : 4,
    yMm: isDivider ? 14 : 4,
    widthMm: isSpine ? 12 : 32,
    heightMm: isDivider ? 12 : 32,
    color: 'currentColor',
    strokeWidthMm: isSpine ? 1.05 : isDivider ? 1.1 : 1.35,
  };
  const d = buildOrnamentCompoundPath(previewLayer);
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="h-9 w-9 shrink-0 text-brass"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function CoverElementsCard({
  studio,
  customFont,
  selectedTextId,
  selectedOrnamentId,
  onSelectText,
  onSelectOrnament,
  onAddTextPreset,
  onUpdateTextLayer,
  onQuickAlignText,
  onDeleteTextLayer,
  onAddOrnament,
  onImportSvgStamp,
  onUpdateOrnament,
  onScaleOrnament,
  onFitOrnamentToBoard,
  onDeleteOrnament,
}: CoverElementsCardProps) {
  const [activeTab, setActiveTab] = useState<CoverElementsTab>('text');
  const [ornamentCategory, setOrnamentCategory] = useState<'all' | ClassicOrnamentCategory>('all');
  const [ornamentZone, setOrnamentZone] = useState<CoverElementZone>('front');
  const [defaultFoilColor, setDefaultFoilColor] = useState<string>('#d9b566');
  const svgStampInputRef = useRef<HTMLInputElement>(null);

  const textLayers = studio.textLayers ?? [];
  const ornaments = studio.ornaments ?? [];
  const selectedText = textLayers.find((t) => t.id === selectedTextId) ?? null;
  const selectedOrnament = ornaments.find((o) => o.id === selectedOrnamentId) ?? null;

  // Keep visible tab in sync when the user clicks a text/ornament directly on the canvas
  const resolvedTab: CoverElementsTab =
    selectedOrnament && !selectedText
      ? 'ornaments'
      : selectedText && !selectedOrnament
        ? 'text'
        : activeTab;

  return (
    <Card data-testid="cover-elements-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 font-serif text-base">
            <Sparkles className="h-4 w-4 text-brass" aria-hidden="true" />
            Front &amp; Back Text + Classic Designs
          </CardTitle>
          <div className="flex items-center gap-1" role="tablist" aria-label="Cover design elements">
            <Button
              type="button"
              role="tab"
              aria-selected={resolvedTab === 'text'}
              size="sm"
              variant={resolvedTab === 'text' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              data-testid="elements-tab-text"
              onClick={() => {
                setActiveTab('text');
                onSelectOrnament(null);
              }}
            >
              <Type className="h-3.5 w-3.5" aria-hidden="true" />
              Cover Text
              {textLayers.length > 0 && (
                <Badge variant="outline" className="ml-1 h-4 px-1 font-mono text-[10px]">
                  {textLayers.length}
                </Badge>
              )}
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={resolvedTab === 'ornaments'}
              size="sm"
              variant={resolvedTab === 'ornaments' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              data-testid="elements-tab-ornaments"
              onClick={() => {
                setActiveTab('ornaments');
                onSelectText(null);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Classic Designs
              {ornaments.length > 0 && (
                <Badge variant="outline" className="ml-1 h-4 px-1 font-mono text-[10px]">
                  {ornaments.length}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {resolvedTab === 'text' ? (
          <>
            {/* Quick-Add Front & Back Cover Text Presets */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
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
                Drag any text block directly on the cover — snaps magnetically to board centers &amp;
                exports as vector curves for Print PDF and Cricut HTV.
              </p>
            </div>

            {/* Cover Text Layer List */}
            {textLayers.length > 0 && (
              <ul
                aria-label="Cover text layers"
                data-testid="cover-text-layer-list"
                className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border bg-secondary/25 p-1.5"
              >
                {textLayers.map((layer, idx) => {
                  const isSelected = layer.id === selectedTextId;
                  const snippet = layer.text.split(/\r?\n/)[0]?.trim() || '(Empty text)';
                  return (
                    <li
                      key={layer.id}
                      className={`flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-xs ${
                        isSelected
                          ? 'bg-primary/12 text-foreground ring-1 ring-primary/40'
                          : 'hover:bg-accent/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectText(layer.id)}
                        data-testid={`cover-text-select-${idx}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                          style={{ backgroundColor: layer.color }}
                        />
                        <span className="truncate font-medium">{snippet}</span>
                        <Badge variant="outline" className="ml-auto shrink-0 font-mono text-[9px] uppercase">
                          {layer.zone}
                        </Badge>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
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

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="cover-text-font">Font</Label>
                    <Select
                      value={selectedText.fontId}
                      onValueChange={(v) =>
                        onUpdateTextLayer(selectedText.id, { fontId: v as StudioFontId })
                      }
                    >
                      <SelectTrigger id="cover-text-font" className="h-8 text-xs">
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
                  <div className="flex items-center gap-1" role="group" aria-label="Text alignment">
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
        ) : (
          <>
            {/* Classic Bookbindery Vector Design Picker */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1" role="group" aria-label="Target zone for new classic design">
                <span className="mr-1 text-[11px] font-medium text-muted-foreground">Place on:</span>
                {(['front', 'back', 'spine'] as const).map((z) => (
                  <Button
                    key={z}
                    type="button"
                    size="sm"
                    variant={ornamentZone === z ? 'default' : 'outline'}
                    className="h-6 px-2 text-[11px] capitalize"
                    onClick={() => setOrnamentZone(z)}
                  >
                    {z}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  {FOIL_SWATCHES.slice(0, 4).map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      title={`Default ornament foil color: ${swatch.label}`}
                      aria-label={`Default foil color ${swatch.label}`}
                      onClick={() => setDefaultFoilColor(swatch.hex)}
                      className={`h-4 w-4 rounded-full border cursor-pointer ${
                        defaultFoilColor === swatch.hex
                          ? 'ring-2 ring-primary ring-offset-1 border-foreground'
                          : 'border-border'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    />
                  ))}
                </div>
                {onImportSvgStamp && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      data-testid="import-svg-stamp-btn"
                      onClick={() => svgStampInputRef.current?.click()}
                    >
                      <Upload className="h-3 w-3" aria-hidden="true" />
                      Import SVG Stamp
                    </Button>
                    <input
                      ref={svgStampInputRef}
                      type="file"
                      accept=".svg,image/svg+xml"
                      className="visually-hidden"
                      aria-label="Import custom vector SVG stamp"
                      data-testid="import-svg-stamp-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onImportSvgStamp(file, ornamentZone, defaultFoilColor);
                          e.target.value = '';
                        }
                      }}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Category Filter Pills (All / Frames / Corners / Dividers / Emblems / Spine) */}
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter classic designs by category">
              {ORNAMENT_CATEGORY_TABS.map((cat) => (
                <Button
                  key={cat.id}
                  type="button"
                  size="sm"
                  variant={ornamentCategory === cat.id ? 'secondary' : 'ghost'}
                  className="h-6 px-2 text-[11px]"
                  data-testid={`ornament-cat-${cat.id}`}
                  onClick={() => {
                    setOrnamentCategory(cat.id);
                    if (cat.id === 'spine') {
                      setOrnamentZone('spine');
                    }
                  }}
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            <div
              className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
              data-testid="classic-ornament-gallery"
            >
              {CLASSIC_ORNAMENTS.filter(
                (spec) => ornamentCategory === 'all' || spec.category === ornamentCategory,
              ).map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  data-testid={`add-ornament-${spec.id}`}
                  title={spec.description}
                  onClick={() =>
                    onAddOrnament(
                      spec.id,
                      spec.category === 'spine' ? 'spine' : ornamentZone,
                      defaultFoilColor,
                    )
                  }
                  className="flex items-center gap-2 rounded-md border border-border bg-secondary/25 px-2 py-1.5 text-left transition-colors hover:border-brass/70 hover:bg-accent/50 cursor-pointer"
                >
                  <OrnamentThumb presetId={spec.id} />
                  <span className="min-w-0 text-[11px] leading-tight font-medium text-foreground">
                    {spec.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Placed Ornaments List */}
            {ornaments.length > 0 && (
              <>
                <Separator />
                <ul
                  aria-label="Placed classic design ornaments"
                  data-testid="ornament-layer-list"
                  className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border bg-secondary/25 p-1.5"
                >
                  {ornaments.map((orn, idx) => {
                    const spec = getClassicOrnamentSpec(orn.presetId);
                    const displayLabel =
                      orn.presetId === 'custom-svg' && orn.customSvgName
                        ? orn.customSvgName
                        : spec.label;
                    const isSelected = orn.id === selectedOrnamentId;
                    return (
                      <li
                        key={orn.id}
                        className={`flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-xs ${
                          isSelected
                            ? 'bg-primary/12 text-foreground ring-1 ring-primary/40'
                            : 'hover:bg-accent/60'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectOrnament(orn.id)}
                          data-testid={`ornament-select-${idx}`}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                            style={{ backgroundColor: orn.color }}
                          />
                          <span className="truncate font-medium">{displayLabel}</span>
                          <Badge variant="outline" className="ml-auto shrink-0 font-mono text-[9px] uppercase">
                            {orn.zone}
                          </Badge>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          aria-label={`Remove ornament ${displayLabel}`}
                          data-testid={`ornament-delete-${idx}`}
                          onClick={() => onDeleteOrnament(orn.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* Selected Ornament Inspector */}
            {selectedOrnament && (
              <div
                className="space-y-3 rounded-md border border-border bg-secondary/20 p-3"
                data-testid="selected-ornament-controls"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="ornament-color" className="text-xs">
                      Foil / Ink
                    </Label>
                    <input
                      id="ornament-color"
                      type="color"
                      value={selectedOrnament.color}
                      onChange={(e) =>
                        onUpdateOrnament(selectedOrnament.id, { color: e.target.value })
                      }
                      className="h-7 w-9 cursor-pointer rounded-sm border border-border bg-transparent p-0.5"
                    />
                    <div className="flex items-center gap-1">
                      {FOIL_SWATCHES.map((swatch) => (
                        <button
                          key={swatch.hex}
                          type="button"
                          title={swatch.label}
                          aria-label={`Set ornament color to ${swatch.label}`}
                          onClick={() =>
                            onUpdateOrnament(selectedOrnament.id, { color: swatch.hex })
                          }
                          className="h-5 w-5 rounded-full border border-border shadow-xs cursor-pointer transition-transform hover:scale-110"
                          style={{ backgroundColor: swatch.hex }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      aria-label="Scale ornament down"
                      onClick={() => onScaleOrnament(selectedOrnament.id, 0.9)}
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      aria-label="Scale ornament up"
                      onClick={() => onScaleOrnament(selectedOrnament.id, 1.1)}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => onFitOrnamentToBoard(selectedOrnament.id)}
                    >
                      <Maximize2 className="h-3 w-3" aria-hidden="true" />
                      Fit Board
                    </Button>
                  </div>
                </div>

                {selectedOrnament.presetId === 'custom-svg' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      SVG Render Mode
                    </span>
                    <div className="flex items-center gap-1" role="group" aria-label="Custom SVG render mode">
                      {(
                        [
                          { id: 'fill', label: 'Fill' },
                          { id: 'stroke', label: 'Outline' },
                          { id: 'fill-and-stroke', label: 'Fill + Thicken' },
                        ] as const satisfies readonly { readonly id: CustomSvgRenderMode; readonly label: string }[]
                      ).map((mode) => (
                        <Button
                          key={mode.id}
                          type="button"
                          size="sm"
                          variant={
                            (selectedOrnament.customSvgRenderMode ?? 'fill') === mode.id
                              ? 'default'
                              : 'outline'
                          }
                          className="h-6 px-2 text-[11px]"
                          onClick={() =>
                            onUpdateOrnament(selectedOrnament.id, {
                              customSvgRenderMode: mode.id,
                            })
                          }
                        >
                          {mode.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedOrnament.presetId !== 'custom-svg' ||
                  (selectedOrnament.customSvgRenderMode ?? 'fill') !== 'fill') && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="ornament-stroke">
                        {selectedOrnament.presetId === 'custom-svg'
                          ? 'Stroke / Outline Thickness'
                          : 'Rule / Line Weight'}
                      </Label>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {roundTo(selectedOrnament.strokeWidthMm, 2)} mm
                      </span>
                    </div>
                    <input
                      id="ornament-stroke"
                      type="range"
                      min={COVER_ORNAMENT_BOUNDS.strokeWidthMm.min}
                      max={COVER_ORNAMENT_BOUNDS.strokeWidthMm.max}
                      step={0.05}
                      value={selectedOrnament.strokeWidthMm}
                      onChange={(e) =>
                        onUpdateOrnament(selectedOrnament.id, {
                          strokeWidthMm: Number(e.target.value),
                        })
                      }
                      className="h-2 w-full accent-primary cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
