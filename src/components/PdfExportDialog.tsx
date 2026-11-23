import { Download, FileText, Printer, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { PdfSheetPreviewSvg } from '@/components/PdfSheetPreviewSvg';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getBindingStrategy } from '@/core/bindingStyles';
import { evaluatePrintMediaFit } from '@/core/geometry';
import { planInnerTemplateLayout } from '@/core/pdfExport';
import {
  PAGE_SIZES,
  PRINT_MEDIA_OPTIONS,
  type PageSizeId,
  type PrintMediaId,
  type SplitMode,
} from '@/types/bookParams';
import type { CaseGeometry, PrintMediaFitEvaluation } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export type PdfExportTarget =
  | 'cover-styled'
  | 'outer-blueprint'
  | 'inner-styled'
  | 'inner-blueprint';

export interface PdfExportSelection {
  readonly target: PdfExportTarget;
  readonly printMediaId: PrintMediaId;
  readonly pageSizeId: PageSizeId;
  readonly splitMode: SplitMode;
  readonly includeGuides: boolean;
  readonly includeScaleBar: boolean;
  readonly includeLegend: boolean;
  readonly dpi: 300 | 600;
  readonly tileOverlapMm: number;
}

export interface OuterPdfExportOptions {
  readonly splitMode?: SplitMode;
  readonly printMediaId?: PrintMediaId;
  readonly tileOverlapMm?: number;
  readonly includeScaleBar?: boolean;
}

export interface InnerPdfExportOptions {
  readonly pageSizeId?: PageSizeId;
  readonly includeLegend?: boolean;
}

export interface PdfExportDialogProps {
  readonly open: boolean;
  readonly target: PdfExportTarget;
  readonly geometry: CaseGeometry;
  readonly unit: UnitSystem;
  readonly printMediaId: PrintMediaId;
  readonly onChangePrintMedia: (mediaId: PrintMediaId) => void;
  readonly pageSizeId: PageSizeId;
  readonly onChangePageSize: (sizeId: PageSizeId) => void;
  readonly splitMode: SplitMode;
  readonly onChangeSplitMode?: (mode: SplitMode) => void;
  readonly onReduceFlapWidth?: (widthMm: number) => void;
  readonly defaultIncludeGuides?: boolean;
  readonly defaultIncludeLegend?: boolean;
  readonly exporting?: boolean;
  readonly onConfirmExport: (selection: PdfExportSelection) => void | Promise<void>;
  readonly onClose: () => void;
}

interface PrimaryOuterMediaCard {
  readonly id: PrintMediaId;
  readonly title: string;
  readonly sublabel: string;
}

const PRIMARY_OUTER_MEDIA_CARDS: readonly PrimaryOuterMediaCard[] = [
  { id: 'letter', title: 'US Letter', sublabel: '8.5 × 11 in' },
  { id: 'a4', title: 'A4', sublabel: '210 × 297 mm' },
  { id: 'legal', title: 'US Legal', sublabel: '8.5 × 14 in' },
  { id: 'tabloid', title: 'Tabloid', sublabel: '11 × 17 in' },
  { id: 'exact-auto', title: 'Exact 1:1 Size', sublabel: 'Auto / Roll' },
];

const INNER_PAGE_CARDS: readonly {
  readonly id: PageSizeId;
  readonly title: string;
  readonly sublabel: string;
}[] = [
  { id: 'letter', title: 'US Letter', sublabel: '8.5 × 11 in' },
  { id: 'a4', title: 'A4', sublabel: '210 × 297 mm' },
  { id: 'legal', title: 'US Legal', sublabel: '8.5 × 14 in' },
  { id: 'tabloid', title: 'Tabloid', sublabel: '11 × 17 in' },
];

const ROLL_MEDIA_OPTIONS = PRINT_MEDIA_OPTIONS.filter((opt) => opt.kind === 'roll');
const OVERLAP_CHOICES = [10, 15, 20] as const;

const TARGET_TITLES: Record<PdfExportTarget, string> = {
  'cover-styled': 'Print Cover PDF',
  'outer-blueprint': 'Cutting Blueprint PDF',
  'inner-styled': 'Styled Inner Pockets PDF',
  'inner-blueprint': 'Inner Pockets Cut PDF',
};

const TARGET_SUBTITLES: Record<PdfExportTarget, string> = {
  'cover-styled': '100% actual size cover artwork & vector typography with live paper-fit preview.',
  'outer-blueprint': '1:1 physical mm structural cutting template with fold guides and miter marks.',
  'inner-styled': '300 DPI styled inner slip-in pockets & spine liner auto-paginated to your paper.',
  'inner-blueprint': '1:1 physical mm unstyled cutting blueprints for inner pockets & spine liner.',
};

