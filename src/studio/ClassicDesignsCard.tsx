import {
  FlipHorizontal2,
  FlipVertical2,
  Maximize2,
  Minus,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FOIL_SWATCHES } from '@/resources/palettes';
import {
  COVER_ORNAMENT_BOUNDS,
  rotateOrnament90,
  type ClassicOrnamentCategory,
  type ClassicOrnamentId,
  type CoverElementZone,
  type CoverOrnamentLayer,
  type CustomSvgRenderMode,
  type OrnamentStyleTag,
} from '@/types/coverElements';
import { normalizeQuarterTurn } from '@/types/studioLayer';
import { roundTo } from '@/types/units';
import {
  CLASSIC_ORNAMENTS,
  ORNAMENT_STYLE_FILTERS,
  buildOrnamentCompoundPath,
  getClassicOrnamentSpec,
} from './classicOrnaments';

export interface ClassicDesignsCardProps {
  readonly ornaments: readonly CoverOrnamentLayer[];
  readonly selectedOrnamentId: string | null;
  readonly onSelectOrnament: (id: string | null) => void;
  readonly onAddOrnament: (
    presetId: ClassicOrnamentId,
    zone: CoverElementZone,
    color: string,
  ) => void;
  readonly onImportSvgStamp?: (file: File, zone: CoverElementZone, color: string) => void;
  readonly onUpdateOrnament: (id: string, patch: Partial<CoverOrnamentLayer>) => void;
  readonly onScaleOrnament: (id: string, factor: number) => void;
  readonly onFitOrnamentToBoard: (id: string) => void;
  readonly onFitOrnamentWithMargin?: (id: string, marginMm: number) => void;
  readonly onCenterOrnament?: (id: string) => void;
  readonly onQuickAlignOrnament?: (
    id: string,
    verticalSlot: 'upper' | 'center' | 'lower',
  ) => void;
  readonly onDeleteOrnament: (id: string) => void;
  /** When true, omits the outer Card wrapper and header (used inside CoverElementsCard). */
  readonly embedded?: boolean;
}

const SPINE_ORNAMENT_COUNT = CLASSIC_ORNAMENTS.filter((o) => o.category === 'spine').length;

