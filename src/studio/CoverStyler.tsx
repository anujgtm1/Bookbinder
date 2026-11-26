import {
  BookOpen,
  Box,
  Compass,
  Eye,
  EyeOff,
  Layers,
  Magnet,
  Maximize2,
  Minimize2,
  Pipette,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from '@/components/FloatingHudToolbar';
import { OuterBlueprintCanvas } from '@/components/OuterBlueprintCanvas';
import {
  PdfExportDialog,
  type OuterPdfExportOptions,
  type PdfExportSelection,
} from '@/components/PdfExportDialog';
import { Badge } from '@/components/ui/badge';
import { resolveMultiBookQueueSources } from '@/core/multiBookExport';
import { getDefaultProjectRepository, type ProjectRepository } from '@/core/projectLibrary';
import type { UiDensity } from '@/core/uiDensity';
import {
  FULL_PAGE_EXIT_BUTTON_CLASS,
  getFullPageStageClass,
  useFullPageCanvas,
} from '@/hooks/useFullPageCanvas';
import type { DesignGenreId } from '@/resources/generatorProfiles';
import {
  BookParametersModel,
  type BookParameters,
  type PageSizeId,
  type PrintMediaId,
  type SplitMode,
} from '@/types/bookParams';
import { rotateOrnament90 } from '@/types/coverElements';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import { detachConstraintOnResize } from '@/types/layoutConstraints';
import type { ProjectId, SavedProjectSummary } from '@/types/projectLibrary';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { CoverImageLayerModel, nextQuarterTurn } from '@/types/studioLayer';
import { PRINT_DPI, roundTo } from '@/types/units';
import type { EyedropperTarget } from './ArtworkControlsCard';
import { Book3DPreview } from './Book3DPreview';
import {
  CanvasSelectionBar,
  type CanvasSelectionTarget,
  type VerticalAlignSlot,
} from './CanvasSelectionBar';
import { CoverCanvas2D } from './CoverCanvas2D';
import { CoverStudioToolDock, type StudioToolTab } from './CoverStudioToolDock';
import { CoverWorkbenchHeader } from './CoverWorkbenchHeader';
import { CricutExportDialog } from './CricutExportDialog';
import {
  BOOK_3D_PRESETS,
  Book3DModel,
  DEFAULT_BOOK_3D_ANGLE,
  type Book3DCameraAngle,
} from './book3d';
import {
  DEFAULT_DESIGN_GENERATOR_LOCKS,
  generateBookCoverDesign,
  type DesignGeneratorLocks,
  type GeneratedDesignSummary,
} from './designGenerator';
import {
  collectStudioCuratedFontIds,
  ensureCuratedFontsLoaded,
  getCuratedFont,
  type CustomFontAsset,
} from './fonts';
import { useCoverElementsInteraction } from './hooks/useCoverElementsInteraction';
import { useCoverStudioActions } from './hooks/useCoverStudioActions';
import { useStudioHistory, type StudioHistoryPushOptions } from './hooks/useStudioHistory';
import {
  getElementStackPosition,
  pruneLayerOrder,
  reorderStudioElement,
  type LayerReorderDirection,
} from './layerStack';
import {
  FOIL_FINISHES,
  SURFACE_MATERIALS,
  type FoilFinishId,
  type SurfaceMaterialId,
} from './materialPreview';
import { PreflightEngine } from './preflight';
import { computeStudioCanvasSpec, type CoverPdfLayerMode } from './renderEngine';
import { buildCanvasSnapTargets } from './snapGuides';
import {
  NUDGE_SHIFT_STEP_MM,
  NUDGE_STEP_MM,
  createClipboardItemFromSelection,
  duplicateSelectedInStudio,
  isEditableKeyboardTarget,
  nudgeSelectedInStudio,
  pasteClipboardItemToStudio,
  type StudioClipboardItem,
  type StudioElementSelection,
  type StudioPasteResult,
} from './studioClipboard';
import { useInteractiveLayers } from './useInteractiveLayers';

export interface CoverStylerProps {
  readonly params?: BookParameters;
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly uiDensity?: UiDensity;
  readonly customFont?: CustomFontAsset | null;
  readonly onCustomFontChange?: (font: CustomFontAsset | null) => void;
  readonly savedBookSummaries?: readonly SavedProjectSummary[];
  readonly activeProjectId?: ProjectId | null;
  readonly activeBookName?: string;
  readonly exportProgressLabel?: string | null;
  readonly onFlushActiveBook?: () => Promise<void>;
  readonly getProjectRepository?: () => Promise<ProjectRepository>;
  readonly exportingOuterPdf?: boolean;
  readonly onChange: (next: CoverStudioState) => void;
  readonly onUpdateParams?: (patch: Partial<BookParameters>) => void;
  readonly onDownloadOuterSvg?: () => void;
  readonly onDownloadOuterPdf?: (options?: OuterPdfExportOptions) => void | Promise<void>;
  readonly onOpenMeasureAndCut?: () => void;
  readonly onStatusMessage: (message: string) => void;
}

type StudioViewMode = '2d' | 'blueprint' | '3d';

export function CoverStyler({
  params,
  geometry,
  studio,
  uiDensity = 'clean',
  customFont: propCustomFont,
  onCustomFontChange,
  savedBookSummaries,
  activeProjectId = null,
  activeBookName,
  exportProgressLabel = null,
  onFlushActiveBook,
  getProjectRepository,
  exportingOuterPdf = false,
  onChange,
  onUpdateParams,
  onDownloadOuterSvg,
  onDownloadOuterPdf,
  onOpenMeasureAndCut,
  onStatusMessage,
}: CoverStylerProps) {
  const effectiveParams = useMemo(
    () => params ?? BookParametersModel.createDefault(),
    [params],
  );
  const [viewMode, setViewMode] = useState<StudioViewMode>('2d');
  const [activeToolTab, setActiveToolTab] = useState<StudioToolTab>('artwork');
  const [blueprintZoom, setBlueprintZoom] = useState(1);
  const [blueprintPan, setBlueprintPan] = useState({ x: 0, y: 0 });
  const [showBlueprintDimensions, setShowBlueprintDimensions] = useState(true);
  const [book3DAngle, setBook3DAngle] = useState<Book3DCameraAngle>(DEFAULT_BOOK_3D_ANGLE);
  const [book3DCoverOpen, setBook3DCoverOpen] = useState(false);
  const [surfaceMaterial, setSurfaceMaterial] = useState<SurfaceMaterialId>('matte-paper');
  const [foilFinish, setFoilFinish] = useState<FoilFinishId>('ink');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    () => studio.layers[studio.layers.length - 1]?.id ?? null,
  );
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedOrnamentId, setSelectedOrnamentId] = useState<string | null>(null);
  const [localCustomFont, setLocalCustomFont] = useState<CustomFontAsset | null>(null);
  const isControlledCustomFont = onCustomFontChange !== undefined;
  const customFont = isControlledCustomFont ? (propCustomFont ?? null) : localCustomFont;
  const customFontRef = useRef<CustomFontAsset | null>(customFont);
  useEffect(() => {
    customFontRef.current = customFont;
  }, [customFont]);
  const setCustomFont = useCallback<Dispatch<SetStateAction<CustomFontAsset | null>>>(
    (next) => {
      const resolved = typeof next === 'function' ? next(customFontRef.current) : next;
      customFontRef.current = resolved;
      if (onCustomFontChange) {
        onCustomFontChange(resolved);
      } else {
        setLocalCustomFont(resolved);
      }
    },
    [onCustomFontChange],
  );
  const [eyedropperTarget, setEyedropperTarget] = useState<EyedropperTarget>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showPreflightOverlays, setShowPreflightOverlays] = useState(true);
  const [checkDpi, setCheckDpi] = useState(true);
  const [ignoredIssueIds, setIgnoredIssueIds] = useState<ReadonlySet<string>>(() => new Set());
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [cricutDialogOpen, setCricutDialogOpen] = useState(false);
  const [pdfDialogTarget, setPdfDialogTarget] = useState<'cover-styled' | 'outer-blueprint' | null>(
    null,
  );
  const [pdfExportLayerModeDefault, setPdfExportLayerModeDefault] =
    useState<CoverPdfLayerMode>('full');
  const [localExportProgressLabel, setLocalExportProgressLabel] = useState<string | null>(null);
  const [localPrintMedia, setLocalPrintMedia] = useState<PrintMediaId>(effectiveParams.printMedia);
  const [localPageSize, setLocalPageSize] = useState<PageSizeId>(effectiveParams.pdfPageSize);
  const [localSplitMode, setLocalSplitMode] = useState<SplitMode>(effectiveParams.splitMode);
  const [museGenre, setMuseGenre] = useState<DesignGenreId>('surprise');
  const [museIncludeArt, setMuseIncludeArt] = useState<boolean>(true);
  const [museLocks, setMuseLocks] = useState<DesignGeneratorLocks>(DEFAULT_DESIGN_GENERATOR_LOCKS);
  const [museLastSummary, setMuseLastSummary] = useState<GeneratedDesignSummary | null>(null);
  const museSeedRef = useRef<number>(4217);
  const { isExpanded, toggleExpanded, exitExpanded } = useFullPageCanvas();

  const activePrintMedia = onUpdateParams ? effectiveParams.printMedia : localPrintMedia;
  const activePageSize = onUpdateParams ? effectiveParams.pdfPageSize : localPageSize;
  const activeSplitMode = onUpdateParams ? effectiveParams.splitMode : localSplitMode;

  const svgRef = useRef<SVGSVGElement>(null);
  const studioRef = useRef(studio);
  const onChangeRef = useRef(onChange);
  const onStatusMessageRef = useRef(onStatusMessage);
  const clipboardRef = useRef<StudioClipboardItem | null>(null);
  const pasteCountRef = useRef(0);
  useEffect(() => {
    studioRef.current = studio;
    onChangeRef.current = onChange;
    onStatusMessageRef.current = onStatusMessage;
  }, [studio, onChange, onStatusMessage]);

  const activeStudioFontKey = useMemo(
    () => [...collectStudioCuratedFontIds(studio)].sort().join(','),
    [studio],
  );
  useEffect(() => {
    const ids = collectStudioCuratedFontIds(studioRef.current);
    if (ids.length > 0) {
      void ensureCuratedFontsLoaded(ids);
    }
  }, [activeStudioFontKey]);

  const handleApplyFromHistory = useCallback((next: CoverStudioState) => {
    studioRef.current = next;
    onChangeRef.current(next);
  }, []);

  const { canUndo, canRedo, undo, redo, recordChange } = useStudioHistory(
    studio,
    handleApplyFromHistory,
  );

  const applyStudioChange = useCallback(
    (next: CoverStudioState, options?: StudioHistoryPushOptions) => {
      recordChange(next, options);
    },
    [recordChange],
  );

  const applyActionChange = useCallback(
    (next: CoverStudioState) => {
      applyStudioChange(next);
    },
    [applyStudioChange],
  );
  const actionOnChangeRef = useRef(applyActionChange);
  useEffect(() => {
    actionOnChangeRef.current = applyActionChange;
  }, [applyActionChange]);

  const applyElementChange = useCallback(
    (next: CoverStudioState) => {
      const cur = studioRef.current;
      const isStructuralDelete =
        (next.textLayers?.length ?? 0) !== (cur.textLayers?.length ?? 0) ||
        (next.ornaments?.length ?? 0) !== (cur.ornaments?.length ?? 0);
      applyStudioChange(next, isStructuralDelete ? undefined : { coalesceKey: 'drag' });
    },
    [applyStudioChange],
  );
  const elementOnChangeRef = useRef(applyElementChange);
  useEffect(() => {
    elementOnChangeRef.current = applyElementChange;
  }, [applyElementChange]);

  const spec = useMemo(() => computeStudioCanvasSpec(geometry, PRINT_DPI), [geometry]);
  const canvasBounds = useMemo<Rect2D>(
    () => ({ x: 0, y: 0, width: spec.totalWidthMm, height: spec.totalHeightMm }),
    [spec.totalWidthMm, spec.totalHeightMm],
  );
  const snapTargets = useMemo(() => buildCanvasSnapTargets(geometry, spec), [geometry, spec]);

  const handleSelectImageLayer = useCallback((id: string | null) => {
    setSelectedLayerId(id);
    if (id) {
      setSelectedTextId(null);
      setSelectedOrnamentId(null);
      setActiveToolTab('artwork');
    }
  }, []);

  const handleSelectText = useCallback((id: string | null) => {
    setSelectedTextId(id);
    if (id) {
      setSelectedLayerId(null);
      setSelectedOrnamentId(null);
      setActiveToolTab('text');
    }
  }, []);

  const handleSelectOrnament = useCallback((id: string | null) => {
    setSelectedOrnamentId(id);
    if (id) {
      setSelectedLayerId(null);
      setSelectedTextId(null);
      setActiveToolTab('designs');
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedLayerId(null);
    setSelectedTextId(null);
    setSelectedOrnamentId(null);
  }, []);

  const handleToggleMuseLock = useCallback((key: keyof DesignGeneratorLocks) => {
    setMuseLocks((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleGenerateMuseDesign = useCallback(
    (quickShuffle = false) => {
      museSeedRef.current = (((museSeedRef.current * 1664525 + 1013904223) >>> 0) % 999983) + 1;
      const effectiveLocks: DesignGeneratorLocks = quickShuffle
        ? { ...museLocks, lockTextContent: true }
        : museLocks;
      const result = generateBookCoverDesign(geometry, studioRef.current, {
        genre: museGenre,
        seed: museSeedRef.current,
        includeBackgroundArt: museIncludeArt,
        locks: effectiveLocks,
      });
      void ensureCuratedFontsLoaded([
        result.summary.titleFontId,
        result.summary.authorFontId,
        result.summary.spineFontId,
      ]);
      applyStudioChange(result.studio);
      handleClearSelection();
      setMuseLastSummary(result.summary);
      const titleLabel = getCuratedFont(result.summary.titleFontId).label;
      const authorLabel = getCuratedFont(result.summary.authorFontId).label;
      onStatusMessageRef.current(
        `Design Muse: ${result.summary.genreLabel} · ${result.summary.archetypeLabel} (${titleLabel} + ${authorLabel})`,
      );
    },
    [geometry, museGenre, museIncludeArt, museLocks, applyStudioChange, handleClearSelection],
  );

  const selectPastedResult = useCallback(
    (result: StudioPasteResult) => {
      if (result.pastedKind === 'image') {
        handleSelectImageLayer(result.pastedId);
      } else if (result.pastedKind === 'text') {
        handleSelectText(result.pastedId);
      } else {
        handleSelectOrnament(result.pastedId);
      }
    },
    [handleSelectImageLayer, handleSelectText, handleSelectOrnament],
  );

  const reconcileSelectionWithStudio = useCallback((restored: CoverStudioState) => {
    setSelectedLayerId((prev) =>
      prev && restored.layers.some((layer) => layer.id === prev) ? prev : null,
    );
    setSelectedTextId((prev) =>
      prev && (restored.textLayers ?? []).some((layer) => layer.id === prev) ? prev : null,
    );
    setSelectedOrnamentId((prev) =>
      prev && (restored.ornaments ?? []).some((layer) => layer.id === prev) ? prev : null,
    );
  }, []);

  const handleUndo = useCallback(() => {
    if (!undo()) return false;
    reconcileSelectionWithStudio(studioRef.current);
    onStatusMessageRef.current('Undid last change');
    return true;
  }, [undo, reconcileSelectionWithStudio]);

  const handleRedo = useCallback(() => {
    if (!redo()) return false;
    reconcileSelectionWithStudio(studioRef.current);
    onStatusMessageRef.current('Redid change');
    return true;
  }, [redo, reconcileSelectionWithStudio]);

  const handleReorderElement = useCallback(
    (id: string, direction: LayerReorderDirection) => {
      const cur = studioRef.current;
      const next = reorderStudioElement(cur, id, direction);
      if (next === cur) return;
      applyStudioChange(next);
    },
    [applyStudioChange],
  );

  const handleDuplicateSelected = useCallback(() => {
    const selection: StudioElementSelection = {
      imageId: selectedLayerId,
      textId: selectedTextId,
      ornamentId: selectedOrnamentId,
    };
    const result = duplicateSelectedInStudio(studioRef.current, selection, canvasBounds, spec);
    if (!result) return false;
    applyStudioChange(result.studio);
    selectPastedResult(result);
    onStatusMessageRef.current('Duplicated element');
    return true;
  }, [
    selectedLayerId,
    selectedTextId,
    selectedOrnamentId,
    canvasBounds,
    spec,
    applyStudioChange,
    selectPastedResult,
  ]);

  const {
    activeSnapGuides,
    suppressNextClickRef,
    toSvgMm,
    startMoveDrag,
    startResizeDrag,
    handleLayerWheel,
  } = useInteractiveLayers({
    svgRef,
    viewBox: canvasBounds,
    layers: studio.layers,
    selectedLayerId,
    snapTargets,
    snapEnabled,
    enabled: viewMode === '2d',
    onChangeLayers: (nextLayers) => {
      const cur = studioRef.current;
      const isStructuralDelete = nextLayers.length !== cur.layers.length;
      const nextStudio = isStructuralDelete
        ? pruneLayerOrder({ ...cur, layers: nextLayers })
        : { ...cur, layers: nextLayers };
      applyStudioChange(
        nextStudio,
        isStructuralDelete ? undefined : { coalesceKey: 'drag' },
      );
    },
    onSelectLayer: handleSelectImageLayer,
  });

  const { elementSnapGuides, startTextDrag, startOrnamentDrag, startOrnamentResize } =
    useCoverElementsInteraction({
      spec,
      studioRef,
      onChangeRef: elementOnChangeRef,
      toSvgMm,
      suppressNextClickRef,
      snapTargets,
      snapEnabled,
      enabled: viewMode === '2d',
      selectedTextId,
      selectedOrnamentId,
      onSelectText: handleSelectText,
      onSelectOrnament: handleSelectOrnament,
    });

  const actions = useCoverStudioActions({
    effectiveParams,
    geometry,
    spec,
    studio,
    studioRef,
    onChange: applyActionChange,
    onChangeRef: actionOnChangeRef,
    onUpdateParams,
    onStatusMessage,
    customFont,
    setCustomFont,
    selectedTextId,
    setSelectedTextId,
    selectedOrnamentId,
    setSelectedOrnamentId,
    setSelectedLayerId,
    setEyedropperTarget,
    onSwitchTo2D: () => setViewMode('2d'),
    onSelectImageLayer: handleSelectImageLayer,
    onSelectText: handleSelectText,
    onSelectOrnament: handleSelectOrnament,
    onClearSelection: handleClearSelection,
    toSvgMm,
  });

  const handleAddImageFilesRef = useRef(actions.handleAddImageFiles);
  useEffect(() => {
    handleAddImageFilesRef.current = actions.handleAddImageFiles;
  }, [actions.handleAddImageFiles]);

  // Global keyboard shortcuts: Undo/Redo, Copy/Paste/Duplicate, and 2D Arrow-key Nudge
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      if (document.querySelector('dialog[open]')) return;

      const selection: StudioElementSelection = {
        imageId: selectedLayerId,
        textId: selectedTextId,
        ornamentId: selectedOrnamentId,
      };
      const lowerKey = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && !e.altKey) {
        if (!e.shiftKey && lowerKey === 'z') {
          e.preventDefault();
          handleUndo();
          return;
        }
        if ((e.shiftKey && lowerKey === 'z') || lowerKey === 'y') {
          e.preventDefault();
          handleRedo();
          return;
        }
        if (!e.shiftKey && lowerKey === 'c') {
          const selectedBrowserText =
            typeof window.getSelection === 'function'
              ? (window.getSelection()?.toString() ?? '')
              : '';
          if (selectedBrowserText.length > 0) return;
          const copied = createClipboardItemFromSelection(studioRef.current, selection);
          if (copied) {
            e.preventDefault();
            clipboardRef.current = copied;
            pasteCountRef.current = 0;
            onStatusMessageRef.current('Copied element');
          }
          return;
        }
        if (!e.shiftKey && lowerKey === 'v') {
          const item = clipboardRef.current;
          if (item) {
            e.preventDefault();
            pasteCountRef.current += 1;
            const pasted = pasteClipboardItemToStudio(
              studioRef.current,
              item,
              canvasBounds,
              pasteCountRef.current,
              spec,
            );
            if (pasted) {
              applyStudioChange(pasted.studio);
              selectPastedResult(pasted);
              onStatusMessageRef.current('Pasted element');
            }
          }
          return;
        }
        if (!e.shiftKey && lowerKey === 'd') {
          const item = createClipboardItemFromSelection(studioRef.current, selection);
          if (item) {
            e.preventDefault();
            handleDuplicateSelected();
          }
          return;
        }
      }

      if (viewMode === '2d' && !e.altKey) {
        const activeElementId = selectedTextId ?? selectedOrnamentId ?? selectedLayerId;
        if (activeElementId) {
          const isBracketRight = e.code === 'BracketRight' || e.key === ']' || e.key === '}';
          const isBracketLeft = e.code === 'BracketLeft' || e.key === '[' || e.key === '{';
          if (isBracketRight) {
            e.preventDefault();
            const dir: LayerReorderDirection = e.shiftKey || e.key === '}' ? 'front' : 'forward';
            handleReorderElement(activeElementId, dir);
            return;
          }
          if (isBracketLeft) {
            e.preventDefault();
            const dir: LayerReorderDirection = e.shiftKey || e.key === '{' ? 'back' : 'backward';
            handleReorderElement(activeElementId, dir);
            return;
          }
        }
      }

      if (
        viewMode === '2d' &&
        !mod &&
        !e.altKey &&
        !e.defaultPrevented &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        const targetEl = e.target instanceof Element ? e.target : null;
        if (targetEl?.closest('[role="toolbar"]')) return;

        const step = e.shiftKey ? NUDGE_SHIFT_STEP_MM : NUDGE_STEP_MM;
        const dxMm = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dyMm = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const nudged = nudgeSelectedInStudio(
          studioRef.current,
          selection,
          dxMm,
          dyMm,
          canvasBounds,
          spec,
        );
        if (nudged) {
          e.preventDefault();
          applyStudioChange(nudged, { coalesceKey: 'arrow-nudge' });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    viewMode,
    selectedLayerId,
    selectedTextId,
    selectedOrnamentId,
    canvasBounds,
    spec,
    handleUndo,
    handleRedo,
    handleDuplicateSelected,
    handleReorderElement,
    applyStudioChange,
    selectPastedResult,
  ]);

  // OS Clipboard Image Paste (screenshots or copied images dropped directly onto cover canvas)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      if (document.querySelector('dialog[open]')) return;

      const items = Array.from(e.clipboardData?.items ?? []);
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0 && e.clipboardData?.files) {
        for (const file of Array.from(e.clipboardData.files)) {
          if (file.type.startsWith('image/')) {
            imageFiles.push(file);
          }
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void handleAddImageFilesRef.current(imageFiles);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const preflight = useMemo(
    () =>
      PreflightEngine.evaluate(effectiveParams, geometry, studio, {
        checkDpi,
        ignoredIssueIds,
      }),
    [effectiveParams, geometry, studio, checkDpi, ignoredIssueIds],
  );
  const maxFontSizePt = CoverStudioModel.maxSpineFontSizePt(geometry.outerWrap.spineRect.width);
  const effectiveFontSizePt = CoverStudioModel.effectiveSpineFontSizePt(
    studio.spineText.fontSizePt,
    geometry.outerWrap.spineRect.width,
  );
  const activePreset3D = Book3DModel.matchPreset(book3DAngle);

  const selectedLayer = useMemo(
    () => studio.layers.find((l) => l.id === selectedLayerId) ?? null,
    [studio.layers, selectedLayerId],
  );
  const selectedTextLayer = useMemo(
    () =>
      selectedTextId
        ? ((studio.textLayers ?? []).find((t) => t.id === selectedTextId) ?? null)
        : null,
    [studio.textLayers, selectedTextId],
  );
  const selectedOrnamentLayer = useMemo(
    () =>
      selectedOrnamentId
        ? ((studio.ornaments ?? []).find((o) => o.id === selectedOrnamentId) ?? null)
        : null,
    [studio.ornaments, selectedOrnamentId],
  );
  const activeSelection = useMemo<CanvasSelectionTarget | null>(() => {
    if (selectedTextLayer) return { kind: 'text', layer: selectedTextLayer };
    if (selectedOrnamentLayer) return { kind: 'ornament', layer: selectedOrnamentLayer };
    if (selectedLayer) return { kind: 'image', layer: selectedLayer };
    return null;
  }, [selectedTextLayer, selectedOrnamentLayer, selectedLayer]);
  const activeSelectionStackPosition = useMemo(
    () => (activeSelection ? getElementStackPosition(studio, activeSelection.layer.id) : null),
    [studio, activeSelection],
  );
  const hasSelectedElement = activeSelection !== null;

  const handleSelectionFlipH = () => {
    if (!activeSelection) return;
    if (activeSelection.kind === 'text') {
      actions.handleUpdateTextLayer(activeSelection.layer.id, {
        flipX: !activeSelection.layer.flipX,
      });
    } else if (activeSelection.kind === 'ornament') {
      actions.handleUpdateOrnament(activeSelection.layer.id, {
        flipX: !activeSelection.layer.flipX,
      });
    } else {
      actions.updateLayer(activeSelection.layer.id, (layer) => ({
        ...layer,
        flipX: !layer.flipX,
      }));
    }
  };

  const handleSelectionFlipV = () => {
    if (!activeSelection) return;
    if (activeSelection.kind === 'text') {
      actions.handleUpdateTextLayer(activeSelection.layer.id, {
        flipY: !activeSelection.layer.flipY,
      });
    } else if (activeSelection.kind === 'ornament') {
      actions.handleUpdateOrnament(activeSelection.layer.id, {
        flipY: !activeSelection.layer.flipY,
      });
    } else {
      actions.updateLayer(activeSelection.layer.id, (layer) => ({
        ...layer,
        flipY: !layer.flipY,
      }));
    }
  };

  const handleSelectionRotate90 = () => {
    if (!activeSelection) return;
    if (activeSelection.kind === 'text') {
      actions.handleUpdateTextLayer(activeSelection.layer.id, {
        rotationDeg: nextQuarterTurn(activeSelection.layer.rotationDeg),
      });
    } else if (activeSelection.kind === 'ornament') {
      const rotated = rotateOrnament90(activeSelection.layer);
      actions.handleUpdateOrnament(activeSelection.layer.id, {
        xMm: rotated.xMm,
        yMm: rotated.yMm,
        widthMm: rotated.widthMm,
        heightMm: rotated.heightMm,
        rotationDeg: rotated.rotationDeg,
        layoutConstraint: detachConstraintOnResize(activeSelection.layer.layoutConstraint),
      });
    } else {
      actions.updateLayer(activeSelection.layer.id, (layer) => ({
        ...layer,
        rotationDeg: nextQuarterTurn(layer.rotationDeg),
        layoutConstraint: detachConstraintOnResize(layer.layoutConstraint),
      }));
    }
  };

  const handleSelectionQuickAlign = (slot: VerticalAlignSlot) => {
    if (!activeSelection) return;
    if (activeSelection.kind === 'text') {
      actions.handleQuickAlignText(activeSelection.layer.id, slot);
    } else if (activeSelection.kind === 'ornament') {
      actions.handleQuickAlignOrnament(activeSelection.layer.id, slot);
    } else {
      actions.handleQuickAlignImage(activeSelection.layer.id, slot);
    }
  };

  const handleSelectionChangeColor = (hex: string) => {
    if (!activeSelection || activeSelection.kind === 'image') return;
    if (activeSelection.kind === 'text') {
      applyStudioChange(
        {
          ...studio,
          textLayers: (studio.textLayers ?? []).map((t) =>
            t.id === activeSelection.layer.id ? { ...t, color: hex } : t,
          ),
        },
        { coalesceKey: 'color' },
      );
    } else {
      applyStudioChange(
        {
          ...studio,
          ornaments: (studio.ornaments ?? []).map((o) =>
            o.id === activeSelection.layer.id ? { ...o, color: hex } : o,
          ),
        },
        { coalesceKey: 'color' },
      );
    }
  };

  const handleSelectionDelete = () => {
    if (!activeSelection) return;
    if (activeSelection.kind === 'text') {
      actions.handleDeleteTextLayer(activeSelection.layer.id);
    } else if (activeSelection.kind === 'ornament') {
      actions.handleDeleteOrnament(activeSelection.layer.id);
    } else {
      const remaining = studio.layers.filter((l) => l.id !== activeSelection.layer.id);
      applyStudioChange(pruneLayerOrder({ ...studio, layers: remaining }));
      setSelectedLayerId(remaining[remaining.length - 1]?.id ?? null);
    }
  };

  const visibleSnapGuides =
    elementSnapGuides.length > 0 ? elementSnapGuides : activeSnapGuides;

  const adjustBlueprintZoom = (delta: number) => {
    setBlueprintZoom((prev) => roundTo(Math.min(3.5, Math.max(0.5, prev + delta)), 2));
  };

  const resetBlueprintView = () => {
    setBlueprintZoom(1);
    setBlueprintPan({ x: 0, y: 0 });
  };

  const handleConfirmPdfExport = async (selection: PdfExportSelection) => {
    if (
      selection.target === 'outer-blueprint' ||
      (selection.target === 'cover-styled' && selection.splitMode === 'three-piece')
    ) {
      if (onDownloadOuterPdf) {
        await onDownloadOuterPdf({
          splitMode: selection.splitMode,
          printMediaId: selection.printMediaId,
          tileOverlapMm: selection.tileOverlapMm,
          includeScaleBar: selection.includeScaleBar,
          includeCutLines: selection.includeCutLines,
          includeFoldLines: selection.includeFoldLines,
          includeFoldGuideTicks: selection.includeFoldGuideTicks,
          appendInnerPocketsPage: selection.appendInnerPocketsPage,
          innerPageSizeId: selection.pageSizeId,
          customRollWidthMm: selection.customRollWidthMm,
          printerMargins: selection.printerMargins,
          rollNesting: selection.rollNesting,
          sheetNesting: selection.sheetNesting,
          multiBookQueueEntries: selection.multiBookQueueEntries,
        });
        return;
      }
    }

    let resolvedRollNesting = selection.rollNesting;
    let resolvedSheetNesting = selection.sheetNesting;
    let skippedMultiBookCount = 0;

    try {
      const queueEntries = selection.multiBookQueueEntries;
      if (
        queueEntries &&
        queueEntries.length > 0 &&
        (selection.sheetNesting?.enabled || selection.rollNesting?.enabled)
      ) {
        await onFlushActiveBook?.();
        const repository = await (getProjectRepository
          ? getProjectRepository()
          : getDefaultProjectRepository());
        setLocalExportProgressLabel(
          `Rendering 1/${queueEntries.length}: ${queueEntries[0].label}…`,
        );
        const resolved = await resolveMultiBookQueueSources(queueEntries, {
          repository,
          target: 'cover-styled',
          dpi: selection.dpi,
          includeGuides: selection.includeGuides,
          exportLayerMode: selection.exportLayerMode,
          onProgress: (done, total) => {
            const nextEntry = queueEntries[done];
            setLocalExportProgressLabel(
              done < total && nextEntry
                ? `Rendering ${done + 1}/${total}: ${nextEntry.label}…`
                : 'Composing PDF…',
            );
          },
        });
        skippedMultiBookCount = resolved.skippedIds.length;
        if (resolvedSheetNesting?.enabled) {
          resolvedSheetNesting = {
            ...resolvedSheetNesting,
            extraQueueItems: resolved.items,
          };
        }
        if (resolvedRollNesting?.enabled) {
          resolvedRollNesting = {
            ...resolvedRollNesting,
            extraQueueItems: resolved.items,
          };
        }
      }

      await actions.handleExportPrintPdf({
        includeCutLines: selection.includeCutLines,
        includeFoldLines: selection.includeFoldLines,
        includeFoldGuideTicks: selection.includeFoldGuideTicks,
        printMediaId: selection.printMediaId,
        dpi: selection.dpi,
        tileOverlapMm: selection.tileOverlapMm,
        includeScaleBar: selection.includeScaleBar,
        splitMode: selection.splitMode,
        exportLayerMode: selection.exportLayerMode,
        appendInnerPocketsPage: selection.appendInnerPocketsPage,
        innerPageSizeId: selection.pageSizeId,
        customRollWidthMm: selection.customRollWidthMm,
        printerMargins: selection.printerMargins,
        rollNesting: resolvedRollNesting,
        sheetNesting: resolvedSheetNesting,
        skippedMultiBookCount,
      });
    } finally {
      setLocalExportProgressLabel(null);
    }
  };

  return (
    <div
      className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_350px] xl:items-start"
      data-testid="cover-styler"
    >
      {/* Center Column: Calm Washi Export Bar + Walnut-Framed Self-Healing Cutting Mat */}
      <div className="flex min-w-0 flex-col gap-3">
        <CoverWorkbenchHeader
          geometry={geometry}
          spec={spec}
          unit={effectiveParams.unit}
          uiDensity={uiDensity}
          exportingKind={actions.exportingKind}
          exportingOuterPdf={exportingOuterPdf}
          canUndo={canUndo}
          canRedo={canRedo}
          canDuplicate={hasSelectedElement}
          onUndo={() => {
            handleUndo();
          }}
          onRedo={() => {
            handleRedo();
          }}
          onDuplicate={() => {
            handleDuplicateSelected();
          }}
          onShuffleDesign={() => handleGenerateMuseDesign(true)}
          onOpenMeasureAndCut={onOpenMeasureAndCut}
          onExportPrintPdf={() => {
            setPdfExportLayerModeDefault('full');
            setPdfDialogTarget('cover-styled');
          }}
          onExportAffinityPng={() => void actions.handleExportAffinityPng()}
          onExportAffinitySvg={() => void actions.handleExportAffinitySvg()}
          onOpenCricutDialog={() => setCricutDialogOpen(true)}
          onDownloadOuterSvg={onDownloadOuterSvg}
          onDownloadOuterPdf={
            onDownloadOuterPdf
              ? () => {
                  setPdfExportLayerModeDefault('full');
                  setPdfDialogTarget('outer-blueprint');
                }
              : undefined
          }
        />

        <section
          aria-label="Interactive Cover and Spine Workbench"
          className="cutting-mat-on-desk overflow-hidden rounded-[3px]"
        >
          {/* Full-Bleed Self-Healing Bindery Cutting Mat Stage resting on the Walnut Desk */}
          <div
            id="studio-mat-viewport"
            data-testid="studio-canvas-stage"
            data-expanded={isExpanded ? 'true' : 'false'}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length === 0) return;
              const dropPt =
                viewMode === '2d' ? (toSvgMm(e.clientX, e.clientY) ?? undefined) : undefined;
              void actions.handleAddImageFiles(files, dropPt);
            }}
            className={`cutting-mat-surface flex flex-col overflow-hidden motion-safe:transition-colors ${getFullPageStageClass(isExpanded)} ${
              !isExpanded
                ? 'border-y-0 xl:h-[calc(100vh-248px)] xl:min-h-[480px] xl:max-h-[650px]'
                : ''
            } ${
              isDraggingOver
                ? 'ring-2 ring-inset ring-brass-bright/80'
                : eyedropperTarget
                  ? 'cursor-crosshair ring-2 ring-inset ring-amber-400'
                  : ''
            }`}
          >
            {/* Subtle Printed Brass Corner Registration Ticks */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-2 left-2 z-10 h-3 w-3 border-t border-l border-brass-bright/45"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-2 right-2 z-10 h-3 w-3 border-t border-r border-brass-bright/45"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-2 left-2 z-10 h-3 w-3 border-b border-l border-brass-bright/45"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-2 bottom-2 z-10 h-3 w-3 border-r border-b border-brass-bright/45"
            />

            {/* Docked Contextual Canvas Selection Bar (normal & Full Screen 2D modes) */}
            {viewMode === '2d' && (
              <CanvasSelectionBar
                selection={activeSelection}
                controlsId="studio-mat-viewport"
                stackPosition={activeSelectionStackPosition}
                onFlipH={handleSelectionFlipH}
                onFlipV={handleSelectionFlipV}
                onRotate90={handleSelectionRotate90}
                onReorder={(direction) => {
                  if (activeSelection) {
                    handleReorderElement(activeSelection.layer.id, direction);
                  }
                }}
                onQuickAlign={handleSelectionQuickAlign}
              onFitMargin={
                activeSelection?.kind === 'ornament'
                  ? (marginMm) =>
                      actions.handleFitOrnamentWithMargin(activeSelection.layer.id, marginMm)
                  : undefined
              }
              onDetachConstraint={
                activeSelection
                  ? () =>
                      actions.handleDetachConstraint({
                        kind: activeSelection.kind,
                        id: activeSelection.layer.id,
                      })
                  : undefined
              }
              onDetachSeriesLayer={
                activeSelection
                  ? () =>
                      actions.handleDetachSeriesLayer(
                        activeSelection.kind,
                        activeSelection.layer.id,
                      )
                  : undefined
              }
              onChangeColor={handleSelectionChangeColor}
              onDuplicate={() => {
                handleDuplicateSelected();
              }}
              onDelete={handleSelectionDelete}
              onDeselect={handleClearSelection}
            />
          )}

          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden pt-10">
          {/* Contextual Top Banner (Eyedropper active & Full-Page Exit Pill) */}
          <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2">
            {eyedropperTarget && (
              <Badge
                variant="warning"
                data-testid="eyedropper-active-banner"
                className="pointer-events-auto border-amber-400/60 bg-amber-950/90 text-amber-100 shadow-md"
              >
                <Pipette className="h-3.5 w-3.5" aria-hidden="true" />
                Click anywhere on the cover preview to sample color for {eyedropperTarget}
              </Badge>
            )}
            {isExpanded && (
              <button
                type="button"
                onClick={exitExpanded}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                data-testid="studio-exit-fullscreen-btn"
                aria-label="Exit full screen canvas"
                title="Exit full screen (Esc)"
                className={FULL_PAGE_EXIT_BUTTON_CLASS}
              >
                <Minimize2 className="h-3.5 w-3.5 text-brass-bright" aria-hidden="true" />
                <span>Exit Full Screen</span>
                <kbd className="rounded border border-[#f6efe2]/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#f6efe2]/80">
                  Esc
                </kbd>
              </button>
            )}
          </div>

          {/* Dropzone visual cue */}
          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-brass-bright bg-black/45 backdrop-blur-[1px]">
              <span className="rounded-full border border-brass-bright/60 bg-black/75 px-4 py-1.5 font-serif text-sm font-semibold text-[#faf6ee] shadow-lg">
                Drop image onto Back Cover, Spine, or Front Cover
              </span>
            </div>
          )}

          {viewMode === '2d' ? (
            <CoverCanvas2D
              svgRef={svgRef}
              geometry={geometry}
              spec={spec}
              canvasBounds={canvasBounds}
              studio={studio}
              customFont={customFont}
              selectedLayer={selectedLayer}
              selectedTextId={selectedTextId}
              selectedOrnamentId={selectedOrnamentId}
              eyedropperTarget={eyedropperTarget}
              showGuides={showGuides}
              showPreflightOverlays={showPreflightOverlays}
              surfaceMaterial={surfaceMaterial}
              preflight={preflight}
              activeIssueId={activeIssueId}
              visibleSnapGuides={visibleSnapGuides}
              suppressNextClickRef={suppressNextClickRef}
              onClearSelection={handleClearSelection}
              onSampleColorAtClick={(x, y, target) => void actions.sampleColorAtSvgClick(x, y, target)}
              onSelectImageLayer={handleSelectImageLayer}
              onStartLayerMove={startMoveDrag}
              onStartLayerResize={startResizeDrag}
              onLayerWheel={handleLayerWheel}
              onSelectText={handleSelectText}
              onStartTextDrag={startTextDrag}
              onSelectOrnament={handleSelectOrnament}
              onStartOrnamentDrag={startOrnamentDrag}
              onStartOrnamentResize={startOrnamentResize}
            />
          ) : viewMode === 'blueprint' ? (
            <OuterBlueprintCanvas
              geometry={geometry}
              splitMode={effectiveParams.splitMode}
              unit={effectiveParams.unit}
              zoom={blueprintZoom}
              onAdjustZoom={adjustBlueprintZoom}
              pan={blueprintPan}
              onPanChange={setBlueprintPan}
              showDimensions={showBlueprintDimensions}
            />
          ) : (
            <div className="h-full w-full pb-12">
              <Book3DPreview
                geometry={geometry}
                studio={studio}
                customFont={customFont}
                angle={book3DAngle}
                isCoverOpen={book3DCoverOpen}
                surfaceMaterial={surfaceMaterial}
                foilFinish={foilFinish}
                onAngleChange={setBook3DAngle}
              />
            </div>
          )}

          {/* Floating Bottom-Center HUD Pill Toolbar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3.5 z-20 flex justify-center px-3">
            <FloatingHudToolbar
              label="Cover preview view and overlay controls"
              controlsId="studio-mat-viewport"
              className="pointer-events-auto max-w-full overflow-x-auto"
              testId="studio-hud-toolbar"
            >
              <HudGroup label="Preview mode">
                <HudButton
                  pressed={viewMode === '2d'}
                  onClick={() => setViewMode('2d')}
                  data-testid="studio-view-2d-btn"
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  Styled Cover
                </HudButton>
                <HudButton
                  pressed={viewMode === 'blueprint'}
                  onClick={() => {
                    setEyedropperTarget(null);
                    setViewMode('blueprint');
                  }}
                  data-testid="studio-view-blueprint-btn"
                >
                  <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                  Blueprint
                </HudButton>
                <HudButton
                  pressed={viewMode === '3d'}
                  onClick={() => {
                    setEyedropperTarget(null);
                    setViewMode('3d');
                  }}
                  data-testid="studio-view-3d-btn"
                >
                  <Box className="h-3.5 w-3.5" aria-hidden="true" />
                  3D Book
                </HudButton>
              </HudGroup>

              <HudSeparator />

              {viewMode === '2d' ? (
                <HudGroup label="Canvas overlays">
                  <HudButton
                    pressed={showGuides}
                    onClick={() => setShowGuides((v) => !v)}
                    data-testid="studio-guides-btn"
                  >
                    {showGuides ? (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Guides
                  </HudButton>
                  <HudButton
                    pressed={snapEnabled}
                    onClick={() => setSnapEnabled((v) => !v)}
                    title="Magnetic smart snap guides (hold Alt while dragging to bypass)"
                    data-testid="studio-snap-btn"
                  >
                    <Magnet className="h-3.5 w-3.5" aria-hidden="true" />
                    Snap
                  </HudButton>
                  <HudButton
                    pressed={showPreflightOverlays}
                    onClick={() => {
                      setShowPreflightOverlays((v) => !v);
                      if (preflight.issues.length > 0) {
                        setActiveToolTab('preflight');
                      }
                    }}
                    data-testid="studio-preflight-hud-btn"
                  >
                    {preflight.status === 'pass' ? (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {preflight.status === 'pass'
                      ? 'Preflight OK'
                      : `Preflight (${preflight.errorCount + preflight.warningCount})`}
                  </HudButton>
                </HudGroup>
              ) : viewMode === 'blueprint' ? (
                <>
                  <HudGroup label="Blueprint overlays">
                    <HudButton
                      pressed={showBlueprintDimensions}
                      onClick={() => setShowBlueprintDimensions((v) => !v)}
                      title="Show/hide manual-cutting dimension lines, cumulative ruler marks, and 45° miter callout"
                      data-testid="blueprint-dimensions-btn"
                    >
                      <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                      Dimensions
                    </HudButton>
                  </HudGroup>
                  <HudSeparator />
                  <HudGroup label="Blueprint zoom">
                    <HudButton
                      aria-label="Zoom out blueprint"
                      title="Zoom out"
                      onClick={() => adjustBlueprintZoom(-0.25)}
                      className="px-2"
                    >
                      <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                    </HudButton>
                    <span className="min-w-11 text-center font-mono text-[11px] text-[#f6efe2]/90">
                      {Math.round(blueprintZoom * 100)}%
                    </span>
                    <HudButton
                      aria-label="Zoom in blueprint"
                      title="Zoom in"
                      onClick={() => adjustBlueprintZoom(0.25)}
                      className="px-2"
                    >
                      <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                    </HudButton>
                    <HudButton
                      aria-label="Reset blueprint zoom and pan"
                      title="Reset zoom & pan"
                      onClick={resetBlueprintView}
                      className="px-2"
                    >
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </HudButton>
                  </HudGroup>
                </>
              ) : (
                <>
                  <HudGroup label="3D camera angles">
                    {BOOK_3D_PRESETS.map((preset) => (
                      <HudButton
                        key={preset.id}
                        pressed={activePreset3D === preset.id}
                        onClick={() => setBook3DAngle(preset.angle)}
                        data-testid={`book3d-preset-${preset.id}`}
                      >
                        {preset.label}
                      </HudButton>
                    ))}
                  </HudGroup>
                  <HudSeparator />
                  <HudGroup label="Book cover state">
                    <HudButton
                      pressed={book3DCoverOpen}
                      onClick={() => {
                        setBook3DCoverOpen((wasOpen) => {
                          const nextOpen = !wasOpen;
                          if (nextOpen) {
                            setBook3DAngle({ yawDeg: -10, pitchDeg: -8 });
                          }
                          return nextOpen;
                        });
                      }}
                      data-testid="book3d-open-cover-btn"
                      title="Swing open the front cover to peek inside at your styled inner pocket"
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      {book3DCoverOpen ? 'Close Cover' : 'Open Cover'}
                    </HudButton>
                  </HudGroup>
                </>
              )}

              <HudSeparator />

              <HudGroup label="Canvas size">
                <HudButton
                  pressed={isExpanded}
                  onClick={toggleExpanded}
                  title="Expand canvas to full page (Esc to exit)"
                  data-testid="studio-fullscreen-btn"
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isExpanded ? 'Exit' : 'Full Screen'}
                </HudButton>
              </HudGroup>
            </FloatingHudToolbar>
          </div>
          </div>
        </div>

        {/* Non-Printing Visual Material & Foil Preview Strip */}
        {(viewMode === '2d' || viewMode === '3d') && (
          <div
            data-testid="studio-preview-finish-bar"
            className="washi-sheet flex flex-wrap items-center justify-between gap-2 border-t border-border px-3.5 py-1.5 text-xs shadow-none"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                title="Visual-only material & foil preview — never changes printed PDF, PNG, or SVG exports"
              >
                <Sparkles className="h-3 w-3 text-vermilion" aria-hidden="true" />
                Preview
              </span>

              <div
                role="group"
                aria-label="Surface material preview"
                className="inline-flex flex-wrap items-center gap-1"
              >
                <span className="mr-0.5 text-[11px] text-muted-foreground">Surface:</span>
                {SURFACE_MATERIALS.map((mat) => {
                  const active = surfaceMaterial === mat.id;
                  return (
                    <button
                      key={mat.id}
                      type="button"
                      aria-pressed={active}
                      title={`${mat.label} — ${mat.description} (visual preview only)`}
                      data-testid={`material-${mat.id}`}
                      onClick={() => setSurfaceMaterial(mat.id)}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[11px] font-medium motion-safe:transition-colors ${
                        active
                          ? 'border-vermilion/70 bg-vermilion/12 text-foreground shadow-2xs'
                          : 'border-border/80 bg-card/75 text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {mat.shortLabel}
                    </button>
                  );
                })}
              </div>

              {viewMode === '3d' && (
                <div
                  role="group"
                  aria-label="Foil finish preview"
                  className="inline-flex flex-wrap items-center gap-1"
                >
                  <span className="mr-0.5 text-[11px] text-muted-foreground">Foil:</span>
                  {FOIL_FINISHES.map((foil) => {
                    const active = foilFinish === foil.id;
                    return (
                      <button
                        key={foil.id}
                        type="button"
                        aria-pressed={active}
                        title={`${foil.label} (visual 3D preview only)`}
                        data-testid={`foil-${foil.id}`}
                        onClick={() => setFoilFinish(foil.id)}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[11px] font-medium motion-safe:transition-colors ${
                          active
                            ? 'border-vermilion/70 bg-vermilion/12 text-foreground shadow-2xs'
                            : 'border-border/80 bg-card/75 text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/25"
                          style={{ backgroundColor: foil.swatchHex }}
                        />
                        {foil.shortLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <span className="font-mono text-[10.5px] text-muted-foreground/85">
              Visual preview only
            </span>
          </div>
        )}

        {/* Subtle Contextual Hint Footer Strip */}
        <div className="washi-sheet flex flex-wrap items-center justify-between gap-2 border-t border-border/80 px-3.5 py-1.5 text-[11.5px] text-muted-foreground shadow-none">
          <span className="min-w-0 flex-1 truncate">
            {viewMode === '3d'
              ? 'Drag directly on the hardcover volume (or use Arrow keys) to inspect Front, Spine, and Back proportions.'
              : viewMode === 'blueprint'
                ? 'Solid Red: 45° Miter Cut Line • Dashed Blue: Board Guides • Brass: Hinge Spacers • Green: Bleed.'
                : selectedLayer
                  ? `Selected "${selectedLayer.fileName}" — drag or Arrow keys to nudge, pull corners or scroll wheel to resize, Cmd/Ctrl+D to duplicate.`
                  : 'Drop or paste (Cmd/Ctrl+V) PNG, JPG, WEBP, or SVG artwork onto the cutting mat, or style in the right inspector.'}
          </span>
          <span className="shrink-0 font-mono text-[11px] font-medium text-vermilion">
            {spec.totalWidthMm.toFixed(1)} × {spec.totalHeightMm.toFixed(1)} mm @ 300 DPI
          </span>
        </div>
        </section>
      </div>

      {/* Right Docked Washi Studio Inspector (directly beside cutting mat on desktop xl:) */}
      <CoverStudioToolDock
        activeTab={activeToolTab}
        onTabChange={setActiveToolTab}
        studio={studio}
        customFont={customFont}
        selectedLayerId={selectedLayerId}
        selectedTextId={selectedTextId}
        selectedOrnamentId={selectedOrnamentId}
        eyedropperTarget={eyedropperTarget}
        extendingStub={actions.extendingStub}
        sampledEdgeHex={actions.sampledEdgeHex}
        maxFontSizePt={maxFontSizePt}
        effectiveFontSizePt={effectiveFontSizePt}
        savedPresets={actions.savedPresets}
        preflight={preflight}
        showPreflightOverlays={showPreflightOverlays}
        checkDpi={checkDpi}
        activeIssueId={activeIssueId}
        onSelectImageLayer={handleSelectImageLayer}
        onAddImageFiles={(files) => void actions.handleAddImageFiles(files)}
        onApplyProceduralArtwork={actions.handleApplyProceduralArtwork}
        onQuickFitLayer={actions.handleQuickFitLayer}
        onExtendLayerStub={(id, mode) => void actions.handleExtendLayerStub(id, mode)}
        onMatchSpineBackToEdge={(hex) => {
          actions.updateStudio({ spineBgColor: hex, backBgColor: hex, frontBgColor: hex });
          onStatusMessage(`Matched spine & back color to cover edge (${hex.toUpperCase()})`);
        }}
        onSetLayerClip={(id, clipZone) =>
          actions.updateLayer(id, (layer) => ({ ...layer, clipZone }))
        }
        onScaleLayer={(id, factor) =>
          actions.updateLayer(id, (layer) => {
            const scaled = CoverImageLayerModel.scaleAroundCenter(layer, factor);
            return {
              ...scaled,
              layoutConstraint: detachConstraintOnResize(layer.layoutConstraint),
            };
          })
        }
        onToggleLayerFlip={(id, axis) =>
          actions.updateLayer(id, (layer) =>
            axis === 'x' ? { ...layer, flipX: !layer.flipX } : { ...layer, flipY: !layer.flipY },
          )
        }
        onUpdateLayer={(id, patch) =>
          actions.updateLayer(id, (layer) => {
            const resizesOrRotates =
              patch.widthMm !== undefined ||
              patch.heightMm !== undefined ||
              patch.rotationDeg !== undefined;
            const hasExplicitConstraint = Object.prototype.hasOwnProperty.call(
              patch,
              'layoutConstraint',
            );
            const next = { ...layer, ...patch };
            if (resizesOrRotates && !hasExplicitConstraint) {
              return {
                ...next,
                layoutConstraint: detachConstraintOnResize(layer.layoutConstraint),
              };
            }
            return next;
          })
        }
        onReorderLayer={(id, direction) => handleReorderElement(id, direction)}
        onReorderElement={handleReorderElement}
        onDetachSeriesLayer={actions.handleDetachSeriesLayer}
        onDeleteLayer={(id) => {
          const remaining = studio.layers.filter((l) => l.id !== id);
          applyStudioChange(pruneLayerOrder({ ...studio, layers: remaining }));
          if (selectedLayerId === id) {
            setSelectedLayerId(remaining[remaining.length - 1]?.id ?? null);
          }
        }}
        onUpdateStudio={(patch) => {
          const keys = Object.keys(patch);
          const isColorOnly =
            keys.length > 0 &&
            keys.every((k) => k === 'backBgColor' || k === 'spineBgColor' || k === 'frontBgColor');
          applyStudioChange(
            { ...studio, ...patch },
            isColorOnly ? { coalesceKey: 'color' } : undefined,
          );
        }}
        onToggleEyedropper={(target) => {
          setViewMode('2d');
          setEyedropperTarget((prev) => (prev === target ? null : target));
        }}
        onSelectText={handleSelectText}
        onAddTextPreset={actions.handleAddTextPreset}
        onUpdateTextLayer={actions.handleUpdateTextLayer}
        onQuickAlignText={actions.handleQuickAlignText}
        onDeleteTextLayer={actions.handleDeleteTextLayer}
        onCustomFontSelected={(file, textLayerId) =>
          void actions.handleCustomFontUpload(file, textLayerId)
        }
        onSelectOrnament={handleSelectOrnament}
        onAddOrnament={actions.handleAddOrnament}
        onImportSvgStamp={(file, zone, color) => void actions.handleImportSvgStamp(file, zone, color)}
        onUpdateOrnament={actions.handleUpdateOrnament}
        onScaleOrnament={actions.handleScaleOrnament}
        onFitOrnamentToBoard={actions.handleFitOrnamentToBoard}
        onFitOrnamentWithMargin={actions.handleFitOrnamentWithMargin}
        onCenterOrnament={actions.handleCenterOrnament}
        onQuickAlignOrnament={actions.handleQuickAlignOrnament}
        onDeleteOrnament={actions.handleDeleteOrnament}
        onUpdateSpineText={actions.updateSpineText}
        designMuse={{
          genre: museGenre,
          includeBackgroundArt: museIncludeArt,
          locks: museLocks,
          lastSummary: museLastSummary,
          onGenreChange: setMuseGenre,
          onIncludeBackgroundArtChange: setMuseIncludeArt,
          onToggleLock: handleToggleMuseLock,
          onGenerate: () => handleGenerateMuseDesign(false),
        }}
        onSavePreset={actions.handleSaveDesignPreset}
        onApplyPreset={actions.handleApplyDesignPreset}
        onDeletePreset={actions.handleDeleteDesignPreset}
        onExportPresets={actions.handleExportDesignPresets}
        onImportPresets={(file) => void actions.handleImportDesignPresets(file)}
        onTogglePreflightOverlays={setShowPreflightOverlays}
        onToggleCheckDpi={(next) => {
          setCheckDpi(next);
          onStatusMessage(next ? '300 DPI print check enabled' : '300 DPI print check paused');
        }}
        onHighlightIssue={setActiveIssueId}
        onApplyQuickFix={actions.handleApplyQuickFix}
        onIgnoreIssue={(issueId) => {
          setIgnoredIssueIds((prev) => {
            const next = new Set(prev);
            next.add(issueId);
            return next;
          });
          setActiveIssueId((prev) => (prev === issueId ? null : prev));
        }}
        onRestoreIgnored={() => {
          setIgnoredIssueIds(new Set());
          onStatusMessage('Restored all ignored preflight warnings');
        }}
      />

      {/* Cricut / Silhouette / ScanNCut HTV & Foil Vector SVG Export Modal */}
      <CricutExportDialog
        open={cricutDialogOpen}
        geometry={geometry}
        studio={studio}
        customFont={customFont}
        unit={effectiveParams.unit}
        onOpenChange={setCricutDialogOpen}
        onStatusMessage={onStatusMessage}
        onOpenBasePdfForHtv={() => {
          setPdfExportLayerModeDefault('base-only');
          setPdfDialogTarget('cover-styled');
        }}
      />

      {/* Unified Print & Export PDF Modal */}
      <PdfExportDialog
        open={pdfDialogTarget !== null}
        target={pdfDialogTarget ?? 'cover-styled'}
        geometry={geometry}
        unit={effectiveParams.unit}
        printMediaId={activePrintMedia}
        onChangePrintMedia={(mediaId) => {
          setLocalPrintMedia(mediaId);
          onUpdateParams?.({ printMedia: mediaId });
        }}
        customRollWidthMm={effectiveParams.customRollWidthMm}
        onChangeCustomRollWidthMm={
          onUpdateParams
            ? (customRollWidthMm) => onUpdateParams({ customRollWidthMm })
            : undefined
        }
        pageSizeId={activePageSize}
        onChangePageSize={(sizeId) => {
          setLocalPageSize(sizeId);
          onUpdateParams?.({ pdfPageSize: sizeId });
        }}
        splitMode={activeSplitMode}
        onChangeSplitMode={(mode) => {
          setLocalSplitMode(mode);
          onUpdateParams?.({ splitMode: mode });
        }}
        onReduceFlapWidth={
          onUpdateParams
            ? (widthMm) => onUpdateParams({ jacketFlapWidthMm: widthMm })
            : undefined
        }
        onDetachSlipFlaps={
          onUpdateParams ? () => onUpdateParams({ softcoverPocketMode: 'separate' }) : undefined
        }
        defaultIncludeCutLines={
          pdfDialogTarget === 'cover-styled' ? studio.cutLineMode === 'full-cut-miter' : true
        }
        defaultExportLayerMode={pdfExportLayerModeDefault}
        savedBookSummaries={savedBookSummaries}
        activeProjectId={activeProjectId}
        activeBookName={activeBookName}
        exportProgressLabel={localExportProgressLabel ?? exportProgressLabel}
        exporting={actions.exportingKind === 'pdf' || exportingOuterPdf}
        onConfirmExport={handleConfirmPdfExport}
        onClose={() => setPdfDialogTarget(null)}
      />
    </div>
  );
}
