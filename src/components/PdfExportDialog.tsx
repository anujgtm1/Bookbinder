import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Layers,
  Plus,
  Printer,
  Ruler,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { PdfSheetPreviewSvg } from '@/components/PdfSheetPreviewSvg';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { evaluateDetachedSlipCoverFit, resolveBindingStrategy } from '@/core/bindingStyles';
import { evaluatePrintMediaFit } from '@/core/geometry';
import { generateMarginTestSheetPdf } from '@/core/marginTestSheetPdf';
import { planInnerTemplateLayout } from '@/core/pdfExport';
import type {
  RollNestingExportOptions,
  SheetNestingExportOptions,
} from '@/core/pdfSheetLayout';
import {
  CUSTOM_ROLL_WIDTH_BOUNDS,
  DEFAULT_PRINTER_MARGINS,
  PRINTER_MARGIN_BOUNDS,
  PRINTER_MARGIN_PRESETS,
  clampCustomRollWidthMm,
  clampPrinterMargins,
  getPrinterMarginPreset,
  loadSavedCustomRollWidthMm,
  loadSavedPrinterMargins,
  saveCustomRollWidthMm,
  savePrinterMargins,
  type PrinterMarginPresetId,
  type PrinterMargins,
} from '@/core/printerMargins';
import {
  evaluateSingleItemRollCapacity,
  packItemsOntoRoll,
  type RollNestItem,
  type RollNestPlan,
} from '@/core/rollNesting';
import {
  evaluateSingleItemSheetCapacity,
  packItemsOntoSheets,
  type SheetNestItem,
  type SheetNestPlan,
} from '@/core/sheetNesting';
import { triggerBytesDownload } from '@/core/storage';
import type { CoverPdfLayerMode } from '@/studio/renderEngine';
import {
  PAGE_SIZES,
  PRIMARY_SHEET_MEDIA_IDS,
  PRINT_MEDIA_OPTIONS,
  getPrintMediaSpec,
  type PageSizeId,
  type PrintMediaId,
  type SplitMode,
} from '@/types/bookParams';
import type { CaseGeometry, PrintMediaFitEvaluation } from '@/types/geometry';
import {
  isSavedProjectQueueEntry,
  isUploadedPdfQueueEntry,
  type MultiBookQueueEntry,
} from '@/types/multiBookExport';
import { PdfGuideOptionsModel, type PdfGuideTargetKind } from '@/types/pdfGuides';
import type { ProjectId, SavedProjectSummary } from '@/types/projectLibrary';
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
  readonly includeCutLines: boolean;
  readonly includeFoldLines: boolean;
  readonly includeFoldGuideTicks: boolean;
  /** Backward-compatible summary boolean (mirrors includeCutLines). */
  readonly includeGuides: boolean;
  readonly includeScaleBar: boolean;
  readonly includeLegend: boolean;
  readonly dpi: 300 | 600;
  readonly tileOverlapMm: number;
  readonly exportLayerMode: CoverPdfLayerMode;
  readonly appendInnerPocketsPage: boolean;
  readonly customRollWidthMm?: number;
  readonly printerMargins?: PrinterMargins;
  readonly rollNesting?: RollNestingExportOptions;
  readonly sheetNesting?: SheetNestingExportOptions;
  readonly multiBookQueueEntries?: readonly MultiBookQueueEntry[];
}

export interface OuterPdfExportOptions {
  readonly splitMode?: SplitMode;
  readonly printMediaId?: PrintMediaId;
  readonly tileOverlapMm?: number;
  readonly includeScaleBar?: boolean;
  readonly includeCutLines?: boolean;
  readonly includeFoldLines?: boolean;
  readonly includeFoldGuideTicks?: boolean;
  readonly appendInnerPocketsPage?: boolean;
  readonly innerPageSizeId?: PageSizeId;
  readonly customRollWidthMm?: number;
  readonly printerMargins?: PrinterMargins;
  readonly rollNesting?: RollNestingExportOptions;
  readonly sheetNesting?: SheetNestingExportOptions;
  readonly multiBookQueueEntries?: readonly MultiBookQueueEntry[];
}

export interface InnerPdfExportOptions {
  readonly pageSizeId?: PageSizeId;
  readonly includeLegend?: boolean;
  readonly includeCutLines?: boolean;
  readonly includeFoldLines?: boolean;
  readonly includeFoldGuideTicks?: boolean;
}

export interface PdfExportDialogProps {
  readonly open: boolean;
  readonly target: PdfExportTarget;
  readonly geometry: CaseGeometry;
  readonly unit: UnitSystem;
  readonly printMediaId: PrintMediaId;
  readonly onChangePrintMedia: (mediaId: PrintMediaId) => void;
  readonly customRollWidthMm?: number;
  readonly onChangeCustomRollWidthMm?: (widthMm: number) => void;
  readonly pageSizeId: PageSizeId;
  readonly onChangePageSize: (sizeId: PageSizeId) => void;
  readonly splitMode: SplitMode;
  readonly onChangeSplitMode?: (mode: SplitMode) => void;
  readonly onReduceFlapWidth?: (widthMm: number) => void;
  readonly onDetachSlipFlaps?: () => void;
  readonly defaultIncludeCutLines?: boolean;
  readonly defaultIncludeFoldLines?: boolean;
  readonly defaultIncludeFoldGuideTicks?: boolean;
  /** Legacy fallback for defaultIncludeCutLines when explicit granular prop is omitted. */
  readonly defaultIncludeGuides?: boolean;
  readonly defaultIncludeLegend?: boolean;
  readonly defaultExportLayerMode?: CoverPdfLayerMode;
  readonly savedBookSummaries?: readonly SavedProjectSummary[];
  readonly activeProjectId?: ProjectId | null;
  readonly activeBookName?: string;
  readonly exportProgressLabel?: string | null;
  readonly exporting?: boolean;
  readonly onConfirmExport: (selection: PdfExportSelection) => void | Promise<void>;
  readonly onClose: () => void;
}

const PRIMARY_OUTER_MEDIA_IDS: readonly PrintMediaId[] = [
  ...PRIMARY_SHEET_MEDIA_IDS,
  'exact-auto',
];

const ROLL_MEDIA_OPTIONS = PRINT_MEDIA_OPTIONS.filter((opt) => opt.kind === 'roll');
const OVERLAP_CHOICES = [10, 15, 20] as const;
const ROLL_GUTTER_CHOICES = [6, 10, 15] as const;

const TARGET_TITLES: Record<PdfExportTarget, string> = {
  'cover-styled': 'Print Cover PDF',
  'outer-blueprint': 'Cutting Blueprint PDF',
  'inner-styled': 'Styled Inner Pockets PDF',
  'inner-blueprint': 'Inner Pockets Cut PDF',
};

const TARGET_SUBTITLES: Record<PdfExportTarget, string> = {
  'cover-styled': 'Cover artwork & vector typography with live paper-fit preview.',
  'outer-blueprint': 'Structural cutting template with fold guides and miter marks.',
  'inner-styled': '300 DPI styled inner slip-in pockets & spine liner auto-paginated to your paper.',
  'inner-blueprint': 'Unstyled cutting blueprints for inner pockets & spine liner.',
};

