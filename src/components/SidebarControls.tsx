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
import { BindingStyleIcon } from '@/components/BindingStyleIcon';
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
import { evaluateFlapDepth, resolveBindingStrategy } from '@/core/bindingStyles';
import { calculateMaxSlipFlapForSheetMm, resolveSlipFlapWidthMm } from '@/core/geometry';
import {
  CUSTOM_ROLL_WIDTH_BOUNDS,
  loadSavedCustomRollWidthMm,
  saveCustomRollWidthMm,
} from '@/core/printerMargins';
import { A4_SHEET, ROLL_TOTAL_MARGIN_MM, US_LETTER_SHEET } from '@/resources/paperSpecs';
import {
  BINDING_STYLES,
  BOOK_PARAM_BOUNDS,
  BookParametersModel,
  PAGE_SIZES,
  PAPERBACK_PRESETS,
  PRINT_MEDIA_OPTIONS,
  getPrintMediaSpec,
  type BindingStyle,
  type BookParameters,
  type PageSizeId,
  type PaperbackPresetId,
  type PrintMediaId,
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
  readonly ledgerCode?: string;
  readonly valueMm: number;
  readonly unit: UnitSystem;
  readonly minMm: number;
  readonly maxMm: number;
  readonly testId?: string;
  readonly compactRow?: boolean;
  readonly onCommitMm: (mm: number) => void;
}

