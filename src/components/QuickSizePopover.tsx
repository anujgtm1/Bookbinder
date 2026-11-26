import { AlertTriangle, ArrowRight, ChevronDown, Ruler } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { BindingStyleIcon } from '@/components/BindingStyleIcon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  evaluateFlapDepth,
  listBindingStrategies,
  resolveBindingStrategy,
} from '@/core/bindingStyles';
import { resolveSlipFlapWidthMm } from '@/core/geometry';
import {
  BOOK_PARAM_BOUNDS,
  BookParametersModel,
  PAPERBACK_PRESETS,
  type BookParameters,
  type PaperbackPresetId,
} from '@/types/bookParams';
import { UnitConverter, type UnitSystem } from '@/types/units';

export interface QuickSizePopoverProps {
  readonly params: BookParameters;
  readonly onChange: (next: BookParameters) => void;
  readonly onOpenMeasureBench: () => void;
}

function supportsNativePopoverApi(): boolean {
  return typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
}

interface CompactDimInputProps {
  readonly label: string;
  readonly valueMm: number;
  readonly unit: UnitSystem;
  readonly minMm: number;
  readonly maxMm: number;
  readonly testId: string;
  readonly onCommitMm: (mm: number) => void;
}

function CompactDimInput({
  label,
  valueMm,
  unit,
  minMm,
  maxMm,
  testId,
  onCommitMm,
}: CompactDimInputProps) {
  const inputId = useId();
  const formatted = UnitConverter.formatValue(valueMm, unit);
  const [draft, setDraft] = useState(formatted);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatted);
    }
  }, [formatted, focused]);

  const minDisplay = UnitConverter.toDisplay(minMm, unit);
  const maxDisplay = UnitConverter.toDisplay(maxMm, unit);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <Label htmlFor={inputId} className="text-[11px] font-medium text-foreground">
          {label}
        </Label>
        <span className="font-mono text-[10px] text-muted-foreground">{unit}</span>
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
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
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
        className="h-8 px-2 text-right font-mono text-xs"
      />
    </div>
  );
}