function renderFitBadge(fit: PrintMediaFitEvaluation) {
  if (fit.mediaId === 'exact-auto') {
    return (
      <Badge variant="brass" className="rounded-full px-1.5 py-0 text-[10px]">
        Wrap size
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
 * adjust print options, and export PDFs.
 */
export function PdfExportDialog({
  open,
  target,
  geometry,
  unit,
  printMediaId,
  onChangePrintMedia,
  customRollWidthMm: propCustomRollWidthMm,
  onChangeCustomRollWidthMm,
  pageSizeId,
  onChangePageSize,
  splitMode,
  onChangeSplitMode,
  onReduceFlapWidth,
  onDetachSlipFlaps,
  defaultIncludeCutLines,
  defaultIncludeFoldLines,
  defaultIncludeFoldGuideTicks,
  defaultIncludeGuides,
  defaultIncludeLegend = false,
  defaultExportLayerMode = 'full',
  savedBookSummaries,
  activeProjectId = null,
  activeBookName,
  exportProgressLabel = null,
  exporting = false,
  onConfirmExport,
  onClose,
}: PdfExportDialogProps) {
  const titleId = useId();
  const cutLinesSwitchId = useId();
  const foldTicksSwitchId = useId();
  const foldLinesSwitchId = useId();
  const scaleBarSwitchId = useId();
  const legendSwitchId = useId();
  const appendPocketsSwitchId = useId();
  const rollSelectId = useId();
  const customRollInputId = useId();
  const marginsPresetId = useId();
  const rollNestingSwitchId = useId();
  const rollRotationSwitchId = useId();
  const rollPackPocketsSwitchId = useId();
  const gangUploadInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const guideTargetKind: PdfGuideTargetKind =
    target === 'cover-styled' || target === 'inner-styled' ? 'print' : 'template';
  const resolvedDefaultGuides = useMemo(
    () =>
      PdfGuideOptionsModel.resolve(guideTargetKind, {
        includeCutLines: defaultIncludeCutLines ?? defaultIncludeGuides,
        includeFoldLines: defaultIncludeFoldLines,
        includeFoldGuideTicks: defaultIncludeFoldGuideTicks,
      }),
    [
      guideTargetKind,
      defaultIncludeCutLines,
      defaultIncludeGuides,
      defaultIncludeFoldLines,
      defaultIncludeFoldGuideTicks,
    ],
  );

  const [includeCutLines, setIncludeCutLines] = useState(resolvedDefaultGuides.includeCutLines);
  const [includeFoldLines, setIncludeFoldLines] = useState(resolvedDefaultGuides.includeFoldLines);
  const [includeFoldGuideTicks, setIncludeFoldGuideTicks] = useState(
    resolvedDefaultGuides.includeFoldGuideTicks,
  );
  const [includeScaleBar, setIncludeScaleBar] = useState(true);
  const [includeLegend, setIncludeLegend] = useState(defaultIncludeLegend);
  const [appendInnerPocketsPage, setAppendInnerPocketsPage] = useState(true);
  const [exportLayerMode, setExportLayerMode] =
    useState<CoverPdfLayerMode>(defaultExportLayerMode);
  const [dpi, setDpi] = useState<300 | 600>(300);
  const [tileOverlapMm, setTileOverlapMm] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const prevOpenStateRef = useRef<{ open: boolean; target: PdfExportTarget }>({
    open: false,
    target,
  });

  // Printer margins & calibration state (persisted in localStorage)
  const [marginsExpanded, setMarginsExpanded] = useState(false);
  const [printerMargins, setPrinterMargins] = useState<PrinterMargins>(() =>
    loadSavedPrinterMargins(),
  );
  const [generatingTestSheet, setGeneratingTestSheet] = useState(false);

  // Custom roll width state (persisted in localStorage)
  const [localCustomRollWidthMm, setLocalCustomRollWidthMm] = useState<number>(() =>
    propCustomRollWidthMm !== undefined
      ? clampCustomRollWidthMm(propCustomRollWidthMm)
      : loadSavedCustomRollWidthMm(),
  );
  const effectiveCustomRollWidthMm =
    propCustomRollWidthMm !== undefined
      ? clampCustomRollWidthMm(propCustomRollWidthMm)
      : localCustomRollWidthMm;
  const [customRollDraft, setCustomRollDraft] = useState(() =>
    UnitConverter.formatValue(effectiveCustomRollWidthMm, unit),
  );
  const [customRollFocused, setCustomRollFocused] = useState(false);

  // Multi-book cut-sheet & wide-format roll nesting queue state
  const [multiCoverEnabled, setMultiCoverEnabled] = useState(false);
  const [coverCopies, setCoverCopies] = useState(2);
  const [nestGutterMm, setNestGutterMm] = useState<number>(10);
  const [allowNestRotation, setAllowNestRotation] = useState(true);
  const [packInnerPockets, setPackInnerPockets] = useState(false);
  const [multiBookQueue, setMultiBookQueue] = useState<readonly MultiBookQueueEntry[]>([]);
  const [gangUploadError, setGangUploadError] = useState<string | null>(null);
  const userEditedCopiesRef = useRef(false);

  const setUserCoverCopies = useCallback((nextCopies: number) => {
    userEditedCopiesRef.current = true;
    setCoverCopies(nextCopies);
  }, []);

  useEffect(() => {
    if (!customRollFocused) {
      setCustomRollDraft(UnitConverter.formatValue(effectiveCustomRollWidthMm, unit));
    }
  }, [effectiveCustomRollWidthMm, unit, customRollFocused]);

  const commitCustomRollWidthMm = useCallback(
    (nextMm: number) => {
      const clamped = clampCustomRollWidthMm(nextMm);
      setLocalCustomRollWidthMm(clamped);
      saveCustomRollWidthMm(clamped);
      onChangeCustomRollWidthMm?.(clamped);
    },
    [onChangeCustomRollWidthMm],
  );

  const updatePrinterMargins = useCallback((next: Partial<PrinterMargins>) => {
    const normalized = clampPrinterMargins(next);
    setPrinterMargins(normalized);
    savePrinterMargins(normalized);
  }, []);

  const isOuterTarget = target === 'cover-styled' || target === 'outer-blueprint';
  const activeMediaSpec = getPrintMediaSpec(printMediaId);
  const isRollSelected = activeMediaSpec.kind === 'roll';
  const isSheetSelected = activeMediaSpec.kind === 'sheet';
  const bindingStrategy = resolveBindingStrategy(geometry);
  const isSeparateSlipCover =
    !bindingStrategy.capabilities.usesChipboard && bindingStrategy.capabilities.usesInnerPockets;
  const effectiveSplitMode: SplitMode = bindingStrategy.capabilities.supportsThreePieceSplit
    ? splitMode
    : 'single';
  const supportsMultiCover =
    isOuterTarget &&
    effectiveSplitMode === 'single' &&
    printMediaId !== 'exact-auto' &&
    (isSheetSelected || isRollSelected);
  const isRollNestingActive = supportsMultiCover && isRollSelected && multiCoverEnabled;
  const isSheetNestingActive = supportsMultiCover && isSheetSelected && multiCoverEnabled;
  const isMultiCoverActive = isRollNestingActive || isSheetNestingActive;
  const effectiveAppendPockets =
    isOuterTarget &&
    effectiveSplitMode === 'single' &&
    isSeparateSlipCover &&
    appendInnerPocketsPage &&
    !(isMultiCoverActive && packInnerPockets);

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
    const prev = prevOpenStateRef.current;
    const didOpenOrSwitchTarget = open && (!prev.open || prev.target !== target);
    prevOpenStateRef.current = { open, target };

    if (open) {
      if (didOpenOrSwitchTarget) {
        userEditedCopiesRef.current = false;
        setIncludeCutLines(resolvedDefaultGuides.includeCutLines);
        setIncludeFoldLines(resolvedDefaultGuides.includeFoldLines);
        setIncludeFoldGuideTicks(resolvedDefaultGuides.includeFoldGuideTicks);
        setIncludeLegend(defaultIncludeLegend);
        setAppendInnerPocketsPage(true);
        setPrinterMargins(loadSavedPrinterMargins());
        setLocalCustomRollWidthMm(
          propCustomRollWidthMm !== undefined
            ? clampCustomRollWidthMm(propCustomRollWidthMm)
            : loadSavedCustomRollWidthMm(),
        );
        setMultiBookQueue((prev) => {
          const validIds = savedBookSummaries
            ? new Set(savedBookSummaries.map((s) => s.id))
            : null;
          return prev.filter((entry) => {
            if (!isSavedProjectQueueEntry(entry)) return true;
            if (entry.projectId === activeProjectId) return false;
            if (validIds && !validIds.has(entry.projectId)) return false;
            return true;
          });
        });
      }
      setExportLayerMode(defaultExportLayerMode);
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
  }, [
    open,
    target,
    resolvedDefaultGuides,
    defaultIncludeLegend,
    defaultExportLayerMode,
    propCustomRollWidthMm,
    activeProjectId,
    savedBookSummaries,
  ]);

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
  const coverBleedMm = geometry.outerWrap.includeBleed ? geometry.outerWrap.bleedMm : 0;
  const coverPdfW = wrapW + coverBleedMm * 2;
  const coverPdfH = wrapH + coverBleedMm * 2;

  const fitOptions = useMemo(
    () => ({
      customRollWidthMm: effectiveCustomRollWidthMm,
      margins: printerMargins,
    }),
    [effectiveCustomRollWidthMm, printerMargins],
  );

  const outerFitsByMedia = useMemo(() => {
    const map = new Map<PrintMediaId, PrintMediaFitEvaluation>();
    for (const opt of PRINT_MEDIA_OPTIONS) {
      map.set(opt.id, evaluatePrintMediaFit(opt.id, wrapW, wrapH, tileOverlapMm, fitOptions));
    }
    return map;
  }, [wrapW, wrapH, tileOverlapMm, fitOptions]);

  const activeFit = useMemo(
    () =>
      outerFitsByMedia.get(printMediaId) ??
      evaluatePrintMediaFit(printMediaId, wrapW, wrapH, tileOverlapMm, fitOptions),
    [outerFitsByMedia, printMediaId, wrapW, wrapH, tileOverlapMm, fitOptions],
  );

  const activeRollWidthMm = useMemo(() => {
    if (printMediaId === 'roll-custom') return effectiveCustomRollWidthMm;
    return activeMediaSpec.rollWidthMm ?? effectiveCustomRollWidthMm;
  }, [printMediaId, activeMediaSpec.rollWidthMm, effectiveCustomRollWidthMm]);

  const rollSideMarginMm = Math.max(printerMargins.leftMm, printerMargins.rightMm);
  const rollLeadingMarginMm = Math.max(printerMargins.topMm, printerMargins.bottomMm);
  const currentCoverLabel = activeBookName?.trim() || 'Current Cover';

  const rollCapacity = useMemo(
    () =>
      evaluateSingleItemRollCapacity(
        coverPdfW,
        coverPdfH,
        activeRollWidthMm,
        rollSideMarginMm,
        nestGutterMm,
      ),
    [coverPdfW, coverPdfH, activeRollWidthMm, rollSideMarginMm, nestGutterMm],
  );

  const effectiveMaxAcross = allowNestRotation
    ? rollCapacity.recommendedMaxAcross
    : rollCapacity.maxAcrossUnrotated;

  const sheetCapacity = useMemo(
    () =>
      evaluateSingleItemSheetCapacity(
        coverPdfW,
        coverPdfH,
        printMediaId,
        printerMargins,
        nestGutterMm,
        allowNestRotation,
      ),
    [coverPdfW, coverPdfH, printMediaId, printerMargins, nestGutterMm, allowNestRotation],
  );

  const otherSavedBooks = useMemo(
    () => (savedBookSummaries ?? []).filter((summary) => summary.id !== activeProjectId),
    [savedBookSummaries, activeProjectId],
  );

  const queuedProjectIds = useMemo(() => {
    const ids = new Set<ProjectId>();
    for (const entry of multiBookQueue) {
      if (isSavedProjectQueueEntry(entry)) {
        ids.add(entry.projectId);
      }
    }
    return ids;
  }, [multiBookQueue]);

  const nestedItemsList = useMemo<readonly SheetNestItem[]>(() => {
    const safeCopies = Math.max(1, Math.floor(coverCopies));
    const items: SheetNestItem[] = [
      {
        id: 'current-cover',
        label: currentCoverLabel,
        widthMm: coverPdfW,
        heightMm: coverPdfH,
        copies: safeCopies,
      },
    ];

    if (packInnerPockets && bindingStrategy.capabilities.usesInnerPockets) {
      items.push(
        {
          id: 'inner-back-pocket',
          label: geometry.backPocket.label,
          widthMm: geometry.backPocket.totalWidthMm,
          heightMm: geometry.backPocket.totalHeightMm,
          copies: safeCopies,
        },
        {
          id: 'inner-front-pocket',
          label: geometry.frontPocket.label,
          widthMm: geometry.frontPocket.totalWidthMm,
          heightMm: geometry.frontPocket.totalHeightMm,
          copies: safeCopies,
        },
      );
      if (bindingStrategy.capabilities.usesChipboard) {
        items.push({
          id: 'inner-spine-liner',
          label: 'Spine Liner',
          widthMm: geometry.spineLiner.widthMm,
          heightMm: geometry.spineLiner.heightMm,
          copies: safeCopies,
        });
      }
    }

    for (const entry of multiBookQueue) {
      if (entry.copies > 0) {
        items.push({
          id: entry.id,
          label: entry.label,
          widthMm: entry.widthMm,
          heightMm: entry.heightMm,
          copies: entry.copies,
        });
      }
    }

    return items;
  }, [
    coverCopies,
    currentCoverLabel,
    coverPdfW,
    coverPdfH,
    packInnerPockets,
    bindingStrategy.capabilities.usesInnerPockets,
    bindingStrategy.capabilities.usesChipboard,
    geometry.backPocket,
    geometry.frontPocket,
    geometry.spineLiner,
    multiBookQueue,
  ]);

  const sheetNestItemLabels = useMemo<ReadonlyMap<string, string>>(() => {
    const map = new Map<string, string>();
    for (const item of nestedItemsList) {
      map.set(item.id, item.label);
    }
    return map;
  }, [nestedItemsList]);

  const rollNestPlan: RollNestPlan | null = useMemo(() => {
    if (!isRollNestingActive) return null;
    const rollItems: readonly RollNestItem[] = nestedItemsList;
    return packItemsOntoRoll(rollItems, {
      rollWidthMm: activeRollWidthMm,
      sideMarginMm: rollSideMarginMm,
      leadingMarginMm: rollLeadingMarginMm,
      gutterMm: nestGutterMm,
      allowRotation: allowNestRotation,
    });
  }, [
    isRollNestingActive,
    nestedItemsList,
    activeRollWidthMm,
    rollSideMarginMm,
    rollLeadingMarginMm,
    nestGutterMm,
    allowNestRotation,
  ]);

  const sheetNestPlan: SheetNestPlan | null = useMemo(() => {
    if (!isSheetNestingActive) return null;
    return packItemsOntoSheets(nestedItemsList, {
      mediaId: printMediaId,
      printerMargins,
      gutterMm: nestGutterMm,
      allowRotation: allowNestRotation,
    });
  }, [
    isSheetNestingActive,
    nestedItemsList,
    printMediaId,
    printerMargins,
    nestGutterMm,
    allowNestRotation,
  ]);

  const rollDisplayName = useMemo(() => {
    if (printMediaId === 'roll-custom') {
      return `${roundTo(effectiveCustomRollWidthMm, 0)} mm roll`;
    }
    return activeMediaSpec.shortLabel.toLowerCase();
  }, [printMediaId, effectiveCustomRollWidthMm, activeMediaSpec.shortLabel]);

  const isDefaultMargins =
    Math.abs(printerMargins.topMm - DEFAULT_PRINTER_MARGINS.topMm) < 0.01 &&
    Math.abs(printerMargins.bottomMm - DEFAULT_PRINTER_MARGINS.bottomMm) < 0.01 &&
    Math.abs(printerMargins.leftMm - DEFAULT_PRINTER_MARGINS.leftMm) < 0.01 &&
    Math.abs(printerMargins.rightMm - DEFAULT_PRINTER_MARGINS.rightMm) < 0.01;

  const innerPlansByPage = useMemo(() => {
    const map = new Map<PageSizeId, ReturnType<typeof planInnerTemplateLayout>>();
    for (const id of PRIMARY_SHEET_MEDIA_IDS) {
      map.set(id, planInnerTemplateLayout(geometry, id, { includeLegend }));
    }
    return map;
  }, [geometry, includeLegend]);

  const activeInnerPlan = useMemo(
    () =>
      innerPlansByPage.get(pageSizeId) ??
      planInnerTemplateLayout(geometry, pageSizeId, { includeLegend }),
    [innerPlansByPage, geometry, pageSizeId, includeLegend],
  );

  const resolvedInnerPageSizeId: PageSizeId =
    printMediaId === 'letter' ||
    printMediaId === 'a4' ||
    printMediaId === 'legal' ||
    printMediaId === 'tabloid'
      ? printMediaId
      : pageSizeId;

  const detachedInnerPlan = useMemo(
    () => planInnerTemplateLayout(geometry, resolvedInnerPageSizeId, { includeLegend: false }),
    [geometry, resolvedInnerPageSizeId],
  );

  const detachedSlipFit = useMemo(
    () => evaluateDetachedSlipCoverFit(geometry, printMediaId),
    [geometry, printMediaId],
  );

  const showDetachFlapsCallout =
    isOuterTarget &&
    effectiveSplitMode === 'single' &&
    !isSheetNestingActive &&
    Boolean(onDetachSlipFlaps) &&
    (activeFit.status === 'fits-2-sheet-tile' || activeFit.status === 'does-not-fit') &&
    Boolean(detachedSlipFit?.fitsSingleSheet);

  const isBlockedUnfitted =
    isOuterTarget &&
    effectiveSplitMode === 'single' &&
    printMediaId !== 'exact-auto' &&
    (isSheetNestingActive
      ? (sheetNestPlan?.totalPlacedCount ?? 0) === 0
      : isRollNestingActive
        ? (rollNestPlan?.placements.length ?? 0) === 0
        : activeFit.status === 'does-not-fit');
  const isBusy = Boolean(exporting || isSubmitting);
  const isConfirmDisabled = isBusy || isBlockedUnfitted;

  const summaryText = useMemo(() => {
    if (!isOuterTarget) {
      const pageWord = activeInnerPlan.pageCount === 1 ? 'page' : 'pages';
      const sizeLabel = PAGE_SIZES[pageSizeId].label;
      const legendSuffix = includeLegend ? ' • with 50 mm legend' : '';
      const modeSuffix = target === 'inner-styled' ? ' • 300 DPI' : '';
      return `${activeInnerPlan.pageCount} ${pageWord} • ${sizeLabel}${legendSuffix}${modeSuffix}`;
    }

    const layerSuffix =
      target === 'cover-styled' && exportLayerMode === 'base-only'
        ? ' • Base Only (For HTV)'
        : '';
    const dpiSuffix = target === 'cover-styled' ? ` • ${dpi} DPI${layerSuffix}` : '';
    if (effectiveSplitMode === 'three-piece') {
      return `3 pages • 3-Piece Split (Back, Spine, Front)${dpiSuffix}`;
    }
    if (isRollNestingActive && rollNestPlan) {
      if (rollNestPlan.placements.length === 0) {
        return `Selected covers exceed ${rollDisplayName} — choose a wider roll`;
      }
      const rollLabel =
        printMediaId === 'roll-custom'
          ? `Custom Roll (${roundTo(effectiveCustomRollWidthMm, 0)} mm)`
          : activeMediaSpec.shortLabel;
      return `1 roll strip • ${rollLabel} • ${rollNestPlan.placements.length} pcs • ${Math.round(rollNestPlan.usedLengthMm)} mm (${rollNestPlan.efficiencyPct}%)${dpiSuffix}`;
    }
    if (isSheetNestingActive && sheetNestPlan) {
      if (sheetNestPlan.totalPlacedCount === 0) {
        return `Selected covers exceed ${activeMediaSpec.label} — choose Tabloid or a wide roll`;
      }
      const sheetCount = sheetNestPlan.pages.length;
      const sheetWord = sheetCount === 1 ? 'sheet' : 'sheets';
      const coverWord = sheetNestPlan.totalPlacedCount === 1 ? 'cover' : 'covers';
      const orient = sheetNestPlan.orientation === 'landscape' ? 'Landscape' : 'Portrait';
      const unplacedNote =
        sheetNestPlan.unplacedIds.length > 0
          ? ` • ${sheetNestPlan.unplacedIds.length} too large`
          : '';
      const pocketsSuffix = effectiveAppendPockets ? ' + Pockets' : '';
      return `${sheetCount} ${sheetWord} • ${activeMediaSpec.shortLabel} ${orient} • ${sheetNestPlan.totalPlacedCount} ${coverWord} • ${sheetNestPlan.overallEfficiencyPct}% used${unplacedNote}${pocketsSuffix}${dpiSuffix}`;
    }
    if (isBlockedUnfitted) {
      const label =
        printMediaId === 'roll-custom'
          ? `Custom Roll (${roundTo(effectiveCustomRollWidthMm, 1)} mm)`
          : activeMediaSpec.label;
      return `Cover exceeds ${label} — choose a larger paper or split layout`;
    }
    const pocketsSuffix = effectiveAppendPockets ? ' + Pockets' : '';
    const formatPageCount = (outerCount: number) => {
      const total = effectiveAppendPockets ? outerCount + detachedInnerPlan.pageCount : outerCount;
      return `${total} ${total === 1 ? 'page' : 'pages'}`;
    };
    if (printMediaId === 'exact-auto') {
      return `${formatPageCount(1)} • ${activeMediaSpec.shortLabel} (${roundTo(wrapW, 1)} × ${roundTo(wrapH, 1)} mm)${pocketsSuffix}${dpiSuffix}`;
    }
    if (printMediaId === 'roll-custom') {
      return `${formatPageCount(1)} • Custom Roll (${roundTo(effectiveCustomRollWidthMm, 1)} mm)${pocketsSuffix}${dpiSuffix}`;
    }
    if (activeFit.status === 'fits-1-sheet' && activeFit.sheetPageWidthMm && activeFit.sheetPageHeightMm) {
      const orient =
        activeFit.sheetPageWidthMm > activeFit.sheetPageHeightMm ? 'Landscape' : 'Portrait';
      return `${formatPageCount(1)} • ${activeMediaSpec.label} ${orient} (centered)${pocketsSuffix}${dpiSuffix}`;
    }
    if (
      activeFit.status === 'fits-2-sheet-tile' &&
      activeFit.sheetPageWidthMm &&
      activeFit.sheetPageHeightMm
    ) {
      const orient =
        activeFit.sheetPageWidthMm > activeFit.sheetPageHeightMm ? 'Landscape' : 'Portrait';
      return `${formatPageCount(2)} • ${activeMediaSpec.label} ${orient} (tiled, ${tileOverlapMm} mm overlap)${pocketsSuffix}${dpiSuffix}`;
    }
    return `${formatPageCount(1)} • ${activeMediaSpec.label}${pocketsSuffix}${dpiSuffix}`;
  }, [
    isOuterTarget,
    activeInnerPlan.pageCount,
    pageSizeId,
    includeLegend,
    target,
    exportLayerMode,
    dpi,
    effectiveSplitMode,
    isRollNestingActive,
    rollNestPlan,
    rollDisplayName,
    isSheetNestingActive,
    sheetNestPlan,
    effectiveCustomRollWidthMm,
    isBlockedUnfitted,
    activeMediaSpec,
    effectiveAppendPockets,
    detachedInnerPlan.pageCount,
    activeFit,
    printMediaId,
    wrapW,
    wrapH,
    tileOverlapMm,
  ]);

  const handleDownloadMarginTestSheet = async () => {
    setGeneratingTestSheet(true);
    try {
      let testPageW: number;
      let testPageH: number;
      let testMediaLabel: string;

      if (!isOuterTarget) {
        const ps = PAGE_SIZES[pageSizeId];
        testPageW = ps.widthMm;
        testPageH = ps.heightMm;
        testMediaLabel = ps.label;
      } else if (activeMediaSpec.kind === 'sheet' && activeMediaSpec.shortMm && activeMediaSpec.longMm) {
        testPageW = activeFit.sheetPageWidthMm ?? activeMediaSpec.shortMm;
        testPageH = activeFit.sheetPageHeightMm ?? activeMediaSpec.longMm;
        testMediaLabel = activeMediaSpec.label;
      } else if (activeMediaSpec.kind === 'roll') {
        testPageW = activeRollWidthMm;
        testPageH = Math.max(250, Math.min(450, Math.round(wrapH + 40)));
        testMediaLabel =
          printMediaId === 'roll-custom'
            ? `Custom Roll (${roundTo(activeRollWidthMm, 1)} mm)`
            : activeMediaSpec.label;
      } else {
        const ps = PAGE_SIZES[pageSizeId];
        testPageW = ps.widthMm;
        testPageH = ps.heightMm;
        testMediaLabel = ps.label;
      }

      const bytes = await generateMarginTestSheetPdf({
        pageWidthMm: testPageW,
        pageHeightMm: testPageH,
        mediaLabel: testMediaLabel,
        unit,
      });
      triggerBytesDownload(bytes, 'printer_margin_calibration_sheet.pdf', 'application/pdf');
    } finally {
      setGeneratingTestSheet(false);
    }
  };

  const readFileAsBytes = (file: File): Promise<Uint8Array> => {
    if (typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer().then((buf) => new Uint8Array(buf));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(reader.result));
        } else {
          reject(new Error('Expected ArrayBuffer'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleAddSavedBook = useCallback((summary: SavedProjectSummary) => {
    setMultiBookQueue((prev) => {
      if (prev.some((entry) => isSavedProjectQueueEntry(entry) && entry.projectId === summary.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          kind: 'saved-project',
          id: `saved-${summary.id}`,
          projectId: summary.id,
          label: summary.name,
          widthMm: summary.wrapPdfWidthMm,
          heightMm: summary.wrapPdfHeightMm,
          copies: 1,
        },
      ];
    });
    if (!userEditedCopiesRef.current) {
      setCoverCopies(1);
    }
  }, []);

  const handleGangUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setGangUploadError(null);
    const added: MultiBookQueueEntry[] = [];
    let failedCount = 0;

    for (const file of Array.from(fileList)) {
      try {
        const bytes = await readFileAsBytes(file);
        const doc = await PDFDocument.load(bytes);
        if (doc.getPageCount() < 1) {
          failedCount += 1;
          continue;
        }
        const sz = doc.getPage(0).getSize();
        const widthMm = roundTo(UnitConverter.pointsToMm(sz.width), 1);
        const heightMm = roundTo(UnitConverter.pointsToMm(sz.height), 1);
        const cleanLabel = file.name.replace(/\.pdf$/i, '') || 'Book PDF';
        added.push({
          kind: 'uploaded-pdf',
          id: `gang-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: cleanLabel,
          pdfBytes: bytes,
          widthMm,
          heightMm,
          copies: 1,
        });
      } catch {
        failedCount += 1;
      }
    }

    if (added.length > 0) {
      setMultiBookQueue((prev) => [...prev, ...added]);
      if (!userEditedCopiesRef.current) {
        setCoverCopies(1);
      }
    }
    if (failedCount > 0) {
      setGangUploadError(
        `Could not read ${failedCount} selected ${failedCount === 1 ? 'file' : 'files'} as a valid PDF.`,
      );
    }
  };

  const handleConfirm = async () => {
    if (isConfirmDisabled) return;
    const uploadedExtraItems = multiBookQueue.filter(isUploadedPdfQueueEntry).map((entry) => ({
      id: entry.id,
      label: entry.label,
      pdfBytes: entry.pdfBytes,
      copies: entry.copies,
    }));
    const sharedNestConfig = {
      enabled: true,
      copies: Math.max(1, Math.floor(coverCopies)),
      gutterMm: nestGutterMm,
      packInnerPockets: bindingStrategy.capabilities.usesInnerPockets && packInnerPockets,
      allowRotation: allowNestRotation,
      ...(uploadedExtraItems.length > 0 ? { extraQueueItems: uploadedExtraItems } : {}),
    };
    const selection: PdfExportSelection = {
      target,
      printMediaId,
      pageSizeId: effectiveAppendPockets ? resolvedInnerPageSizeId : pageSizeId,
      splitMode: effectiveSplitMode,
      includeCutLines,
      includeFoldLines,
      includeFoldGuideTicks,
      includeGuides: includeCutLines,
      includeScaleBar,
      includeLegend,
      dpi,
      tileOverlapMm,
      exportLayerMode,
      appendInnerPocketsPage: effectiveAppendPockets,
      ...(printMediaId === 'roll-custom'
        ? { customRollWidthMm: effectiveCustomRollWidthMm }
        : {}),
      ...(!isDefaultMargins ? { printerMargins } : {}),
      ...(isRollNestingActive ? { rollNesting: sharedNestConfig } : {}),
      ...(isSheetNestingActive ? { sheetNesting: sharedNestConfig } : {}),
      ...(isMultiCoverActive && multiBookQueue.length > 0
        ? { multiBookQueueEntries: multiBookQueue }
        : {}),
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
    isOuterTarget &&
    effectiveSplitMode === 'single' &&
    !isSheetNestingActive &&
    activeFit.status === 'fits-2-sheet-tile';

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
                  {PRIMARY_OUTER_MEDIA_IDS.map((mediaId, index) => {
                    const spec = getPrintMediaSpec(mediaId);
                    const fit = outerFitsByMedia.get(mediaId)!;
                    const selected = printMediaId === mediaId;
                    return (
                      <button
                        key={mediaId}
                        type="button"
                        autoFocus={index === 0}
                        aria-pressed={selected}
                        data-testid={`pdf-media-option-${mediaId}`}
                        onClick={() => onChangePrintMedia(mediaId)}
                        className={`flex cursor-pointer flex-col items-start justify-between gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                            : 'border-border bg-secondary/30 hover:border-brass/60 hover:bg-secondary/60'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            {spec.shortLabel}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {spec.dimensionsLabel}
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
                  {PRIMARY_SHEET_MEDIA_IDS.map((sizeId, index) => {
                    const pageSpec = PAGE_SIZES[sizeId];
                    const plan = innerPlansByPage.get(sizeId)!;
                    const hasClipped = plan.placements.some((p) => p.clipped);
                    const selected = pageSizeId === sizeId;
                    return (
                      <button
                        key={sizeId}
                        type="button"
                        autoFocus={index === 0}
                        aria-pressed={selected}
                        data-testid={`pdf-page-option-${sizeId}`}
                        onClick={() => onChangePageSize(sizeId)}
                        className={`flex cursor-pointer flex-col items-start justify-between gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                            : 'border-border bg-secondary/30 hover:border-brass/60 hover:bg-secondary/60'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            {pageSpec.shortLabel}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {pageSpec.dimensionsLabel}
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

              {isOuterTarget && printMediaId === 'roll-custom' && (
                <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-primary/35 bg-primary/8 px-3.5 py-2 text-xs">
                  <div className="space-y-0.5">
                    <Label htmlFor={customRollInputId} className="text-xs font-medium text-foreground">
                      Custom Roll Width ({unit})
                    </Label>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {roundTo(effectiveCustomRollWidthMm, 1)} mm (
                      {UnitConverter.formatValue(effectiveCustomRollWidthMm, 'in', 1)} in) • Range{' '}
                      {CUSTOM_ROLL_WIDTH_BOUNDS.minMm}–{CUSTOM_ROLL_WIDTH_BOUNDS.maxMm} mm
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id={customRollInputId}
                      data-testid="pdf-custom-roll-width-input"
                      type="number"
                      inputMode="decimal"
                      step={unit === 'in' ? '0.5' : '1'}
                      min={Number(
                        UnitConverter.toDisplay(CUSTOM_ROLL_WIDTH_BOUNDS.minMm, unit).toFixed(2),
                      )}
                      max={Number(
                        UnitConverter.toDisplay(CUSTOM_ROLL_WIDTH_BOUNDS.maxMm, unit).toFixed(2),
                      )}
                      value={customRollDraft}
                      onFocus={() => setCustomRollFocused(true)}
                      onBlur={() => {
                        setCustomRollFocused(false);
                        setCustomRollDraft(
                          UnitConverter.formatValue(effectiveCustomRollWidthMm, unit),
                        );
                      }}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setCustomRollDraft(raw);
                        const numeric = Number.parseFloat(raw);
                        if (Number.isFinite(numeric)) {
                          commitCustomRollWidthMm(UnitConverter.fromDisplay(numeric, unit));
                        }
                      }}
                      className="h-7 w-24 font-mono text-xs"
                    />
                    <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>
                  </div>
                </div>
              )}

              {isOuterTarget && effectiveSplitMode === 'three-piece' && (
                <p className="rounded-md border border-brass/35 bg-brass/10 px-3 py-1.5 text-[11px] text-foreground">
                  3-Piece Split outputs 3 separate panel pages (<strong>Back Board</strong>,{' '}
                  <strong>Spine Strip</strong>, and <strong>Front Board</strong>).
                </p>
              )}

              {showDetachFlapsCallout && detachedSlipFit && onDetachSlipFlaps && (
                <div
                  data-testid="pdf-detach-flaps-callout"
                  className="status-success-surface flex flex-wrap items-center justify-between gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Zero-seam home print available on 1× {activeMediaSpec.shortLabel}
                    </p>
                    <p className="text-[11px] opacity-90">
                      Detach side flaps into Sheet 2 inner pockets so the seamless{' '}
                      <span className="font-mono">
                        {UnitConverter.formatDimensions(
                          detachedSlipFit.detachedWidthMm,
                          detachedSlipFit.detachedHeightMm,
                          unit,
                        )}
                      </span>{' '}
                      outer cover prints cleanly on 1× {activeMediaSpec.shortLabel}.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    data-testid="pdf-detach-flaps-btn"
                    onClick={onDetachSlipFlaps}
                  >
                    Detach Flaps → 1× {activeMediaSpec.shortLabel} + Separate Pockets
                  </Button>
                </div>
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
              includeCutLines={includeCutLines}
              includeFoldLines={includeFoldLines}
              includeFoldGuideTicks={includeFoldGuideTicks}
              innerPlan={activeInnerPlan}
              printerMargins={printerMargins}
              customRollWidthMm={effectiveCustomRollWidthMm}
              rollNestPlan={rollNestPlan}
              sheetNestPlan={sheetNestPlan}
              sheetNestItemLabels={sheetNestItemLabels}
              onChangePrintMedia={onChangePrintMedia}
              onChangeSplitMode={onChangeSplitMode}
              onReduceFlapWidth={onReduceFlapWidth}
            />

            {/* Section 2b: Multi-Cover Layout (Desktop Cut Sheets & Wide-Format Rolls) */}
            {supportsMultiCover && (
              <div
                data-testid={isRollSelected ? 'pdf-roll-nesting-section' : 'pdf-sheet-nesting-section'}
                data-multi-cover-mode={isRollSelected ? 'roll' : 'sheet'}
                className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/25 p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label
                        htmlFor={rollNestingSwitchId}
                        className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
                      >
                        <Layers className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
                        Combine Multiple Covers / Multi-Up
                      </Label>
                      {isRollSelected ? (
                        <Badge
                          variant={rollCapacity.recommendedMaxAcross > 0 ? 'success' : 'destructive'}
                          data-testid="pdf-roll-capacity-badge"
                          className="rounded-full font-mono text-[10px]"
                        >
                          {rollCapacity.recommendedMaxAcross > 0
                            ? `Fits ${rollCapacity.recommendedMaxAcross} across on ${rollDisplayName} — ${Math.round(rollCapacity.widthUtilizationPct)}% width`
                            : `Exceeds ${rollDisplayName} width (${roundTo(rollCapacity.printableWidthMm, 0)} mm printable)`}
                        </Badge>
                      ) : (
                        <Badge
                          variant={sheetCapacity.maxPerSheet > 0 ? 'success' : 'destructive'}
                          data-testid="pdf-roll-capacity-badge"
                          className="rounded-full font-mono text-[10px]"
                        >
                          {sheetCapacity.maxPerSheet > 0
                            ? `Fits ${sheetCapacity.maxPerSheet} per ${activeMediaSpec.shortLabel} sheet — ${Math.round(sheetCapacity.utilizationPct)}% area`
                            : `Exceeds ${activeMediaSpec.shortLabel} printable area (${roundTo(sheetCapacity.printableSafeBox.widthMm, 0)} × ${roundTo(sheetCapacity.printableSafeBox.heightMm, 0)} mm)`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {isRollSelected
                        ? 'Nest multiple copies side-by-side or combine other books from My Books onto one roll strip.'
                        : `Print multiple copies or combine different books from My Books on ${activeMediaSpec.shortLabel} sheets.`}
                    </p>
                  </div>
                  <Switch
                    id={rollNestingSwitchId}
                    data-testid="pdf-roll-nesting-toggle"
                    checked={multiCoverEnabled}
                    onCheckedChange={(checked) => {
                      setMultiCoverEnabled(checked);
                      if (checked && !userEditedCopiesRef.current) {
                        if (multiBookQueue.length > 0) {
                          setCoverCopies(1);
                        } else {
                          const maxFit = isRollSelected
                            ? effectiveMaxAcross
                            : sheetCapacity.maxPerSheet;
                          setCoverCopies(maxFit >= 2 ? 2 : 1);
                        }
                      }
                    }}
                  />
                </div>

                {multiCoverEnabled && (
                  <div className="grid gap-2.5 border-t border-border/70 pt-3 sm:grid-cols-2">
                    {/* Copies Selector */}
                    <div className="flex flex-col justify-between gap-1.5 rounded-md border border-border bg-card/80 px-3 py-2">
                      <span className="text-xs font-medium text-foreground">
                        Copies of Current Cover
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={coverCopies === 1 ? 'default' : 'outline'}
                          data-testid="pdf-roll-copies-1"
                          className="h-7 px-2.5 font-mono text-[11px]"
                          onClick={() => setUserCoverCopies(1)}
                        >
                          1
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={coverCopies === 2 ? 'default' : 'outline'}
                          data-testid="pdf-roll-copies-2"
                          className="h-7 px-2.5 font-mono text-[11px]"
                          onClick={() => setUserCoverCopies(2)}
                        >
                          2
                        </Button>
                        {(isRollSelected ? effectiveMaxAcross : sheetCapacity.maxPerSheet) >= 2 && (
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              coverCopies ===
                              (isRollSelected ? effectiveMaxAcross : sheetCapacity.maxPerSheet)
                                ? 'default'
                                : 'outline'
                            }
                            data-testid="pdf-roll-copies-fill"
                            className="h-7 px-2.5 font-mono text-[11px]"
                            onClick={() =>
                              setUserCoverCopies(
                                isRollSelected ? effectiveMaxAcross : sheetCapacity.maxPerSheet,
                              )
                            }
                          >
                            {isRollSelected
                              ? `Fill Row (${effectiveMaxAcross})`
                              : `Fill Sheet (${sheetCapacity.maxPerSheet})`}
                          </Button>
                        )}
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          aria-label="Custom cover copies"
                          data-testid="pdf-roll-copies-input"
                          value={coverCopies}
                          onChange={(e) => {
                            const val = Number.parseInt(e.target.value, 10);
                            if (Number.isFinite(val)) {
                              setUserCoverCopies(Math.max(1, Math.min(50, val)));
                            }
                          }}
                          className="h-7 w-16 font-mono text-xs"
                        />
                      </div>
                    </div>

                    {/* Gutter Selector */}
                    <div className="flex flex-col justify-between gap-1.5 rounded-md border border-border bg-card/80 px-3 py-2">
                      <span className="text-xs font-medium text-foreground">Cut Gutter Spacing</span>
                      <div className="inline-flex gap-1" role="group" aria-label="Cut gutter spacing">
                        {ROLL_GUTTER_CHOICES.map((mm) => (
                          <Button
                            key={mm}
                            type="button"
                            size="sm"
                            variant={nestGutterMm === mm ? 'default' : 'outline'}
                            aria-pressed={nestGutterMm === mm}
                            data-testid={`pdf-roll-gutter-${mm}`}
                            className="h-7 px-2.5 font-mono text-[11px]"
                            onClick={() => setNestGutterMm(mm)}
                          >
                            {mm} mm
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Allow 90° Rotation */}
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/80 px-3 py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor={rollRotationSwitchId} className="text-xs">
                          Allow 90° Rotation
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          {isRollSelected
                            ? 'Auto-rotate covers when more copies fit across the roll.'
                            : 'Auto-rotate covers when more fit onto each sheet.'}
                        </p>
                      </div>
                      <Switch
                        id={rollRotationSwitchId}
                        data-testid="pdf-roll-allow-rotation"
                        checked={allowNestRotation}
                        onCheckedChange={setAllowNestRotation}
                      />
                    </div>

                    {/* Pack Inner Pockets / Endpapers beside cover */}
                    {bindingStrategy.capabilities.usesInnerPockets && (
                      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/80 px-3 py-2">
                        <div className="space-y-0.5">
                          <Label htmlFor={rollPackPocketsSwitchId} className="text-xs">
                            Pack Inner Pockets / Endpapers
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            {isRollSelected
                              ? 'Nest inner pockets & liner right beside the cover on the roll.'
                              : 'Pack inner pockets & liner alongside the cover on the sheet.'}
                          </p>
                        </div>
                        <Switch
                          id={rollPackPocketsSwitchId}
                          data-testid="pdf-roll-pack-pockets"
                          checked={packInnerPockets}
                          onCheckedChange={setPackInnerPockets}
                        />
                      </div>
                    )}

                    {/* Add from My Books + Add PDF File + Unified Queue */}
                    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-card/80 px-3 py-2.5 sm:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">
                            Add from My Books
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            Combine saved books from your library or add an Exact Wrap Size PDF.
                          </p>
                        </div>
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2.5 text-[11px]"
                            onClick={() => gangUploadInputRef.current?.click()}
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            Add PDF File
                          </Button>
                          <input
                            ref={gangUploadInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            multiple
                            aria-label="Add external PDF files to multi-cover layout"
                            data-testid="pdf-roll-gang-upload"
                            className="sr-only"
                            onChange={(e) => {
                              void handleGangUpload(e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </div>
                      </div>

                      {/* Saved Books Picker */}
                      <div data-testid="pdf-my-books-picker" className="space-y-1.5">
                        {otherSavedBooks.length === 0 ? (
                          <p className="rounded border border-dashed border-border/80 bg-secondary/20 px-2.5 py-2 text-[11px] text-muted-foreground">
                            Save another book in My Books to pick it here, or add an Exact Wrap
                            Size PDF.
                          </p>
                        ) : (
                          <ul className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                            {otherSavedBooks.map((book) => {
                              const alreadyAdded = queuedProjectIds.has(book.id);
                              return (
                                <li
                                  key={book.id}
                                  data-testid="pdf-my-books-picker-item"
                                  data-project-id={book.id}
                                  className="flex items-center justify-between gap-2 rounded border border-border/80 bg-secondary/25 px-2 py-1.5 text-xs"
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <div className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border/70 bg-secondary/60">
                                      {book.thumbnailDataUrl ? (
                                        <img
                                          src={book.thumbnailDataUrl}
                                          alt=""
                                          className="h-full w-full object-contain p-0.5"
                                        />
                                      ) : (
                                        <BookOpen
                                          className="h-3.5 w-3.5 text-brass"
                                          aria-hidden="true"
                                        />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div
                                        className="truncate font-medium text-foreground"
                                        title={book.name}
                                      >
                                        {book.name}
                                      </div>
                                      <div className="font-mono text-[10px] text-muted-foreground">
                                        {UnitConverter.formatDimensions(
                                          book.wrapPdfWidthMm,
                                          book.wrapPdfHeightMm,
                                          unit,
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {alreadyAdded ? (
                                    <Badge
                                      variant="success"
                                      className="shrink-0 gap-1 rounded-full px-2 py-0.5 text-[10px]"
                                    >
                                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                                      Added
                                    </Badge>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      data-testid="pdf-add-saved-book"
                                      data-project-id={book.id}
                                      aria-label={`Add ${book.name} to print layout`}
                                      className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                                      onClick={() => handleAddSavedBook(book)}
                                    >
                                      <Plus className="h-3 w-3" aria-hidden="true" />
                                      Add
                                    </Button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>

                      {gangUploadError && (
                        <p className="text-[11px] text-destructive">{gangUploadError}</p>
                      )}

                      {multiBookQueue.length > 0 && (
                        <div className="space-y-1.5 border-t border-border/60 pt-2">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Added Covers ({multiBookQueue.length})
                          </span>
                          <ul className="space-y-1.5" data-testid="pdf-roll-gang-list">
                            {multiBookQueue.map((item) => (
                              <li
                                key={item.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/80 bg-secondary/35 px-2.5 py-1.5 text-xs"
                              >
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant={
                                      isSavedProjectQueueEntry(item) ? 'brass' : 'outline'
                                    }
                                    className="rounded-full px-1.5 py-0 text-[9.5px]"
                                  >
                                    {isSavedProjectQueueEntry(item) ? 'My Books' : 'PDF'}
                                  </Badge>
                                  <span className="truncate font-medium text-foreground">
                                    {item.label}
                                  </span>
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    {UnitConverter.formatDimensions(
                                      item.widthMm,
                                      item.heightMm,
                                      unit,
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 w-6 p-0 font-mono text-xs"
                                    aria-label={`Decrease copies for ${item.label}`}
                                    onClick={() =>
                                      setMultiBookQueue((prev) =>
                                        prev.map((q) =>
                                          q.id === item.id
                                            ? { ...q, copies: Math.max(1, q.copies - 1) }
                                            : q,
                                        ),
                                      )
                                    }
                                  >
                                    −
                                  </Button>
                                  <span className="min-w-5 text-center font-mono text-[11px]">
                                    {item.copies}×
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 w-6 p-0 font-mono text-xs"
                                    aria-label={`Increase copies for ${item.label}`}
                                    onClick={() =>
                                      setMultiBookQueue((prev) =>
                                        prev.map((q) =>
                                          q.id === item.id
                                            ? { ...q, copies: Math.min(50, q.copies + 1) }
                                            : q,
                                        ),
                                      )
                                    }
                                  >
                                    +
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                    aria-label={`Remove ${item.label}`}
                                    onClick={() =>
                                      setMultiBookQueue((prev) =>
                                        prev.filter((q) => q.id !== item.id),
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Section 3: Print & Export Options */}
            <div
              data-testid="pdf-export-options"
              className="kettle-stitch-divider grid gap-3 pt-3.5 sm:grid-cols-2"
            >
              {/* Print Layers (cover-styled: Full Cover vs Base Only for Hybrid HTV) */}
              {target === 'cover-styled' && (
                <div className="flex flex-col justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2 sm:col-span-2 sm:flex-row sm:items-center">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground">Print Layers</span>
                    <p className="text-[11px] text-muted-foreground">
                      {exportLayerMode === 'base-only'
                        ? 'Omits text & ornaments so Cricut HTV / foil presses onto a clean printed base with zero double-vision ghosting.'
                        : 'Prints full cover artwork with embedded vector text and ornaments.'}
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 gap-1" role="group" aria-label="Print layers">
                    <Button
                      type="button"
                      size="sm"
                      variant={exportLayerMode === 'full' ? 'default' : 'outline'}
                      aria-pressed={exportLayerMode === 'full'}
                      data-testid="pdf-opt-layers-full"
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => setExportLayerMode('full')}
                    >
                      Full Cover
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={exportLayerMode === 'base-only' ? 'default' : 'outline'}
                      aria-pressed={exportLayerMode === 'base-only'}
                      data-testid="pdf-opt-layers-base-only"
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => setExportLayerMode('base-only')}
                    >
                      Base Only (For HTV)
                    </Button>
                  </div>
                </div>
              )}

              {/* Independent Cut & Fold Marks (all 4 targets) */}
              <div
                data-testid="pdf-cut-fold-marks-section"
                className="flex flex-col gap-2 rounded-md border border-border bg-secondary/25 p-3 sm:col-span-2"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cut &amp; Fold Marks
                </span>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="flex items-center justify-between gap-2.5 rounded-md border border-border bg-card/75 px-3 py-2">
                    <div className="min-w-0 space-y-0.5">
                      <Label htmlFor={cutLinesSwitchId} className="text-xs">
                        Cut Lines
                      </Label>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {target === 'cover-styled' && !includeCutLines
                          ? 'Outer corner crop marks only.'
                          : 'Solid red outer trim outline.'}
                      </p>
                    </div>
                    <Switch
                      id={cutLinesSwitchId}
                      data-testid="pdf-opt-cut-lines"
                      checked={includeCutLines}
                      onCheckedChange={setIncludeCutLines}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2.5 rounded-md border border-border bg-card/75 px-3 py-2">
                    <div className="min-w-0 space-y-0.5">
                      <Label htmlFor={foldTicksSwitchId} className="text-xs">
                        External Fold Guides
                      </Label>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        Short ticks outside the cut line (trimmed off with waste).
                      </p>
                    </div>
                    <Switch
                      id={foldTicksSwitchId}
                      data-testid="pdf-opt-fold-ticks"
                      checked={includeFoldGuideTicks}
                      onCheckedChange={setIncludeFoldGuideTicks}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2.5 rounded-md border border-border bg-card/75 px-3 py-2">
                    <div className="min-w-0 space-y-0.5">
                      <Label htmlFor={foldLinesSwitchId} className="text-xs">
                        Fold Lines
                      </Label>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {isOuterTarget
                          ? 'Dashed fold lines across the cover.'
                          : 'Dashed fold lines across the piece.'}
                      </p>
                    </div>
                    <Switch
                      id={foldLinesSwitchId}
                      data-testid="pdf-opt-fold-lines"
                      checked={includeFoldLines}
                      onCheckedChange={setIncludeFoldLines}
                    />
                  </div>
                </div>
              </div>

              {/* 50 mm Scale-Check Ruler (cover-styled & outer-blueprint) */}
              {isOuterTarget && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <Label htmlFor={scaleBarSwitchId} className="text-xs">
                      50 mm Scale-Check Ruler
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Prints a 50 mm ruler bar to verify print scale.
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

              {/* Include Detached Pockets (Page 2) for 2-Sheet Slip Cover */}
              {isOuterTarget && effectiveSplitMode === 'single' && isSeparateSlipCover && (
                <div className="status-success-surface flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="space-y-0.5">
                    <Label htmlFor={appendPocketsSwitchId} className="text-xs text-current">
                      Include Detached Pockets (Page 2)
                    </Label>
                    <p className="text-[11px] opacity-90">
                      {isMultiCoverActive && packInnerPockets
                        ? 'Already packed alongside covers in the multi-cover layout.'
                        : `Appends ${detachedInnerPlan.pageCount} ${
                            detachedInnerPlan.pageCount === 1 ? 'page' : 'pages'
                          } of detached fore-edge pockets (${PAGE_SIZES[resolvedInnerPageSizeId].shortLabel}).`}
                    </p>
                  </div>
                  <Switch
                    id={appendPocketsSwitchId}
                    data-testid="pdf-opt-append-pockets"
                    disabled={isMultiCoverActive && packInnerPockets}
                    checked={effectiveAppendPockets}
                    onCheckedChange={setAppendInnerPocketsPage}
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

              {/* Collapsible Printer Margins & Calibration */}
              <div className="rounded-md border border-border bg-secondary/25 sm:col-span-2">
                <button
                  type="button"
                  aria-expanded={marginsExpanded}
                  data-testid="pdf-margins-toggle"
                  onClick={() => setMarginsExpanded((prev) => !prev)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-secondary/50"
                >
                  <span className="flex items-center gap-2">
                    <Ruler className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
                    Printer Margins &amp; Calibration
                    {!isDefaultMargins && (
                      <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                        T:{printerMargins.topMm} B:{printerMargins.bottomMm} L:
                        {printerMargins.leftMm} R:{printerMargins.rightMm} mm
                      </Badge>
                    )}
                  </span>
                  {marginsExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>

                {marginsExpanded && (
                  <div className="space-y-3 border-t border-border/70 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={marginsPresetId} className="text-[11px] text-muted-foreground">
                          Margin Preset:
                        </Label>
                        <select
                          id={marginsPresetId}
                          data-testid="pdf-margins-preset-select"
                          value={printerMargins.presetId ?? 'custom'}
                          onChange={(e) => {
                            const presetId = e.target.value as PrinterMarginPresetId;
                            const preset = getPrinterMarginPreset(presetId);
                            if (preset.margins) {
                              updatePrinterMargins({ ...preset.margins, presetId });
                            } else {
                              updatePrinterMargins({ ...printerMargins, presetId: 'custom' });
                            }
                          }}
                          className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {PRINTER_MARGIN_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={generatingTestSheet}
                        data-testid="pdf-margin-test-sheet-btn"
                        className="h-7 gap-1.5 px-2.5 text-[11px]"
                        onClick={() => void handleDownloadMarginTestSheet()}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {generatingTestSheet
                          ? 'Generating Sheet…'
                          : 'Print Margin Test Sheet (PDF)'}
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          { key: 'topMm', label: 'Top (mm)', testId: 'pdf-margin-top' },
                          { key: 'bottomMm', label: 'Bottom (mm)', testId: 'pdf-margin-bottom' },
                          { key: 'leftMm', label: 'Left (mm)', testId: 'pdf-margin-left' },
                          { key: 'rightMm', label: 'Right (mm)', testId: 'pdf-margin-right' },
                        ] as const
                      ).map(({ key, label, testId }) => (
                        <div key={key} className="space-y-1">
                          <Label
                            htmlFor={testId}
                            className="text-[11px] font-normal text-muted-foreground"
                          >
                            {label}
                          </Label>
                          <Input
                            id={testId}
                            data-testid={testId}
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            min={PRINTER_MARGIN_BOUNDS.minMm}
                            max={PRINTER_MARGIN_BOUNDS.maxMm}
                            value={printerMargins[key]}
                            onChange={(e) => {
                              const val = Number.parseFloat(e.target.value);
                              if (Number.isFinite(val)) {
                                updatePrinterMargins({
                                  ...printerMargins,
                                  [key]: val,
                                  presetId: undefined,
                                });
                              }
                            }}
                            className="h-7 font-mono text-xs"
                          />
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      Artwork, footers, and scale bars stay strictly inside your printer&apos;s
                      unprintable dead zones (useful for heavy fine-art or roll-printer bottom
                      gripper margins).
                    </p>
                  </div>
                )}
              </div>
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
                {isBusy ? (exportProgressLabel || 'Generating PDF…') : 'Download PDF'}
              </Button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