function renderFitBadge(fit: PrintMediaFitEvaluation) {
  if (fit.mediaId === 'exact-auto') {
    return (
      <Badge variant="brass" className="rounded-full px-1.5 py-0 text-[10px]">
        1:1 exact
      </Badge>
    );
  }
  if (fit.status === 'fits-1-sheet') {
    return (
      <Badge variant="success" className="rounded-full px-1.5 py-0 text-[10px]">
        1 sheet
      </Badge>
    );
  }
  if (fit.status === 'fits-2-sheet-tile') {
    return (
      <Badge variant="warning" className="rounded-full px-1.5 py-0 text-[10px]">
        2 sheets (tiled)
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="rounded-full px-1.5 py-0 text-[10px]">
      Doesn&apos;t fit
    </Badge>
  );
}

/**
 * Native modal <dialog closedby="any"> for unified Print & Export PDF across Bookbinder Studio.
 * Lets users compare desktop sheets & rolls live, inspect a mini sheet layout diagram,
 * adjust print options, and export 1:1 mm PDFs.
 */
export function PdfExportDialog({
  open,
  target,
  geometry,
  unit,
  printMediaId,
  onChangePrintMedia,
  pageSizeId,
  onChangePageSize,
  splitMode,
  onChangeSplitMode,
  onReduceFlapWidth,
  defaultIncludeGuides = true,
  defaultIncludeLegend = false,
  exporting = false,
  onConfirmExport,
  onClose,
}: PdfExportDialogProps) {
  const titleId = useId();
  const guidesSwitchId = useId();
  const scaleBarSwitchId = useId();
  const legendSwitchId = useId();
  const rollSelectId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [includeGuides, setIncludeGuides] = useState(defaultIncludeGuides);
  const [includeScaleBar, setIncludeScaleBar] = useState(true);
  const [includeLegend, setIncludeLegend] = useState(defaultIncludeLegend);
  const [dpi, setDpi] = useState<300 | 600>(300);
  const [tileOverlapMm, setTileOverlapMm] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOuterTarget = target === 'cover-styled' || target === 'outer-blueprint';
  const isRollSelected = ROLL_MEDIA_OPTIONS.some((opt) => opt.id === printMediaId);
  const bindingStrategy = getBindingStrategy(geometry.bindingStyle);
  const effectiveSplitMode: SplitMode = bindingStrategy.capabilities.supportsThreePieceSplit
    ? splitMode
    : 'single';

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function') {
      if (dialog.open) {
        dialog.close();
      } else {
        onClose();
      }
    } else {
      dialog?.removeAttribute('open');
      onClose();
    }
  }, [onClose]);

  // Sync open prop with native dialog.showModal() / dialog.close() and initialize toggle defaults
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setIncludeGuides(defaultIncludeGuides);
      setIncludeLegend(defaultIncludeLegend);
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open, defaultIncludeGuides, defaultIncludeLegend]);

  // Light-dismiss fallback for browsers without native HTMLDialogElement closedby support
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) {
      return;
    }

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          dialog.removeAttribute('open');
          onClose();
        }
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [onClose]);

  const wrapW = geometry.outerWrap.widthMm;
  const wrapH = geometry.outerWrap.heightMm;

  const outerFitsByMedia = useMemo(() => {
    const map = new Map<PrintMediaId, PrintMediaFitEvaluation>();
    for (const opt of PRINT_MEDIA_OPTIONS) {
      map.set(opt.id, evaluatePrintMediaFit(opt.id, wrapW, wrapH, tileOverlapMm));
    }
    return map;
  }, [wrapW, wrapH, tileOverlapMm]);

  const activeFit = useMemo(
    () =>
      outerFitsByMedia.get(printMediaId) ??
      evaluatePrintMediaFit(printMediaId, wrapW, wrapH, tileOverlapMm),
    [outerFitsByMedia, printMediaId, wrapW, wrapH, tileOverlapMm],
  );

  const innerPlansByPage = useMemo(() => {
    const map = new Map<PageSizeId, ReturnType<typeof planInnerTemplateLayout>>();
    for (const card of INNER_PAGE_CARDS) {
      map.set(card.id, planInnerTemplateLayout(geometry, card.id, { includeLegend }));
    }
    return map;
  }, [geometry, includeLegend]);

  const activeInnerPlan = useMemo(
    () =>
      innerPlansByPage.get(pageSizeId) ??
      planInnerTemplateLayout(geometry, pageSizeId, { includeLegend }),
    [innerPlansByPage, geometry, pageSizeId, includeLegend],
  );

  const isBlockedUnfitted =
    isOuterTarget &&
    effectiveSplitMode === 'single' &&
    printMediaId !== 'exact-auto' &&
    activeFit.status === 'does-not-fit';
  const isBusy = Boolean(exporting || isSubmitting);
  const isConfirmDisabled = isBusy || isBlockedUnfitted;

  const summaryText = useMemo(() => {
    if (!isOuterTarget) {
      const pageWord = activeInnerPlan.pageCount === 1 ? 'page' : 'pages';
      const sizeLabel = PAGE_SIZES[pageSizeId].label;
      const legendSuffix = includeLegend ? ' • with 50 mm legend' : '';
      const modeSuffix = target === 'inner-styled' ? ' • 300 DPI' : ' • 1:1 mm';
      return `${activeInnerPlan.pageCount} ${pageWord} • ${sizeLabel}${legendSuffix}${modeSuffix}`;
    }

    const dpiSuffix = target === 'cover-styled' ? ` • ${dpi} DPI` : ' • 1:1 mm';
    if (effectiveSplitMode === 'three-piece') {
      return `3 pages • 3-Piece Split (Back, Spine, Front)${dpiSuffix}`;
    }
    if (isBlockedUnfitted) {
      return `Cover exceeds ${activeFit.mediaLabel} — choose a larger paper or split layout`;
    }
    if (printMediaId === 'exact-auto') {
      return `1 page • Exact 1:1 Size (${roundTo(wrapW, 1)} × ${roundTo(wrapH, 1)} mm)${dpiSuffix}`;
    }
    if (activeFit.status === 'fits-1-sheet' && activeFit.sheetPageWidthMm && activeFit.sheetPageHeightMm) {
      const orient =
        activeFit.sheetPageWidthMm > activeFit.sheetPageHeightMm ? 'Landscape' : 'Portrait';
      return `1 page • ${activeFit.mediaLabel} ${orient} (centered)${dpiSuffix}`;
    }
    if (
      activeFit.status === 'fits-2-sheet-tile' &&
      activeFit.sheetPageWidthMm &&
      activeFit.sheetPageHeightMm
    ) {
      const orient =
        activeFit.sheetPageWidthMm > activeFit.sheetPageHeightMm ? 'Landscape' : 'Portrait';
      return `2 pages • ${activeFit.mediaLabel} ${orient} (tiled, ${tileOverlapMm} mm overlap)${dpiSuffix}`;
    }
    return `1 page • ${activeFit.mediaLabel} (1:1 mm)${dpiSuffix}`;
  }, [
    isOuterTarget,
    activeInnerPlan.pageCount,
    pageSizeId,
    includeLegend,
    target,
    dpi,
    effectiveSplitMode,
    isBlockedUnfitted,
    activeFit,
    printMediaId,
    wrapW,
    wrapH,
    tileOverlapMm,
  ]);

  const handleConfirm = async () => {
    if (isConfirmDisabled) return;
    const selection: PdfExportSelection = {
      target,
      printMediaId,
      pageSizeId,
      splitMode: effectiveSplitMode,
      includeGuides,
      includeScaleBar,
      includeLegend,
      dpi,
      tileOverlapMm,
    };
    setIsSubmitting(true);
    try {
      await onConfirmExport(selection);
      requestClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const canToggleSplitMode =
    isOuterTarget &&
    bindingStrategy.capabilities.supportsThreePieceSplit &&
    Boolean(onChangeSplitMode);
  const showTileOverlapControl =
    isOuterTarget && effectiveSplitMode === 'single' && activeFit.status === 'fits-2-sheet-tile';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="pdf-export-dialog"
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onClose();
      }}
      className="bindery-modal m-auto max-h-[92vh] w-[min(95vw,840px)] overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl"
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={titleId}
                  className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight text-foreground"
                >
                  {isOuterTarget ? (
                    <Printer className="h-4 w-4 text-brass" aria-hidden="true" />
                  ) : (
                    <FileText className="h-4 w-4 text-brass" aria-hidden="true" />
                  )}
                  {TARGET_TITLES[target]}
                </h2>
                <Badge variant="outline" className="rounded-full font-mono text-[11px]">
                  {isOuterTarget
                    ? UnitConverter.formatDimensions(wrapW, wrapH, unit)
                    : `Pockets ${UnitConverter.formatDimensions(
                        geometry.frontPocket.totalWidthMm,
                        geometry.frontPocket.totalHeightMm,
                        unit,
                      )} • Liner ${UnitConverter.formatDimensions(
                        geometry.spineLiner.widthMm,
                        geometry.spineLiner.heightMm,
                        unit,
                      )}`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{TARGET_SUBTITLES[target]}</p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Close export PDF dialog"
              data-testid="pdf-export-close-btn"
              onClick={requestClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Scrollable Body */}
          <div className="flex flex-col gap-4 overflow-y-auto p-5">
            {/* Section 1: Paper / Print Media Picker */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isOuterTarget ? 'Paper Size & Print Media' : 'PDF Sheet Size'}
                </Label>
                {isOuterTarget && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={rollSelectId}
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Wide Roll:
                    </label>
                    <select
                      id={rollSelectId}
                      data-testid="pdf-export-roll-select"
                      value={isRollSelected ? printMediaId : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          onChangePrintMedia(val as PrintMediaId);
                        }
                      }}
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <option value="">Large-Format Roll…</option>
                      {ROLL_MEDIA_OPTIONS.map((roll) => {
                        const rollFit = outerFitsByMedia.get(roll.id);
                        const suffix =
                          rollFit?.status === 'fits-roll' ? ' (Fits)' : ' (Too narrow)';
                        return (
                          <option key={roll.id} value={roll.id}>
                            {roll.label}
                            {suffix}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>

              {isOuterTarget ? (
                <div
                  data-testid="pdf-export-media-grid"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
                >
                  {PRIMARY_OUTER_MEDIA_CARDS.map((card, index) => {
                    const fit = outerFitsByMedia.get(card.id)!;
                    const selected = printMediaId === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        autoFocus={index === 0}
                        aria-pressed={selected}
                        data-testid={`pdf-media-option-${card.id}`}
                        onClick={() => onChangePrintMedia(card.id)}
                        className={`flex cursor-pointer flex-col items-start justify-between gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                            : 'border-border bg-secondary/30 hover:border-brass/60 hover:bg-secondary/60'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-foreground">{card.title}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {card.sublabel}
                          </div>
                        </div>
                        {renderFitBadge(fit)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  data-testid="pdf-export-media-grid"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {INNER_PAGE_CARDS.map((card, index) => {
                    const plan = innerPlansByPage.get(card.id)!;
                    const hasClipped = plan.placements.some((p) => p.clipped);
                    const selected = pageSizeId === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        autoFocus={index === 0}
                        aria-pressed={selected}
                        data-testid={`pdf-page-option-${card.id}`}
                        onClick={() => onChangePageSize(card.id)}
                        className={`flex cursor-pointer flex-col items-start justify-between gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                            : 'border-border bg-secondary/30 hover:border-brass/60 hover:bg-secondary/60'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-foreground">{card.title}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {card.sublabel}
                          </div>
                        </div>
                        {hasClipped ? (
                          <Badge variant="destructive" className="rounded-full px-1.5 py-0 text-[10px]">
                            Clipped
                          </Badge>
                        ) : (
                          <Badge
                            variant={plan.pageCount === 1 ? 'success' : 'secondary'}
                            className="rounded-full px-1.5 py-0 text-[10px]"
                          >
                            {plan.pageCount} {plan.pageCount === 1 ? 'page' : 'pages'}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {isOuterTarget && effectiveSplitMode === 'three-piece' && (
                <p className="rounded-md border border-brass/35 bg-brass/10 px-3 py-1.5 text-[11px] text-foreground">
                  3-Piece Split outputs 3 separate 1:1 panel pages (<strong>Back Board</strong>,{' '}
                  <strong>Spine Strip</strong>, and <strong>Front Board</strong>).
                </p>
              )}
            </div>

            {/* Section 2: Live Mini Sheet-Layout Visual Preview */}
            <PdfSheetPreviewSvg
              isOuterTarget={isOuterTarget}
              geometry={geometry}
              unit={unit}
              printMediaId={printMediaId}
              splitMode={effectiveSplitMode}
              activeFit={activeFit}
              tileOverlapMm={tileOverlapMm}
              includeScaleBar={includeScaleBar}
              innerPlan={activeInnerPlan}
              onChangePrintMedia={onChangePrintMedia}
              onChangeSplitMode={onChangeSplitMode}
              onReduceFlapWidth={onReduceFlapWidth}
            />

            {/* Section 3: Print & Export Options */}
            <div
              data-testid="pdf-export-options"
              className="kettle-stitch-divider grid gap-3 pt-3.5 sm:grid-cols-2"
            >
              {/* Cut / Fold / Glue Guides (cover-styled & inner-styled) */}
              {(target === 'cover-styled' || target === 'inner-styled') && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <Label htmlFor={guidesSwitchId} className="text-xs">
                      {target === 'cover-styled' ? 'Cut, Fold & Glue Guides' : 'Cut & Fold Lines'}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {target === 'cover-styled'
                        ? includeGuides
                          ? 'Full red cut outline, dashed fold & glue lines.'
                          : 'Clean artwork with outer corner registration marks only.'
                        : 'Red cut lines, dashed blue fold lines & hatched glue flaps.'}
                    </p>
                  </div>
                  <Switch
                    id={guidesSwitchId}
                    data-testid="pdf-opt-guides"
                    checked={includeGuides}
                    onCheckedChange={setIncludeGuides}
                  />
                </div>
              )}

              {/* 50 mm Scale-Check Ruler (cover-styled & outer-blueprint) */}
              {isOuterTarget && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <Label htmlFor={scaleBarSwitchId} className="text-xs">
                      50 mm Scale-Check Ruler
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Prints a 50.0 mm ruler bar to verify 100% Actual Size.
                    </p>
                  </div>
                  <Switch
                    id={scaleBarSwitchId}
                    data-testid="pdf-opt-scale-bar"
                    checked={includeScaleBar}
                    onCheckedChange={setIncludeScaleBar}
                  />
                </div>
              )}

              {/* 50 x 50 mm Calibration & Legend (inner-styled & inner-blueprint) */}
              {!isOuterTarget && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <Label htmlFor={legendSwitchId} className="text-xs">
                      50 × 50 mm Calibration &amp; Legend
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Adds a 50 mm verification square &amp; cut/fold legend block.
                    </p>
                  </div>
                  <Switch
                    id={legendSwitchId}
                    data-testid="pdf-opt-legend"
                    checked={includeLegend}
                    onCheckedChange={setIncludeLegend}
                  />
                </div>
              )}

              {/* Print Resolution (cover-styled) */}
              {target === 'cover-styled' && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground">Print Resolution</span>
                    <p className="text-[11px] text-muted-foreground">
                      Artwork raster DPI (text &amp; ornaments stay vector).
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 gap-1" role="group" aria-label="Print resolution">
                    {([300, 600] as const).map((val) => (
                      <Button
                        key={val}
                        type="button"
                        size="sm"
                        variant={dpi === val ? 'default' : 'outline'}
                        aria-pressed={dpi === val}
                        data-testid={`pdf-opt-dpi-${val}`}
                        className="h-7 px-2.5 font-mono text-[11px]"
                        onClick={() => setDpi(val)}
                      >
                        {val} DPI
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tile Overlap (outer 2-sheet tiled in single mode) */}
              {showTileOverlapControl && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground">Tile Overlap</span>
                    <p className="text-[11px] text-muted-foreground">
                      Overlap &amp; tape strip between Sheet 1 and Sheet 2.
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 gap-1" role="group" aria-label="Tile overlap width">
                    {OVERLAP_CHOICES.map((mm) => (
                      <Button
                        key={mm}
                        type="button"
                        size="sm"
                        variant={tileOverlapMm === mm ? 'default' : 'outline'}
                        aria-pressed={tileOverlapMm === mm}
                        data-testid={`pdf-opt-overlap-${mm}`}
                        className="h-7 px-2 font-mono text-[11px]"
                        onClick={() => setTileOverlapMm(mm)}
                      >
                        {mm} mm
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Wrap Layout (hardcover & flexible-spine when onChangeSplitMode provided) */}
              {canToggleSplitMode && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground">Wrap Layout</span>
                    <p className="text-[11px] text-muted-foreground">
                      Continuous 1-piece wrap or 3 separate quarter-bound panels.
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 gap-1" role="group" aria-label="Wrap layout">
                    <Button
                      type="button"
                      size="sm"
                      variant={splitMode === 'single' ? 'default' : 'outline'}
                      aria-pressed={splitMode === 'single'}
                      data-testid="pdf-opt-split-single"
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => onChangeSplitMode?.('single')}
                    >
                      Single Wrap
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={splitMode === 'three-piece' ? 'default' : 'outline'}
                      aria-pressed={splitMode === 'three-piece'}
                      data-testid="pdf-opt-split-three"
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => onChangeSplitMode?.('three-piece')}
                    >
                      3-Piece Split
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary/25 px-5 py-3">
            <span
              data-testid="pdf-export-summary"
              className={`font-mono text-xs ${
                isBlockedUnfitted ? 'font-medium text-destructive' : 'text-muted-foreground'
              }`}
            >
              {summaryText}
            </span>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isConfirmDisabled}
                data-testid="pdf-export-confirm-btn"
                onClick={() => void handleConfirm()}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {isBusy ? 'Generating PDF…' : 'Download PDF'}
              </Button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