function MeasurementField({
  label,
  ledgerCode,
  valueMm,
  unit,
  minMm,
  maxMm,
  testId,
  compactRow = false,
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

  const inputEl = (
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
      className={compactRow ? 'h-7 px-2 text-right font-mono text-xs' : 'font-mono'}
    />
  );

  if (compactRow) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_86px] items-center gap-2 px-2.5 py-1.5">
        <div className="min-w-0">
          <Label htmlFor={inputId} className="block truncate text-xs font-medium text-foreground">
            {label}
          </Label>
          {ledgerCode && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {ledgerCode} · {unit}
            </span>
          )}
        </div>
        {inputEl}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>
      </div>
      {inputEl}
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

  const strategy = resolveBindingStrategy(params);
  const { capabilities, flapConfig } = strategy;
  const pocketMode = params.softcoverPocketMode ?? 'integrated';
  const activePreset = BookParametersModel.detectPreset(params);
  const validation = BookParametersModel.validate(params);
  const effectiveFlapMm = resolveSlipFlapWidthMm(params);
  const flapDepthEval = evaluateFlapDepth(params, params.pbWidthMm, effectiveFlapMm);
  const computeFlapForSheet = (sheetLongMm: number) =>
    strategy.computeMaxFlapWidthForSheet
      ? strategy.computeMaxFlapWidthForSheet(params, sheetLongMm - ROLL_TOTAL_MARGIN_MM)
      : calculateMaxSlipFlapForSheetMm(params, sheetLongMm);
  const letterFlapMm = computeFlapForSheet(US_LETTER_SHEET.longMm);
  const a4FlapMm = computeFlapForSheet(A4_SHEET.longMm);

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
      className="washi-sheet flex flex-col gap-3.5 rounded-md border border-border border-t-2 border-t-vermilion p-3.5 lg:sticky lg:top-[64px] lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto"
    >
      {/* Washi Spec Sheet Title & Sharp Sumi-Ink Unit Toggle */}
      <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-2.5">
        <div>
          <span className="block font-serif text-base font-semibold leading-tight tracking-tight text-foreground">
            Book Specifications
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
            SPEC LEDGER · 01
          </span>
        </div>
        <div
          role="group"
          aria-label="Unit system"
          className="inline-flex rounded-[3px] border border-input bg-secondary/80 p-0.5"
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
                className={`min-w-9 rounded-[2px] px-2 py-0.5 font-mono text-xs font-medium motion-safe:transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {unitOption}
              </button>
            );
          })}
        </div>
      </div>

      {/* Binding Style Selector + Architectural Cross-Section Diagrams */}
      <div className="space-y-2">
        <Label htmlFor="binding-style">Binding Style</Label>
        <div
          role="group"
          aria-label="Binding style quick diagrams"
          className="grid grid-cols-5 gap-1"
        >
          {BINDING_STYLES.map((style) => {
            const active = params.bindingStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                aria-pressed={active}
                aria-label={style.label}
                title={style.label}
                data-testid={`binding-diagram-${style.id}`}
                onClick={() => update({ bindingStyle: style.id })}
                className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-[2px] border px-0.5 py-1 motion-safe:transition-colors ${
                  active
                    ? 'border-vermilion bg-card text-foreground shadow-2xs ring-1 ring-vermilion/30'
                    : 'border-border/80 bg-secondary/40 text-muted-foreground hover:border-foreground/35 hover:bg-card/80 hover:text-foreground'
                }`}
              >
                <BindingStyleIcon style={style.id} className="h-5 w-9" showLabel />
              </button>
            );
          })}
        </div>
        <Select
          value={params.bindingStyle}
          onValueChange={(val) => update({ bindingStyle: val as BindingStyle })}
        >
          <SelectTrigger id="binding-style" data-testid="binding-style-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BINDING_STYLES.map((style) => (
              <SelectItem key={style.id} value={style.id}>
                {style.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-snug text-muted-foreground">{strategy.summary}</p>
        {params.pbThicknessMm < 8 && capabilities.hasRigidSpine && (
          <button
            type="button"
            data-testid="recommend-flexible-spine-btn"
            onClick={() => update({ bindingStyle: 'flexible-spine' })}
            className="w-full cursor-pointer rounded-md border border-brass/50 bg-brass/10 px-2.5 py-1.5 text-left text-[11px] font-medium text-foreground motion-safe:transition-colors hover:bg-brass/20"
          >
            Tip: Thin book ({params.pbThicknessMm} mm) — switch to{' '}
            <strong className="underline">Flexible Spine</strong>
          </button>
        )}
      </div>

      {/* Pocket Construction Mode (Fold-and-Glue Slip Cover: 1-Piece Integrated Flaps vs Separate 2-Sheet Pockets) */}
      {params.bindingStyle === 'softcover-jacket' && (
        <div
          data-testid="softcover-pocket-mode-controls"
          className="space-y-1.5 rounded-md border border-border/80 bg-secondary/35 p-2.5"
        >
          <span className="text-xs font-medium text-foreground">Pocket Construction</span>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Pocket construction">
            <button
              type="button"
              aria-pressed={pocketMode === 'integrated'}
              data-testid="softcover-pocket-mode-integrated"
              onClick={() => update({ softcoverPocketMode: 'integrated' })}
              className={`cursor-pointer rounded border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                pocketMode === 'integrated'
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              1-Piece Flaps
            </button>
            <button
              type="button"
              aria-pressed={pocketMode === 'separate'}
              data-testid="softcover-pocket-mode-separate"
              onClick={() => update({ softcoverPocketMode: 'separate' })}
              className={`cursor-pointer rounded border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                pocketMode === 'separate'
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Separate Pockets (2-Sheet)
            </button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {pocketMode === 'separate'
              ? 'Seamless outer cover prints on Sheet 1 (zero tape seam); deep fore-edge slip pockets unlock in Inner Pockets & Sheet 2.'
              : 'All-in-one sheet with built-in left/right tuck flaps and 4 wrap-over glue tabs.'}
          </p>
        </div>
      )}

      {/* Adjustable Flap Width Controls (Flap-equipped cover styles: Slip Cover & Classic Dust Jacket) */}
      {capabilities.hasFlaps && flapConfig && flapDepthEval && (
        <div
          data-testid="softcover-flap-controls"
          className="space-y-2 rounded-md border border-border/80 bg-secondary/35 p-2.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <Label htmlFor="jacket-flap-width-slider">{flapConfig.label}</Label>
            <div className="flex items-baseline gap-1.5 font-mono text-[11px]">
              <span className="text-foreground" data-testid="jacket-flap-width-value">
                {UnitConverter.format(effectiveFlapMm, params.unit)}{' '}
                <span className="text-muted-foreground">({flapDepthEval.coverWidthPct}%)</span>
              </span>
              <span
                className={`text-[10px] ${
                  flapDepthEval.isTooShallow
                    ? 'status-warning-text font-semibold'
                    : 'text-muted-foreground'
                }`}
                data-testid="flap-recommended-min"
              >
                Rec. ≥ {UnitConverter.format(flapDepthEval.minRecommendedMm, params.unit)}
              </span>
            </div>
          </div>
          <input
            id="jacket-flap-width-slider"
            type="range"
            min={flapConfig.minMm}
            max={flapConfig.maxMm}
            step={0.5}
            value={effectiveFlapMm}
            data-testid="slider-jacket-flap-width"
            aria-label={flapConfig.label}
            onChange={(e) => {
              const next = Number.parseFloat(e.target.value);
              if (Number.isFinite(next)) {
                update({ jacketFlapWidthMm: next });
              }
            }}
            className="h-2 w-full accent-primary cursor-pointer"
          />
          {flapDepthEval.isTooShallow ? (
            <div
              role="status"
              data-testid="flap-shallow-warning"
              className="status-warning-surface space-y-1.5 rounded-md border p-2 text-[11px] leading-snug"
            >
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Flap is narrower than recommended ({flapDepthEval.coverWidthPct}% of page width;
                  aim for ≥ {UnitConverter.format(flapDepthEval.minRecommendedMm, params.unit)} so
                  the cover doesn&apos;t slip out).
                </span>
              </p>
              <button
                type="button"
                data-testid="flap-set-recommended-btn"
                onClick={() => update({ jacketFlapWidthMm: flapDepthEval.minRecommendedMm })}
                className="status-warning-btn inline-flex cursor-pointer items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold motion-safe:transition-colors"
              >
                Use {UnitConverter.format(flapDepthEval.minRecommendedMm, params.unit)}
              </button>
            </div>
          ) : (
            <p
              data-testid="flap-depth-ok"
              className="text-[11px] leading-snug text-muted-foreground"
            >
              {flapDepthEval.coverWidthPct}% of page width • meets ≥{' '}
              {UnitConverter.format(flapDepthEval.minRecommendedMm, params.unit)} recommendation.
            </p>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              data-testid="flap-preset-letter"
              onClick={() => update({ jacketFlapWidthMm: letterFlapMm })}
              className={`cursor-pointer rounded border px-1.5 py-1 text-[11px] font-medium transition-colors ${
                Math.abs(effectiveFlapMm - letterFlapMm) < 0.05
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Fit Letter
            </button>
            <button
              type="button"
              data-testid="flap-preset-a4"
              onClick={() => update({ jacketFlapWidthMm: a4FlapMm })}
              className={`cursor-pointer rounded border px-1.5 py-1 text-[11px] font-medium transition-colors ${
                Math.abs(effectiveFlapMm - a4FlapMm) < 0.05
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Fit A4
            </button>
            <button
              type="button"
              data-testid="flap-preset-deep"
              onClick={() => update({ jacketFlapWidthMm: flapConfig.presetMm })}
              className={`cursor-pointer rounded border px-1.5 py-1 text-[11px] font-medium transition-colors ${
                Math.abs(effectiveFlapMm - flapConfig.presetMm) < 0.05
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              {flapConfig.presetLabel}
            </button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {capabilities.hasGlueTabs
              ? '24–26 mm fits US Letter on A6; 35–42 mm grips floppy covers best on A4 / Legal.'
              : '50–75 mm gives classic publisher fold-in flaps; use Fit Letter or Fit A4 for 1-sheet printing.'}
          </p>
        </div>
      )}

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

      {/* Primary Paperback Dimensions — Compact Ruled Ledger */}
      <fieldset className="space-y-1.5">
        <legend className="mb-1 flex w-full items-center justify-between gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <span className="truncate">Paperback Dimensions</span>
          <span className="shrink-0 whitespace-nowrap">H · W · SPINE</span>
        </legend>
        <div className="divide-y divide-border/80 rounded-md border border-border/90 bg-card/70">
          <MeasurementField
            label="Height / Length"
            ledgerCode="PB_H"
            valueMm={params.pbHeightMm}
            unit={params.unit}
            minMm={BOOK_PARAM_BOUNDS.pbHeightMm.min}
            maxMm={BOOK_PARAM_BOUNDS.pbHeightMm.max}
            testId="input-pb-height"
            compactRow
            onCommitMm={(pbHeightMm) => update({ pbHeightMm })}
          />
          <MeasurementField
            label="Width"
            ledgerCode="PB_W"
            valueMm={params.pbWidthMm}
            unit={params.unit}
            minMm={BOOK_PARAM_BOUNDS.pbWidthMm.min}
            maxMm={BOOK_PARAM_BOUNDS.pbWidthMm.max}
            testId="input-pb-width"
            compactRow
            onCommitMm={(pbWidthMm) => update({ pbWidthMm })}
          />
          <MeasurementField
            label="Spine Thickness"
            ledgerCode="PB_THICK"
            valueMm={params.pbThicknessMm}
            unit={params.unit}
            minMm={BOOK_PARAM_BOUNDS.pbThicknessMm.min}
            maxMm={BOOK_PARAM_BOUNDS.pbThicknessMm.max}
            testId="input-pb-thickness"
            compactRow
            onCommitMm={(pbThicknessMm) => update({ pbThicknessMm })}
          />
        </div>
      </fieldset>

      {/* Target Print Media Selector */}
      <div className="space-y-1.5">
        <Label htmlFor="print-media">Target Print Media</Label>
        <Select
          value={params.printMedia}
          onValueChange={(val) => {
            const nextMedia = val as PrintMediaId;
            if (nextMedia === 'roll-custom' && params.customRollWidthMm === undefined) {
              update({
                printMedia: nextMedia,
                customRollWidthMm: loadSavedCustomRollWidthMm(),
              });
            } else {
              update({ printMedia: nextMedia });
            }
          }}
        >
          <SelectTrigger id="print-media" data-testid="print-media-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRINT_MEDIA_OPTIONS.map((media) => (
              <SelectItem key={media.id} value={media.id}>
                {media.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {params.printMedia === 'roll-custom' && (
          <div className="rounded-md border border-border/80 bg-secondary/35 p-2.5">
            <MeasurementField
              label="Custom Roll Width"
              valueMm={params.customRollWidthMm ?? CUSTOM_ROLL_WIDTH_BOUNDS.defaultMm}
              unit={params.unit}
              minMm={CUSTOM_ROLL_WIDTH_BOUNDS.minMm}
              maxMm={CUSTOM_ROLL_WIDTH_BOUNDS.maxMm}
              testId="sidebar-custom-roll-width"
              onCommitMm={(customRollWidthMm) => {
                saveCustomRollWidthMm(customRollWidthMm);
                update({ customRollWidthMm });
              }}
            />
          </div>
        )}
        <p className="text-[11px] leading-snug text-muted-foreground">
          {(() => {
            const spec = getPrintMediaSpec(params.printMedia);
            if (spec.kind === 'auto') {
              return 'Exports exact wrap size; choose a sheet size to center or auto-tile.';
            }
            if (spec.kind === 'sheet') {
              return 'Print PDF centers on 1 sheet or auto-tiles across 2 sheets with a 10 mm overlap.';
            }
            return 'Exports exact roll PDF and checks fit against your selected roll width.';
          })()}
        </p>
      </div>

      <div className="kettle-stitch-divider" role="separator" />

      {/* Collapsible Construction & Print Settings */}
      <Collapsible open={constructionOpen} onOpenChange={setConstructionOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            data-testid="construction-settings-toggle"
            className="flex w-full items-center justify-between rounded-md py-1 text-left text-xs font-semibold uppercase tracking-wider text-foreground hover:text-primary cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {capabilities.usesChipboard
                ? 'Construction & Hinge Settings'
                : 'Print & Bleed Settings'}
            </span>
            {constructionOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {capabilities.usesChipboard && (
            <div className="grid grid-cols-2 gap-2.5">
              {capabilities.hasHingeSpacers && (
                <MeasurementField
                  label="Hinge Spacer"
                  valueMm={params.hingeWidthMm}
                  unit={params.unit}
                  minMm={BOOK_PARAM_BOUNDS.hingeWidthMm.min}
                  maxMm={BOOK_PARAM_BOUNDS.hingeWidthMm.max}
                  testId="input-hinge-width"
                  onCommitMm={(hingeWidthMm) => update({ hingeWidthMm })}
                />
              )}
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
              {capabilities.hasRigidSpine && (
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
              )}
              {capabilities.hasTurnIns && (
                <MeasurementField
                  label="Turn-In Margin"
                  valueMm={params.turnInMm}
                  unit={params.unit}
                  minMm={BOOK_PARAM_BOUNDS.turnInMm.min}
                  maxMm={BOOK_PARAM_BOUNDS.turnInMm.max}
                  testId="input-turn-in"
                  onCommitMm={(turnInMm) => update({ turnInMm })}
                />
              )}
            </div>
          )}

          {(capabilities.usesInnerPockets || capabilities.hasTurnIns) && (
            <div className="grid grid-cols-2 gap-2.5">
              {capabilities.usesInnerPockets && (
                <MeasurementField
                  label="Pocket Flap"
                  valueMm={params.pocketFlapMm}
                  unit={params.unit}
                  minMm={BOOK_PARAM_BOUNDS.pocketFlapMm.min}
                  maxMm={BOOK_PARAM_BOUNDS.pocketFlapMm.max}
                  testId="input-pocket-flap"
                  onCommitMm={(pocketFlapMm) => update({ pocketFlapMm })}
                />
              )}
              {capabilities.hasTurnIns && (
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
              )}
            </div>
          )}

          {/* Pocket Depth Ratio Slider (65%–80%, styles with separate inner pockets) */}
          {capabilities.usesInnerPockets && (
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
          )}

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

          {/* 3-Piece Quarter-Bound Split Toggle (hardcover / flexible-spine only) */}
          {capabilities.supportsThreePieceSplit && (
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
          )}
        </CollapsibleContent>
      </Collapsible>

      {capabilities.usesInnerPockets && (
        <>
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
        </>
      )}

      {/* Validation Notices */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div
          role="status"
          className="status-warning-surface space-y-1 rounded-md border p-2.5 text-xs font-medium"
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