const ORNAMENT_CATEGORY_TABS: readonly {
  readonly id: 'all' | ClassicOrnamentCategory;
  readonly label: string;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'frames', label: 'Frames' },
  { id: 'corners', label: 'Corners' },
  { id: 'dividers', label: 'Dividers' },
  { id: 'emblems', label: 'Emblems' },
  { id: 'spine', label: `Spine (${SPINE_ORNAMENT_COUNT})` },
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
    <svg viewBox="0 0 40 40" aria-hidden="true" className="h-9 w-9 shrink-0 text-brass">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function ClassicDesignsCard({
  ornaments,
  selectedOrnamentId,
  onSelectOrnament,
  onAddOrnament,
  onImportSvgStamp,
  onUpdateOrnament,
  onScaleOrnament,
  onFitOrnamentToBoard,
  onFitOrnamentWithMargin,
  onCenterOrnament,
  onQuickAlignOrnament,
  onDeleteOrnament,
  embedded = false,
}: ClassicDesignsCardProps) {
  const [ornamentStyle, setOrnamentStyle] = useState<'all' | OrnamentStyleTag>('all');
  const [ornamentCategory, setOrnamentCategory] = useState<'all' | ClassicOrnamentCategory>('all');
  const [ornamentZone, setOrnamentZone] = useState<CoverElementZone>('front');
  const [defaultFoilColor, setDefaultFoilColor] = useState<string>('#d9b566');
  const svgStampInputRef = useRef<HTMLInputElement>(null);

  const selectedOrnament = ornaments.find((o) => o.id === selectedOrnamentId) ?? null;
  const filteredOrnaments = CLASSIC_ORNAMENTS.filter(
    (spec) =>
      (ornamentStyle === 'all' || spec.styleTag === ornamentStyle) &&
      (ornamentCategory === 'all' || spec.category === ornamentCategory),
  );

  const content = (
    <>
      {/* Classic Bookbindery Vector Design Picker */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Target zone for new classic design"
        >
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

      {/* Style / Genre Filter Pills (All / Classic / Fantasy / Art Deco / Botanical / Sci-Fi & Modern) */}
      <div
        className="flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Filter classic designs by style"
        data-testid="ornament-style-filter-bar"
      >
        {ORNAMENT_STYLE_FILTERS.map((style) => (
          <Button
            key={style.id}
            type="button"
            size="sm"
            variant={ornamentStyle === style.id ? 'default' : 'outline'}
            aria-pressed={ornamentStyle === style.id}
            className="h-6 px-2 text-[11px]"
            data-testid={`ornament-style-${style.id}`}
            onClick={() => setOrnamentStyle(style.id)}
          >
            {style.label}
          </Button>
        ))}
      </div>

      {/* Category Filter Pills (All / Frames / Corners / Dividers / Emblems / Spine) */}
      <div
        className="flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Filter classic designs by category"
      >
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

      {filteredOrnaments.length > 0 ? (
        <div
          className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5"
          data-testid="classic-ornament-gallery"
        >
          {filteredOrnaments.map((spec) => (
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
              className="flex min-w-0 w-full items-center gap-2 rounded-md border border-border bg-secondary/25 px-2 py-1.5 text-left transition-colors hover:border-brass/70 hover:bg-accent/50 cursor-pointer"
            >
              <OrnamentThumb presetId={spec.id} />
              <span className="min-w-0 flex-1 break-words text-balance text-[11px] leading-tight font-medium text-foreground">
                {spec.label}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div
          className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border bg-secondary/20 px-3 py-2.5 text-xs text-muted-foreground"
          data-testid="classic-ornament-empty"
        >
          <span>No motifs match this style and category combination.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 shrink-0 px-2 text-[11px]"
            onClick={() => {
              setOrnamentStyle('all');
              setOrnamentCategory('all');
            }}
          >
            Show All
          </Button>
        </div>
      )}

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

            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={selectedOrnament.flipX ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                aria-pressed={Boolean(selectedOrnament.flipX)}
                title="Flip design horizontally"
                data-testid="ornament-flip-h-btn"
                onClick={() =>
                  onUpdateOrnament(selectedOrnament.id, { flipX: !selectedOrnament.flipX })
                }
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
                Flip H
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedOrnament.flipY ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                aria-pressed={Boolean(selectedOrnament.flipY)}
                title="Flip design vertically"
                data-testid="ornament-flip-v-btn"
                onClick={() =>
                  onUpdateOrnament(selectedOrnament.id, { flipY: !selectedOrnament.flipY })
                }
              >
                <FlipVertical2 className="h-3.5 w-3.5" aria-hidden="true" />
                Flip V
              </Button>
              {(() => {
                const rotDeg = normalizeQuarterTurn(selectedOrnament.rotationDeg);
                return (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    aria-label="Rotate design 90° clockwise"
                    title="Rotate 90° clockwise"
                    data-rotation={rotDeg}
                    data-testid="ornament-rotate-90-btn"
                    onClick={() => {
                      const rotated = rotateOrnament90(selectedOrnament);
                      onUpdateOrnament(selectedOrnament.id, {
                        xMm: rotated.xMm,
                        yMm: rotated.yMm,
                        widthMm: rotated.widthMm,
                        heightMm: rotated.heightMm,
                        rotationDeg: rotated.rotationDeg,
                      });
                    }}
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    90°
                  </Button>
                );
              })()}
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
            </div>
          </div>

          {/* 1-Click Margin Fit Presets & Center */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Maximize2 className="h-3 w-3 text-brass" aria-hidden="true" />
              Snap to Margin
            </span>
            <div
              className="flex flex-wrap items-center gap-1"
              role="group"
              aria-label="Snap ornament to board margin"
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                title="Fit inside board with a tight 6 mm margin"
                data-testid="ornament-fit-tight"
                onClick={() =>
                  onFitOrnamentWithMargin
                    ? onFitOrnamentWithMargin(selectedOrnament.id, 6)
                    : onFitOrnamentToBoard(selectedOrnament.id)
                }
              >
                Tight (6 mm)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                title="Fit inside board with a classic 12 mm margin"
                data-testid="ornament-fit-classic"
                onClick={() =>
                  onFitOrnamentWithMargin
                    ? onFitOrnamentWithMargin(selectedOrnament.id, 12)
                    : onFitOrnamentToBoard(selectedOrnament.id)
                }
              >
                Classic (12 mm)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                title="Fit inside board with a wide 18 mm margin"
                data-testid="ornament-fit-wide"
                onClick={() =>
                  onFitOrnamentWithMargin
                    ? onFitOrnamentWithMargin(selectedOrnament.id, 18)
                    : onFitOrnamentToBoard(selectedOrnament.id)
                }
              >
                Wide (18 mm)
              </Button>
              {!onQuickAlignOrnament && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  title="Center ornament horizontally and vertically on its board"
                  data-testid="ornament-center-btn"
                  onClick={() => onCenterOrnament?.(selectedOrnament.id)}
                >
                  Center
                </Button>
              )}
            </div>
          </div>

          {/* Unified Top ⅓ · Center · Bottom ⅓ Vertical Alignment */}
          {onQuickAlignOrnament && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                Vertical Position
              </span>
              <div
                className="flex flex-wrap items-center gap-1"
                role="group"
                aria-label="Align ornament vertically in cover zone"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  title="Align ornament to upper third of its zone"
                  data-testid="ornament-align-upper"
                  onClick={() => onQuickAlignOrnament(selectedOrnament.id, 'upper')}
                >
                  Top ⅓
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  title="Center ornament horizontally and vertically in its zone"
                  data-testid="ornament-center-btn"
                  onClick={() => onQuickAlignOrnament(selectedOrnament.id, 'center')}
                >
                  Center
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  title="Align ornament to lower third of its zone"
                  data-testid="ornament-align-lower"
                  onClick={() => onQuickAlignOrnament(selectedOrnament.id, 'lower')}
                >
                  Bottom ⅓
                </Button>
              </div>
            </div>
          )}

          {selectedOrnament.presetId === 'custom-svg' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">SVG Render Mode</span>
              <div className="flex items-center gap-1" role="group" aria-label="Custom SVG render mode">
                {(
                  [
                    { id: 'fill', label: 'Fill' },
                    { id: 'stroke', label: 'Outline' },
                    { id: 'fill-and-stroke', label: 'Fill + Thicken' },
                  ] as const satisfies readonly {
                    readonly id: CustomSvgRenderMode;
                    readonly label: string;
                  }[]
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
  );

  if (embedded) {
    return content;
  }

  return (
    <Card data-testid="classic-designs-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-base">
          <Sparkles className="h-4 w-4 text-brass" aria-hidden="true" />
          Classic Bookbindery Designs &amp; SVG Stamps
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{content}</CardContent>
    </Card>
  );
}
