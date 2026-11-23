import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { Switch } from '@/components/ui/switch';
import {
  BOOK_PARAM_BOUNDS,
  BookParametersModel,
  PAGE_SIZES,
  PAPERBACK_PRESETS,
  type BookParameters,
  type PageSizeId,
  type PaperbackPresetId,
} from '@/types/bookParams';
import { UnitConverter, type UnitSystem } from '@/types/units';

export interface SidebarControlsProps {
  readonly params: BookParameters;
  readonly onChange: (next: BookParameters) => void;
  readonly onExportJson: () => void;
  readonly onImportJson: (file: File) => void;
  readonly onResetDefaults: () => void;
}

interface MeasurementFieldProps {
  readonly label: string;
  readonly valueMm: number;
  readonly unit: UnitSystem;
  readonly minMm: number;
  readonly maxMm: number;
  readonly testId?: string;
  readonly onCommitMm: (mm: number) => void;
}

function MeasurementField({
  label,
  valueMm,
  unit,
  minMm,
  maxMm,
  testId,
  onCommitMm,
}: MeasurementFieldProps) {
  const inputId = useId();
  const formatted = UnitConverter.formatValue(valueMm, unit);
  const [draft, setDraft] = useState(formatted);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(formatted);
    }
  }, [formatted, isFocused]);

  const minDisplay = UnitConverter.toDisplay(minMm, unit);
  const maxDisplay = UnitConverter.toDisplay(maxMm, unit);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>
      </div>
      <Input
        id={inputId}
        data-testid={testId}
        type="number"
        inputMode="decimal"
        step={UnitConverter.stepForUnit(unit)}
        min={Number(minDisplay.toFixed(2))}
        max={Number(maxDisplay.toFixed(2))}
        value={draft}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          setDraft(UnitConverter.formatValue(valueMm, unit));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const numeric = Number.parseFloat(raw);
          if (Number.isFinite(numeric)) {
            const mm = UnitConverter.fromDisplay(numeric, unit);
            const clamped = Math.min(maxMm, Math.max(minMm, mm));
            onCommitMm(clamped);
          }
        }}
        className="font-mono"
      />
    </div>
  );
}