export function QuickSizePopover({
  params,
  onChange,
  onOpenMeasureBench,
}: QuickSizePopoverProps) {
  const popoverId = useId();
  const presetSelectId = useId();
  const flapSliderId = useId();
  const hasNativePopover = supportsNativePopoverApi();
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const strategy = resolveBindingStrategy(params);
  const strategies = listBindingStrategies();
  const activePreset = BookParametersModel.detectPreset(params);
  const pocketMode = params.softcoverPocketMode ?? 'integrated';
  const effectiveFlapMm = resolveSlipFlapWidthMm(params);
  const flapDepthEval = evaluateFlapDepth(params, params.pbWidthMm, effectiveFlapMm);

  useEffect(() => {
    if (hasNativePopover || !fallbackOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFallbackOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFallbackOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [hasNativePopover, fallbackOpen]);

  const update = (patch: Partial<BookParameters>) => {
    onChange(BookParametersModel.clampAndNormalize({ ...params, ...patch }));
  };

  const handlePresetChange = (value: string) => {
    if (value === 'custom') return;
    onChange(
      BookParametersModel.applyPreset(params, value as Exclude<PaperbackPresetId, 'custom'>),
    );
  };

  const closePopover = () => {
    if (hasNativePopover) {
      const el = popoverRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
      try {
        el?.hidePopover?.();
      } catch {
        // Ignore if already closed
      }
    } else {
      setFallbackOpen(false);
    }
  };

  const formattedDims = `${UnitConverter.formatValue(params.pbWidthMm, params.unit)} × ${UnitConverter.formatValue(params.pbHeightMm, params.unit)} × ${UnitConverter.formatValue(params.pbThicknessMm, params.unit)} ${params.unit}`;

  return (
    <div ref={containerRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        data-testid="quick-size-trigger"
        popoverTarget={hasNativePopover ? popoverId : undefined}
        onClick={hasNativePopover ? undefined : () => setFallbackOpen((open) => !open)}
        aria-label={`Quick size and binding: ${strategy.shortLabel}, ${formattedDims}`}
        title="Quickly adjust book dimensions, preset, or binding style"
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[3px] border border-border bg-card/85 px-2.5 text-xs font-medium text-foreground motion-safe:transition-colors hover:border-brass hover:bg-accent/60"
      >
        <Ruler className="h-3.5 w-3.5 shrink-0 text-brass" aria-hidden="true" />
        <span className="max-w-28 truncate font-medium sm:max-w-none">{strategy.shortLabel}</span>
        <span aria-hidden="true" className="text-muted-foreground/50">
          ·
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{formattedDims}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover={hasNativePopover ? 'auto' : undefined}
        hidden={!hasNativePopover && !fallbackOpen}
        data-testid="quick-size-popover"
        className={
          hasNativePopover
            ? 'atelier-popover w-[340px] sm:w-[370px]'
            : `atelier-popover-fallback w-[340px] sm:w-[370px] ${fallbackOpen ? ':popover-open' : ''}`
        }
      >
        <div className="space-y-3 p-3.5">
          {/* Header & Unit Toggle */}
          <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-2">
            <div>
              <span className="block font-serif text-sm font-semibold leading-tight text-foreground">
                Book Size &amp; Binding
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Live cover &amp; cut recalculation
              </span>
            </div>
            <div
              role="group"
              aria-label="Quick unit system"
              className="inline-flex rounded-[3px] border border-input bg-secondary/80 p-0.5"
            >
              {(['mm', 'in'] as const).map((unitOption) => {
                const active = params.unit === unitOption;
                return (
                  <button
                    key={unitOption}
                    type="button"
                    aria-pressed={active}
                    data-testid={`quick-size-unit-${unitOption}`}
                    onClick={() => update({ unit: unitOption })}
                    className={`min-w-8 cursor-pointer rounded-[2px] px-2 py-0.5 font-mono text-[11px] font-medium motion-safe:transition-colors ${
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

          {/* 5 Architectural Binding Style Buttons */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">Binding Style</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {strategy.shortLabel}
              </span>
            </div>
            <div
              role="group"
              aria-label="Quick binding style"
              className="grid grid-cols-5 gap-1"
            >
              {strategies.map((style) => {
                const active = params.bindingStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={style.label}
                    title={style.label}
                    data-testid={`quick-size-binding-${style.id}`}
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
          </div>

          {/* Conditional Slip Cover Pocket Mode Toggle */}
          {params.bindingStyle === 'softcover-jacket' && (
            <div
              data-testid="quick-size-pocket-mode"
              className="space-y-1 rounded-md border border-border/80 bg-secondary/35 p-2"
            >
              <span className="text-[11px] font-medium text-foreground">Pocket Construction</span>
              <div
                className="grid grid-cols-2 gap-1.5"
                role="group"
                aria-label="Quick pocket construction"
              >
                <button
                  type="button"
                  aria-pressed={pocketMode === 'integrated'}
                  data-testid="quick-size-pocket-mode-integrated"
                  onClick={() => update({ softcoverPocketMode: 'integrated' })}
                  className={`cursor-pointer rounded border px-2 py-1 text-[11px] font-medium motion-safe:transition-colors ${
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
                  data-testid="quick-size-pocket-mode-separate"
                  onClick={() => update({ softcoverPocketMode: 'separate' })}
                  className={`cursor-pointer rounded border px-2 py-1 text-[11px] font-medium motion-safe:transition-colors ${
                    pocketMode === 'separate'
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  Separate (2-Sheet)
                </button>
              </div>
            </div>
          )}

          {/* Conditional Flap Width Slider */}
          {strategy.capabilities.hasFlaps && strategy.flapConfig && flapDepthEval && (
            <div
              data-testid="quick-size-flap-controls"
              className="space-y-1.5 rounded-md border border-border/80 bg-secondary/35 p-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={flapSliderId} className="text-[11px]">
                  {strategy.flapConfig.label}
                </Label>
                <span className="font-mono text-[11px] text-foreground">
                  {UnitConverter.format(effectiveFlapMm, params.unit)} ({flapDepthEval.coverWidthPct}
                  %)
                </span>
              </div>
              <input
                id={flapSliderId}
                type="range"
                min={strategy.flapConfig.minMm}
                max={strategy.flapConfig.maxMm}
                step={0.5}
                value={effectiveFlapMm}
                data-testid="quick-size-flap-slider"
                aria-label={strategy.flapConfig.label}
                onChange={(e) => {
                  const next = Number.parseFloat(e.target.value);
                  if (Number.isFinite(next)) {
                    update({ jacketFlapWidthMm: next });
                  }
                }}
                className="h-2 w-full cursor-pointer accent-primary"
              />
              {flapDepthEval.isTooShallow && (
                <p className="status-warning-text flex items-center gap-1 text-[10.5px] font-medium">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>
                    Aim for ≥ {UnitConverter.format(flapDepthEval.minRecommendedMm, params.unit)}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Paperback Preset Select */}
          <div className="space-y-1">
            <Label htmlFor={presetSelectId} className="text-xs font-medium text-foreground">
              Paperback Preset
            </Label>
            <select
              id={presetSelectId}
              data-testid="quick-size-preset-select"
              value={activePreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="h-8 w-full rounded-[3px] border border-input bg-card px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {PAPERBACK_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} ({preset.summary})
                </option>
              ))}
              <option value="custom">Custom Dimensions</option>
            </select>
          </div>

          {/* Dimensions Grid */}
          <div className="grid grid-cols-3 gap-2">
            <CompactDimInput
              label="Height"
              valueMm={params.pbHeightMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.pbHeightMm.min}
              maxMm={BOOK_PARAM_BOUNDS.pbHeightMm.max}
              testId="quick-size-pb-height"
              onCommitMm={(pbHeightMm) => update({ pbHeightMm })}
            />
            <CompactDimInput
              label="Width"
              valueMm={params.pbWidthMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.pbWidthMm.min}
              maxMm={BOOK_PARAM_BOUNDS.pbWidthMm.max}
              testId="quick-size-pb-width"
              onCommitMm={(pbWidthMm) => update({ pbWidthMm })}
            />
            <CompactDimInput
              label="Spine"
              valueMm={params.pbThicknessMm}
              unit={params.unit}
              minMm={BOOK_PARAM_BOUNDS.pbThicknessMm.min}
              maxMm={BOOK_PARAM_BOUNDS.pbThicknessMm.max}
              testId="quick-size-pb-thickness"
              onCommitMm={(pbThicknessMm) => update({ pbThicknessMm })}
            />
          </div>

          {/* Open Full Measure Bench CTA */}
          <div className="border-t border-border/80 pt-2">
            <button
              type="button"
              data-testid="quick-size-open-measure-btn"
              onClick={() => {
                closePopover();
                onOpenMeasureBench();
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-[3px] border border-brass/45 bg-brass/10 px-2.5 py-1.5 text-xs font-medium text-foreground motion-safe:transition-colors hover:border-brass hover:bg-brass/20"
            >
              <span>Open Measure Bench</span>
              <ArrowRight className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