export function SidebarControls({
  params,
  onChange,
  onExportJson,
  onImportJson,
  onResetDefaults,
}: SidebarControlsProps) {
  const [constructionOpen, setConstructionOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activePreset = BookParametersModel.detectPreset(params);
  const validation = BookParametersModel.validate(params);

  const update = (patch: Partial<BookParameters>) => {
    onChange(BookParametersModel.clampAndNormalize({ ...params, ...patch }));
  };

  const handlePresetChange = (value: string) => {
    if (value === 'custom') return;
    onChange(
      BookParametersModel.applyPreset(params, value as Exclude<PaperbackPresetId, 'custom'>),
    );
  };

  return (
    <aside
      id="book-spec-rail"
      aria-label="Case Dimensions and Settings"
      className="flex flex-col gap-4 rounded-lg border border-border border-t-2 border-t-brass-bright/75 bg-card p-4 shadow-xs lg:sticky lg:top-[58px] lg:max-h-[calc(100vh-74px)] lg:overflow-y-auto"
    >
      {/* Folio Rail Title & Unit System Toggle */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-serif text-sm font-semibold tracking-tight text-foreground">
          Book Specifications
        </span>
        <div
          role="group"
          aria-label="Unit system"
          className="inline-flex rounded-full border border-input bg-muted/80 p-0.5"
        >
          {(['mm', 'in'] as const).map((unitOption) => {
            const active = params.unit === unitOption;
            return (
              <button
                key={unitOption}
                type="button"
                aria-pressed={active}
                data-testid={`unit-toggle-${unitOption}`}
                onClick={() => update({ unit: unitOption })}
                className={`min-w-10 rounded-full px-2.5 py-0.5 font-mono text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {unitOption}
              </button>
            );
          })}
        </div>
      </div>

      {/* Paperback Presets */}
      <div className="space-y-1.5">
        <Label htmlFor="paperback-preset">Paperback Preset</Label>
        <Select value={activePreset} onValueChange={handlePresetChange}>
          <SelectTrigger id="paperback-preset" data-testid="preset-select">
            <SelectValue placeholder="Choose a preset..." />
          </SelectTrigger>
          <SelectContent>
            {PAPERBACK_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label} ({preset.summary})
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom Dimensions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Primary Paperback Dimensions */}
      <fieldset className="space-y-2.5">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Paperback Dimensions
        </legend>
        <MeasurementField
          label="Height / Length (PB_H)"
          valueMm={params.pbHeightMm}
          unit={params.unit}
          minMm={BOOK_PARAM_BOUNDS.pbHeightMm.min}
          maxMm={BOOK_PARAM_BOUNDS.pbHeightMm.max}
          testId="input-pb-height"
          onCommitMm={(pbHeightMm) => update({ pbHeightMm })}
        />
        <MeasurementField
          label="Width (PB_W)"
          valueMm={params.pbWidthMm}
          unit={params.unit}
          minMm={BOOK_PARAM_BOUNDS.pbWidthMm.min}
          maxMm={BOOK_PARAM_BOUNDS.pbWidthMm.max}
          testId="input-pb-width"
          onCommitMm={(pbWidthMm) => update({ pbWidthMm })}
        />
        <MeasurementField
          label="Spine Thickness (PB_THICK)"
          valueMm={params.pbThicknessMm}
          unit={params.unit}
          minMm={BOOK_PARAM_BOUNDS.pbThicknessMm.min}
          maxMm={BOOK_PARAM_BOUNDS.pbThicknessMm.max}
          testId="input-pb-thickness"
          onCommitMm={(pbThicknessMm) => update({ pbThicknessMm })}
        />
      </fieldset>

      <div className="kettle-stitch-divider" role="separator" />

      {/* Collapsible Construction & Hinge Settings */}
      <Collapsible open={constructionOpen} onOpenChange={setConstructionOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            data-testid="construction-settings-toggle"
            className="flex w-full items-center justify-between rounded-md py-1 text-left text-xs font-semibold uppercase tracking-wider text-foreground hover:text-primary cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Construction &amp; Hinge Settings
            </span>
            {constructionOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <MeasurementField
              label="Hinge Spacer"
              valueMm={params.hingeWidthMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.hingeWidthMm.min}
              maxMm={BOOK_PARAM_BOUNDS.hingeWidthMm.max}
              testId="input-hinge-width"
              onCommitMm={(hingeWidthMm) => update({ hingeWidthMm })}
            />
            <MeasurementField
              label="Chipboard"
              valueMm={params.boardThicknessMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.boardThicknessMm.min}
              maxMm={BOOK_PARAM_BOUNDS.boardThicknessMm.max}
              testId="input-board-thickness"
              onCommitMm={(boardThicknessMm) =>
                onChange(BookParametersModel.withBoardThickness(params, boardThicknessMm))
              }
            />
            <MeasurementField
              label="Top+Btm Overhang"
              valueMm={params.overhangTopBottomMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.overhangTopBottomMm.min}
              maxMm={BOOK_PARAM_BOUNDS.overhangTopBottomMm.max}
              testId="input-overhang-tb"
              onCommitMm={(overhangTopBottomMm) => update({ overhangTopBottomMm })}
            />
            <MeasurementField
              label="Fore Overhang"
              valueMm={params.overhangForeEdgeMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.overhangForeEdgeMm.min}
              maxMm={BOOK_PARAM_BOUNDS.overhangForeEdgeMm.max}
              testId="input-overhang-fore"
              onCommitMm={(overhangForeEdgeMm) => update({ overhangForeEdgeMm })}
            />
            <MeasurementField
              label="Spine Allowance"
              valueMm={params.spineAllowanceMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.spineAllowanceMm.min}
              maxMm={BOOK_PARAM_BOUNDS.spineAllowanceMm.max}
              testId="input-spine-allowance"
              onCommitMm={(spineAllowanceMm) =>
                update({ spineAllowanceMm, spineAllowanceLinked: false })
              }
            />
            <MeasurementField
              label="Turn-In Margin"
              valueMm={params.turnInMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.turnInMm.min}
              maxMm={BOOK_PARAM_BOUNDS.turnInMm.max}
              testId="input-turn-in"
              onCommitMm={(turnInMm) => update({ turnInMm })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <MeasurementField
              label="Pocket Flap"
              valueMm={params.pocketFlapMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.pocketFlapMm.min}
              maxMm={BOOK_PARAM_BOUNDS.pocketFlapMm.max}
              testId="input-pocket-flap"
              onCommitMm={(pocketFlapMm) => update({ pocketFlapMm })}
            />
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="miter-factor">Miter Factor</Label>
                <span className="font-mono text-[11px] text-muted-foreground">× board</span>
              </div>
              <Input
                id="miter-factor"
                type="number"
                step="0.1"
                min={BOOK_PARAM_BOUNDS.miterFactor.min}
                max={BOOK_PARAM_BOUNDS.miterFactor.max}
                value={params.miterFactor}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value);
                  if (Number.isFinite(val)) update({ miterFactor: val });
                }}
                className="font-mono"
              />
            </div>
          </div>

          {/* Pocket Depth Ratio Slider (65%–80%) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="pocket-depth-slider">Inner Pocket Depth</Label>
              <span className="font-mono text-xs text-foreground" data-testid="pocket-depth-value">
                {params.pocketDepthPct}%
              </span>
            </div>
            <Slider
              id="pocket-depth-slider"
              aria-label="Inner Pocket Depth Percentage"
              min={BOOK_PARAM_BOUNDS.pocketDepthPct.min}
              max={BOOK_PARAM_BOUNDS.pocketDepthPct.max}
              step={1}
              value={[params.pocketDepthPct]}
              onValueChange={([pocketDepthPct]) => update({ pocketDepthPct })}
            />
          </div>

          {/* Bleed Toggle + Margin */}
          <div className="space-y-2 rounded-md border border-border/80 bg-secondary/35 p-2.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="bleed-toggle">Outer Artwork Bleed</Label>
              <Switch
                id="bleed-toggle"
                data-testid="bleed-toggle"
                checked={params.includeBleed}
                onCheckedChange={(includeBleed) => update({ includeBleed })}
              />
            </div>
            {params.includeBleed && (
              <MeasurementField
                label="Bleed Margin"
                valueMm={params.bleedMm}
                unit={params.unit}
                minMm={BOOK_PARAM_BOUNDS.bleedMm.min}
                maxMm={BOOK_PARAM_BOUNDS.bleedMm.max}
                testId="input-bleed"
                onCommitMm={(bleedMm) => update({ bleedMm })}
              />
            )}
          </div>

          {/* 3-Piece Quarter-Bound Split Toggle */}
          <div className="space-y-2 rounded-md border border-border/80 bg-secondary/35 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label htmlFor="split-mode-toggle">3-Piece Quarter-Bound Split</Label>
                <p className="text-[11px] text-muted-foreground">
                  Separate Front, Back &amp; Spine panels for desktop printers
                </p>
              </div>
              <Switch
                id="split-mode-toggle"
                data-testid="split-mode-toggle"
                checked={params.splitMode === 'three-piece'}
                onCheckedChange={(checked) =>
                  update({ splitMode: checked ? 'three-piece' : 'single' })
                }
              />
            </div>
            {params.splitMode === 'three-piece' && (
              <MeasurementField
                label="Spine Cloth Overlap"
                valueMm={params.quarterBoundOverlapMm}
                unit={params.unit}
                minMm={BOOK_PARAM_BOUNDS.quarterBoundOverlapMm.min}
                maxMm={BOOK_PARAM_BOUNDS.quarterBoundOverlapMm.max}
                testId="input-quarter-overlap"
                onCommitMm={(quarterBoundOverlapMm) => update({ quarterBoundOverlapMm })}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="kettle-stitch-divider" role="separator" />

      {/* PDF Page Size Selector */}
      <div className="space-y-1.5">
        <Label htmlFor="pdf-page-size">Inner Envelopes PDF Sheet Size</Label>
        <Select
          value={params.pdfPageSize}
          onValueChange={(val) => update({ pdfPageSize: val as PageSizeId })}
        >
          <SelectTrigger id="pdf-page-size" data-testid="pdf-page-size-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(PAGE_SIZES).map((size) => (
              <SelectItem key={size.id} value={size.id}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Validation Notices */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div
          role="status"
          className="space-y-1 rounded-md border border-amber-600/30 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200"
        >
          {[...validation.errors, ...validation.warnings].map((msg) => (
            <p key={msg} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{msg}</span>
            </p>
          ))}
        </div>
      )}

      <div className="kettle-stitch-divider" role="separator" />

      {/* Project JSON Save / Load / Reset */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Project File
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportJson}
            data-testid="export-json-btn"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export .json
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => importInputRef.current?.click()}
            data-testid="import-json-btn"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Import .json
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="Import project JSON file"
            data-testid="import-json-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportJson(file);
                e.target.value = '';
              }
            }}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={onResetDefaults}
          data-testid="reset-defaults-btn"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset to Defaults
        </Button>
      </div>
    </aside>
  );
}
