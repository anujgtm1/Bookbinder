import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { resolveBindingStrategy } from '@/core/bindingStyles';
import { evaluatePrintMediaFit } from '@/core/geometry';
import {
  exportDesignPresetsJson,
  importDesignPresetsJson,
  loadSavedDesignPresets,
  saveDesignPresets,
} from '@/core/presetStorage';
import {
  triggerBlobDownload,
  triggerBytesDownload,
  triggerTextDownload,
} from '@/core/storage';
import { rgbToHex } from '@/lib/color';
import {
  getPrintMediaSpec,
  type BookParameters,
  type PageSizeId,
  type PrintMediaId,
  type SplitMode,
} from '@/types/bookParams';
import {
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
  type ClassicOrnamentId,
  type CoverElementZone,
  type CoverOrnamentLayer,
  type CoverTextLayer,
  type CoverTextPresetKind,
} from '@/types/coverElements';
import { CoverDesignPresetModel, type CoverDesignPreset } from '@/types/designPreset';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import type { CoverStudioState, SpineTypographyConfig } from '@/types/studio';
import {
  CoverImageLayerModel,
  getLayerVisualRect,
  type CoverImageLayer,
  type LayerClipZone,
  type QuickFitTarget,
  type StubExtensionMode,
} from '@/types/studioLayer';
import { PRINT_DPI, roundTo } from '@/types/units';
import type { EyedropperTarget } from '../ArtworkControlsCard';
import { getClassicOrnamentSpec } from '../classicOrnaments';
import {
  applyStubExtensionToLayer,
  detectLayerCoverSide,
  type StubExtensionSide,
} from '../edgeExtend';
import { loadCustomFontFromFile, type CustomFontAsset } from '../fonts';
import type { PreflightQuickFix } from '../preflight';
import {
  exportCoverPng300Dpi,
  generateAffinityCoverSvg,
  generatePrintReadyRollPdf,
  renderCoverArtworkCanvas,
  resolveQuickFitRect,
  type CoverPdfLayerMode,
  type StudioCanvasSpec,
} from '../renderEngine';
import { parseSvgStampText } from '../svgStampParser';
import { isSupportedImageFile, readImageFile } from '../useInteractiveLayers';

export interface UseCoverStudioActionsOptions {
  readonly effectiveParams: BookParameters;
  readonly geometry: CaseGeometry;
  readonly spec: StudioCanvasSpec;
  readonly studio: CoverStudioState;
  readonly studioRef: RefObject<CoverStudioState>;
  readonly onChange: (next: CoverStudioState) => void;
  readonly onChangeRef: RefObject<(next: CoverStudioState) => void>;
  readonly onUpdateParams?: (patch: Partial<BookParameters>) => void;
  readonly onStatusMessage: (message: string) => void;
  readonly customFont: CustomFontAsset | null;
  readonly setCustomFont: Dispatch<SetStateAction<CustomFontAsset | null>>;
  readonly selectedTextId: string | null;
  readonly setSelectedTextId: Dispatch<SetStateAction<string | null>>;
  readonly selectedOrnamentId: string | null;
  readonly setSelectedOrnamentId: Dispatch<SetStateAction<string | null>>;
  readonly setSelectedLayerId: Dispatch<SetStateAction<string | null>>;
  readonly setEyedropperTarget: Dispatch<SetStateAction<EyedropperTarget>>;
  readonly onSwitchTo2D: () => void;
  readonly onSelectImageLayer: (id: string | null) => void;
  readonly onSelectText: (id: string | null) => void;
  readonly onSelectOrnament: (id: string | null) => void;
  readonly onClearSelection: () => void;
  readonly toSvgMm: (
    clientX: number,
    clientY: number,
  ) => { readonly xMm: number; readonly yMm: number } | null;
}

export function useCoverStudioActions({
  effectiveParams,
  geometry,
  spec,
  studio,
  studioRef,
  onChange,
  onChangeRef,
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
  onSwitchTo2D,
  onSelectImageLayer,
  onSelectText,
  onSelectOrnament,
  onClearSelection,
  toSvgMm,
}: UseCoverStudioActionsOptions) {
  const [extendingStub, setExtendingStub] = useState(false);
  const [sampledEdgeHex, setSampledEdgeHex] = useState<string | null>(null);
  const [exportingKind, setExportingKind] = useState<'pdf' | 'png' | 'svg' | null>(null);
  const [savedPresets, setSavedPresets] = useState<readonly CoverDesignPreset[]>(() =>
    loadSavedDesignPresets(),
  );

  const updateStudio = (patch: Partial<CoverStudioState>) => onChange({ ...studio, ...patch });
  const updateSpineText = (patch: Partial<SpineTypographyConfig>) =>
    onChange({ ...studio, spineText: { ...studio.spineText, ...patch } });
  const updateLayer = (id: string, updater: (layer: CoverImageLayer) => CoverImageLayer) => {
    onChange({
      ...studio,
      layers: studio.layers.map((layer) => (layer.id === id ? updater(layer) : layer)),
    });
  };

  const getBoardRectInCanvas = (zone: CoverElementZone): Rect2D => {
    const base =
      zone === 'back'
        ? geometry.outerWrap.backBoardRect
        : zone === 'spine'
          ? geometry.outerWrap.spineRect
          : geometry.outerWrap.frontBoardRect;
    return {
      x: base.x + spec.bleedMm,
      y: base.y + spec.bleedMm,
      width: base.width,
      height: base.height,
    };
  };

  const getArtworkRectForZone = (zone: CoverElementZone): Rect2D => {
    switch (zone) {
      case 'back':
        return spec.backArtworkRect;
      case 'spine':
        return spec.spineArtworkRect;
      case 'front':
      default:
        return spec.frontArtworkRect;
    }
  };

  const handleAddTextPreset = (preset: CoverTextPresetKind) => {
    const zone: CoverElementZone = preset === 'back-blurb' ? 'back' : 'front';
    const created = CoverTextLayerModel.createPreset(preset, getBoardRectInCanvas(zone), {
      fontId: studio.spineText.fontId,
      color: studio.spineText.textColor,
    });
    onChange({ ...studio, textLayers: [...(studio.textLayers ?? []), created] });
    onSelectText(created.id);
    onSwitchTo2D();
    onStatusMessage(`Added "${created.text.split('\n')[0]}" on ${zone} cover — drag to position`);
  };

  const handleUpdateTextLayer = (id: string, patch: Partial<CoverTextLayer>) => {
    onChange({
      ...studio,
      textLayers: (studio.textLayers ?? []).map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if (patch.zone && patch.zone !== t.zone) {
          const rect = getBoardRectInCanvas(patch.zone);
          return {
            ...next,
            xMm: roundTo(rect.x + rect.width / 2, 2),
            yMm: roundTo(rect.y + rect.height / 2, 2),
          };
        }
        return next;
      }),
    });
  };

  const handleQuickAlignText = (id: string, verticalSlot: 'upper' | 'center' | 'lower') => {
    const ratio = verticalSlot === 'upper' ? 0.3 : verticalSlot === 'lower' ? 0.76 : 0.5;
    onChange({
      ...studio,
      textLayers: (studio.textLayers ?? []).map((t) => {
        if (t.id !== id) return t;
        const rect = getBoardRectInCanvas(t.zone);
        return {
          ...t,
          align: 'center',
          xMm: roundTo(rect.x + rect.width / 2, 2),
          yMm: roundTo(rect.y + rect.height * ratio, 2),
        };
      }),
    });
  };

  const handleDeleteTextLayer = (id: string) => {
    const remaining = (studio.textLayers ?? []).filter((t) => t.id !== id);
    onChange({ ...studio, textLayers: remaining });
    if (selectedTextId === id) {
      setSelectedTextId(remaining[remaining.length - 1]?.id ?? null);
    }
  };

  const handleAddOrnament = (
    presetId: ClassicOrnamentId,
    zone: CoverElementZone,
    color: string,
  ) => {
    const created = CoverOrnamentLayerModel.createForZone(
      presetId,
      getBoardRectInCanvas(zone),
      zone,
      color,
    );
    onChange({ ...studio, ornaments: [...(studio.ornaments ?? []), created] });
    onSelectOrnament(created.id);
    onSwitchTo2D();
    onStatusMessage(`Added ${getClassicOrnamentSpec(presetId).label} on ${zone} cover`);
  };

  const handleUpdateOrnament = (id: string, patch: Partial<CoverOrnamentLayer>) => {
    onChange({
      ...studio,
      ornaments: (studio.ornaments ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  };

  const handleScaleOrnament = (id: string, factor: number) => {
    onChange({
      ...studio,
      ornaments: (studio.ornaments ?? []).map((o) =>
        o.id === id ? CoverOrnamentLayerModel.scaleAroundCenter(o, factor) : o,
      ),
    });
  };

  const handleImportSvgStamp = async (file: File, zone: CoverElementZone, color: string) => {
    try {
      const svgText = await file.text();
      const parsed = parseSvgStampText(svgText);
      if (!parsed) {
        onStatusMessage('Could not find vector shapes/paths in that SVG file.');
        return;
      }
      const created = CoverOrnamentLayerModel.createCustomSvg({
        name: file.name.replace(/\.svg$/i, '') || 'Custom SVG',
        paths: parsed.paths,
        viewBoxWidth: parsed.viewBoxWidth,
        viewBoxHeight: parsed.viewBoxHeight,
        renderMode: parsed.suggestedMode,
        targetBoardRectMm: getBoardRectInCanvas(zone),
        zone,
        color,
      });
      onChange({ ...studio, ornaments: [...(studio.ornaments ?? []), created] });
      onSelectOrnament(created.id);
      onSwitchTo2D();
      onStatusMessage(
        `Imported vector SVG stamp "${created.customSvgName}" (${parsed.paths.length} paths) on ${zone}`,
      );
    } catch {
      onStatusMessage('Failed to read SVG stamp file.');
    }
  };

  const handleFitOrnamentToBoard = (id: string) => {
    onChange({
      ...studio,
      ornaments: (studio.ornaments ?? []).map((o) => {
        if (o.id !== id) return o;
        const fitted =
          o.presetId === 'custom-svg' && o.customSvgPaths && o.customSvgViewBox
            ? CoverOrnamentLayerModel.createCustomSvg({
                name: o.customSvgName ?? 'Custom SVG',
                paths: o.customSvgPaths,
                viewBoxWidth: o.customSvgViewBox.width,
                viewBoxHeight: o.customSvgViewBox.height,
                renderMode: o.customSvgRenderMode ?? 'fill',
                targetBoardRectMm: getBoardRectInCanvas(o.zone),
                zone: o.zone,
                color: o.color,
              })
            : CoverOrnamentLayerModel.createForZone(
                o.presetId,
                getBoardRectInCanvas(o.zone),
                o.zone,
                o.color,
              );
        return {
          ...fitted,
          id: o.id,
          strokeWidthMm: o.strokeWidthMm,
          flipX: o.flipX,
          flipY: o.flipY,
          rotationDeg: o.rotationDeg,
        };
      }),
    });
  };

  const handleFitOrnamentWithMargin = (id: string, marginMm: number) => {
    onChange({
      ...studio,
      ornaments: (studio.ornaments ?? []).map((o) =>
        o.id === id
          ? CoverOrnamentLayerModel.fitInsideBoardWithMargin(o, getBoardRectInCanvas(o.zone), marginMm)
          : o,
      ),
    });
  };

  const handleCenterOrnament = (id: string) => {
    onChange({
      ...studio,
      ornaments: (studio.ornaments ?? []).map((o) =>
        o.id === id ? CoverOrnamentLayerModel.centerInBoard(o, getBoardRectInCanvas(o.zone)) : o,
      ),
    });
  };

  const handleQuickAlignOrnament = (id: string, verticalSlot: 'upper' | 'center' | 'lower') => {
    const ratio = verticalSlot === 'upper' ? 0.24 : verticalSlot === 'lower' ? 0.78 : 0.5;
    onChange({
      ...studio,
      ornaments: (studio.ornaments ?? []).map((o) => {
        if (o.id !== id) return o;
        const zone = getArtworkRectForZone(o.zone);
        const rawY = zone.y + zone.height * ratio - o.heightMm / 2;
        const clampedY =
          o.heightMm >= zone.height
            ? zone.y + (zone.height - o.heightMm) / 2
            : Math.min(zone.y + zone.height - o.heightMm, Math.max(zone.y, rawY));
        return {
          ...o,
          xMm: roundTo(zone.x + (zone.width - o.widthMm) / 2, 2),
          yMm: roundTo(clampedY, 2),
        };
      }),
    });
  };

  const handleQuickAlignImage = (id: string, verticalSlot: 'upper' | 'center' | 'lower') => {
    const ratio = verticalSlot === 'upper' ? 0.24 : verticalSlot === 'lower' ? 0.78 : 0.5;
    updateLayer(id, (layer) => {
      const targetZone: CoverElementZone =
        layer.clipZone === 'back' || layer.clipZone === 'spine' || layer.clipZone === 'front'
          ? layer.clipZone
          : 'front';
      const zone = getArtworkRectForZone(targetZone);
      const vis = getLayerVisualRect(layer);
      const targetCx = zone.x + zone.width / 2;
      const rawVisY = zone.y + zone.height * ratio - vis.height / 2;
      const clampedVisY =
        vis.height >= zone.height
          ? zone.y + (zone.height - vis.height) / 2
          : Math.min(zone.y + zone.height - vis.height, Math.max(zone.y, rawVisY));
      const targetCy = clampedVisY + vis.height / 2;
      return {
        ...layer,
        xMm: roundTo(targetCx - layer.widthMm / 2, 2),
        yMm: roundTo(targetCy - layer.heightMm / 2, 2),
      };
    });
  };

  const handleDeleteOrnament = (id: string) => {
    const remaining = (studio.ornaments ?? []).filter((o) => o.id !== id);
    onChange({ ...studio, ornaments: remaining });
    if (selectedOrnamentId === id) {
      setSelectedOrnamentId(remaining[remaining.length - 1]?.id ?? null);
    }
  };

  const handleSaveDesignPreset = (name: string) => {
    const created = CoverDesignPresetModel.captureFromStudio(name, geometry, studio);
    setSavedPresets((prev) => {
      const next = [created, ...prev];
      saveDesignPresets(next);
      return next;
    });
    onStatusMessage(`Saved series design preset "${created.name}"`);
  };

  const handleApplyDesignPreset = (preset: CoverDesignPreset) => {
    const nextStudio = CoverDesignPresetModel.applyToStudio(preset, geometry, studio);
    onChange(nextStudio);
    onClearSelection();
    onStatusMessage(`Applied "${preset.name}" — adapted to current book size`);
  };

  const handleDeleteDesignPreset = (id: string) => {
    const target = savedPresets.find((p) => p.id === id);
    setSavedPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveDesignPresets(next);
      return next;
    });
    if (target) {
      onStatusMessage(`Deleted series preset "${target.name}"`);
    }
  };

  const handleExportDesignPresets = () => {
    if (savedPresets.length === 0) {
      onStatusMessage('No saved design presets to export yet.');
      return;
    }
    triggerTextDownload(
      exportDesignPresetsJson(savedPresets),
      'bookbinder-series-presets.json',
      'application/json',
    );
    onStatusMessage(`Exported ${savedPresets.length} series design preset(s) to JSON`);
  };

  const handleImportDesignPresets = async (file: File) => {
    try {
      const text = await file.text();
      const result = importDesignPresetsJson(text);
      if (!result.ok) {
        onStatusMessage(result.error);
        return;
      }
      setSavedPresets((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const deduped = result.presets.map((p) =>
          existingIds.has(p.id)
            ? { ...p, id: `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }
            : p,
        );
        const next = [...deduped, ...prev];
        saveDesignPresets(next);
        return next;
      });
      onStatusMessage(`Imported ${result.presets.length} series design preset(s)`);
    } catch {
      onStatusMessage('Failed to read series presets JSON file.');
    }
  };

  const handleExtendLayerStub = async (
    layerId: string,
    mode: StubExtensionMode,
    explicitSide?: StubExtensionSide,
  ) => {
    const targetLayer = studioRef.current.layers.find((l) => l.id === layerId);
    if (!targetLayer) return;
    const side = explicitSide ?? detectLayerCoverSide(targetLayer, geometry);
    setExtendingStub(true);
    try {
      const { layer: updated, sampledSpineEdgeHex } = await applyStubExtensionToLayer(
        targetLayer,
        geometry,
        side,
        mode,
      );
      const latest = studioRef.current;
      onChangeRef.current({
        ...latest,
        layers: latest.layers.map((l) => (l.id === layerId ? updated : l)),
      });
      setSelectedLayerId(layerId);
      setSampledEdgeHex(sampledSpineEdgeHex);
      onStatusMessage(
        mode === 'none'
          ? `Restored original "${targetLayer.fileName}" onto ${side} board`
          : `Extended "${targetLayer.fileName}" across ${side} pasting stub (${mode})`,
      );
    } catch {
      onStatusMessage('Could not extend cover edges onto the pasting stub.');
    } finally {
      setExtendingStub(false);
    }
  };

  const handleQuickFitLayer = (id: string, target: QuickFitTarget) => {
    const targetLayer = studioRef.current.layers.find((l) => l.id === id);
    if (!targetLayer) return;

    const nextClipZone: LayerClipZone = target === 'fullWrap' ? 'none' : target;
    const activeStubMode = targetLayer.stubExtensionMode;

    // If pasting-stub extension is active on this layer, re-synthesize cleanly for the current book size
    if (activeStubMode && activeStubMode !== 'none') {
      if (target === 'front' || target === 'back') {
        void handleExtendLayerStub(id, activeStubMode, target);
        return;
      }
      // Fitting an extended layer to spine or fullWrap reverts cleanly to the unextended source image
      const sourceLayer: CoverImageLayer = {
        ...targetLayer,
        dataUrl: targetLayer.originalDataUrl ?? targetLayer.dataUrl,
        naturalWidth: targetLayer.originalWidth ?? targetLayer.naturalWidth,
        naturalHeight: targetLayer.originalHeight ?? targetLayer.naturalHeight,
        originalDataUrl: undefined,
        originalWidth: undefined,
        originalHeight: undefined,
        stubExtensionMode: 'none',
        stubExtensionSide: undefined,
      };
      const targetRect = resolveQuickFitRect(spec, target);
      updateLayer(id, () => CoverImageLayerModel.fitToRect(sourceLayer, targetRect, nextClipZone));
      return;
    }

    const targetRect = resolveQuickFitRect(spec, target);
    updateLayer(id, (layer) => CoverImageLayerModel.fitToRect(layer, targetRect, nextClipZone));
  };

  const handleApplyQuickFix = (fix: PreflightQuickFix) => {
    switch (fix.kind) {
      case 'fit-layer':
        handleQuickFitLayer(fix.layerId, fix.target);
        setSelectedLayerId(fix.layerId);
        onStatusMessage(`Applied Quick Fit (${fix.label})`);
        break;
      case 'extend-stub':
        void handleExtendLayerStub(fix.layerId, 'edge-smear', fix.side);
        break;
      case 'enable-bleed':
        onUpdateParams?.({ includeBleed: true, bleedMm: fix.bleedMm });
        onStatusMessage(`Enabled ${fix.bleedMm} mm outer artwork bleed`);
        break;
      case 'author-vertical':
        updateSpineText({ authorOrientation: 'vertical' });
        onStatusMessage('Switched spine author writing to Vertical');
        break;
      case 'high-contrast-spine-text':
        updateSpineText({ textColor: fix.hexColor });
        onStatusMessage(`Updated spine ink to ${fix.hexColor.toUpperCase()} for high contrast`);
        break;
      case 'enable-split-mode':
        onUpdateParams?.({ splitMode: 'three-piece' });
        onStatusMessage('Enabled 3-Piece Quarter-Bound Split');
        break;
      case 'select-layer':
        onSwitchTo2D();
        onSelectImageLayer(fix.layerId);
        break;
      case 'switch-binding-style': {
        const nextStrategy = resolveBindingStrategy(fix.bindingStyle);
        onUpdateParams?.({ bindingStyle: fix.bindingStyle });
        onStatusMessage(`Switched to ${nextStrategy.shortLabel}`);
        break;
      }
      case 'apply-pocket-proportions':
        onUpdateParams?.({
          boardThicknessMm: 1.5,
          spineAllowanceMm: 1.5,
          turnInMm: 14,
          overhangForeEdgeMm: 1.5,
          overhangTopBottomMm: 3,
        });
        onStatusMessage('Applied compact pocket proportions (1.5 mm board, 14 mm turn-ins)');
        break;
      case 'set-print-media': {
        const mediaSpec = getPrintMediaSpec(fix.printMedia);
        onUpdateParams?.({ printMedia: fix.printMedia });
        onStatusMessage(`Switched Target Print Media to ${mediaSpec.shortLabel}`);
        break;
      }
      case 'set-jacket-flap-width': {
        const activeStrategy = resolveBindingStrategy(geometry);
        const flapLabel = activeStrategy.flapConfig?.label.toLowerCase() ?? 'flap width';
        onUpdateParams?.({ jacketFlapWidthMm: fix.flapWidthMm });
        onStatusMessage(`Updated ${flapLabel} to ${fix.flapWidthMm} mm`);
        break;
      }
      case 'set-softcover-pocket-mode': {
        onUpdateParams?.({ softcoverPocketMode: fix.pocketMode });
        onStatusMessage(
          fix.pocketMode === 'separate'
            ? 'Detached side flaps to Separate Inner Pockets (2-Sheet mode)'
            : 'Switched slip cover back to 1-Piece Integrated Flaps',
        );
        break;
      }
    }
  };

  const defaultPlacementRectForDrop = (dropPoint?: { xMm: number; yMm: number }): Rect2D => {
    if (dropPoint) {
      if (dropPoint.xMm < spec.spineZoneRect.x) return spec.backArtworkRect;
      if (dropPoint.xMm < spec.frontZoneRect.x) return spec.spineArtworkRect;
      return spec.frontArtworkRect;
    }
    const count = studio.layers.length;
    if (count === 0) return spec.frontArtworkRect;
    if (count === 1) return spec.backArtworkRect;
    if (count === 2) return spec.spineArtworkRect;
    return {
      x: spec.totalWidthMm * 0.25,
      y: spec.totalHeightMm * 0.2,
      width: spec.totalWidthMm * 0.5,
      height: spec.totalHeightMm * 0.6,
    };
  };

  const handleAddImageFiles = async (
    files: readonly File[],
    dropPoint?: { xMm: number; yMm: number },
  ) => {
    const validFiles = files.filter(isSupportedImageFile);
    if (validFiles.length === 0) {
      onStatusMessage('Please upload PNG, JPG, or WEBP image files.');
      return;
    }

    const addedLayers: CoverImageLayer[] = [];
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const decoded = await readImageFile(file);
        const baseRect = defaultPlacementRectForDrop(dropPoint);
        const offset = i * 8;
        addedLayers.push(
          CoverImageLayerModel.createInRect({
            dataUrl: decoded.dataUrl,
            fileName: file.name,
            naturalWidth: decoded.width,
            naturalHeight: decoded.height,
            targetRect: {
              x: baseRect.x + offset,
              y: baseRect.y + offset,
              width: baseRect.width,
              height: baseRect.height,
            },
            clipZone: 'none',
            mode: 'contain',
          }),
        );
      } catch {
        onStatusMessage(`Could not read image "${file.name}".`);
      }
    }

    if (addedLayers.length > 0) {
      onChange({ ...studio, layers: [...studio.layers, ...addedLayers] });
      onSelectImageLayer(addedLayers[addedLayers.length - 1].id);
      onStatusMessage(
        addedLayers.length === 1
          ? `Added "${addedLayers[0].fileName}" — drag to move or pull corners to resize`
          : `Added ${addedLayers.length} artwork images to canvas`,
      );
    }
  };

  const handleCustomFontUpload = async (file: File, targetTextLayerId?: string) => {
    try {
      const asset = await loadCustomFontFromFile(file);
      setCustomFont(asset);
      const latest = studioRef.current;
      if (targetTextLayerId) {
        onChangeRef.current({
          ...latest,
          spineText: { ...latest.spineText, customFontName: asset.fileName },
          textLayers: (latest.textLayers ?? []).map((t) =>
            t.id === targetTextLayerId ? { ...t, fontId: 'custom' } : t,
          ),
        });
      } else {
        onChangeRef.current({
          ...latest,
          spineText: { ...latest.spineText, fontId: 'custom', customFontName: asset.fileName },
        });
      }
      onStatusMessage(
        asset.pdfEmbeddable
          ? `Loaded custom font "${asset.fileName}"`
          : `Loaded "${asset.fileName}" for preview/PNG (PDF export uses serif fallback for .woff2)`,
      );
    } catch (err) {
      onStatusMessage(err instanceof Error ? err.message : 'Failed to load custom font.');
    }
  };

  const sampleColorAtSvgClick = async (
    clientX: number,
    clientY: number,
    target: Exclude<EyedropperTarget, null>,
  ) => {
    const pt = toSvgMm(clientX, clientY);
    if (!pt) return;
    const relX = pt.xMm / spec.totalWidthMm;
    const relY = pt.yMm / spec.totalHeightMm;

    try {
      const sampleCanvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
        includeSpineText: false,
        dpi: 72,
      });
      const px = Math.min(sampleCanvas.width - 1, Math.max(0, Math.floor(relX * sampleCanvas.width)));
      const py = Math.min(
        sampleCanvas.height - 1,
        Math.max(0, Math.floor(relY * sampleCanvas.height)),
      );
      const ctx = sampleCanvas.getContext('2d');
      if (!ctx) return;
      const pixel = ctx.getImageData(px, py, 1, 1).data;
      const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
      const latest = studioRef.current;
      onChangeRef.current(
        target === 'spine'
          ? { ...latest, spineBgColor: hex }
          : target === 'back'
            ? { ...latest, backBgColor: hex }
            : { ...latest, spineBgColor: hex, backBgColor: hex, frontBgColor: hex },
      );
      setEyedropperTarget(null);
      onStatusMessage(`Sampled ${hex.toUpperCase()} from cover`);
    } catch {
      setEyedropperTarget(null);
      onStatusMessage('Could not sample color from cover image.');
    }
  };

  const handleExportPrintPdf = async (options?: {
    readonly includeGuides?: boolean;
    readonly printMediaId?: PrintMediaId;
    readonly dpi?: 300 | 600;
    readonly tileOverlapMm?: number;
    readonly includeScaleBar?: boolean;
    readonly splitMode?: SplitMode;
    readonly exportLayerMode?: CoverPdfLayerMode;
    readonly appendInnerPocketsPage?: boolean;
    readonly innerPageSizeId?: PageSizeId;
  }) => {
    setExportingKind('pdf');
    try {
      const effectiveMediaId = options?.printMediaId ?? effectiveParams.printMedia;
      const effectiveDpi = options?.dpi ?? 300;
      const effectiveLayerMode: CoverPdfLayerMode = options?.exportLayerMode ?? 'full';
      const isBaseOnly = effectiveLayerMode === 'base-only';
      const fileName = isBaseOnly ? 'outer_cover_base_for_htv.pdf' : 'outer_cover_print.pdf';
      if (options?.includeGuides !== undefined) {
        const nextCutLineMode = options.includeGuides ? 'full-cut-miter' : 'bleed-registration';
        if (nextCutLineMode !== studio.cutLineMode) {
          updateStudio({ cutLineMode: nextCutLineMode });
        }
      }
      const bytes = await generatePrintReadyRollPdf(geometry, studio, customFont, {
        includeGuides: options?.includeGuides,
        exportLayerMode: effectiveLayerMode,
        printMediaId: effectiveMediaId,
        dpi: effectiveDpi,
        tileOverlapMm: options?.tileOverlapMm,
        includeScaleBar: options?.includeScaleBar,
        appendInnerPocketsPage: options?.appendInnerPocketsPage,
        innerPageSizeId: options?.innerPageSizeId,
      });
      triggerBytesDownload(bytes, fileName, 'application/pdf');
      const fit = evaluatePrintMediaFit(
        effectiveMediaId,
        geometry.outerWrap.widthMm,
        geometry.outerWrap.heightMm,
        options?.tileOverlapMm,
      );
      const layerTag = isBaseOnly ? ', Base Only for HTV' : '';
      const pocketsTag = options?.appendInnerPocketsPage ? ' + Pockets' : '';
      onStatusMessage(
        fit.status === 'fits-1-sheet'
          ? `Exported ${fileName} (centered on 1× ${fit.mediaLabel}${pocketsTag}, ${effectiveDpi} DPI${layerTag})`
          : fit.status === 'fits-2-sheet-tile'
            ? `Exported ${fileName} (2 tiled ${fit.mediaLabel} pages with ${fit.tileOverlapMm} mm overlap${pocketsTag}, ${effectiveDpi} DPI${layerTag})`
            : isBaseOnly
              ? `Exported ${fileName} (${effectiveDpi} DPI, Base Only for HTV${pocketsTag})`
              : `Exported ${fileName} (${effectiveDpi} DPI + vector spine text${pocketsTag})`,
      );
    } catch {
      onStatusMessage('Failed to generate Print-Ready Roll PDF.');
    } finally {
      setExportingKind(null);
    }
  };

  const handleExportAffinityPng = async () => {
    setExportingKind('png');
    try {
      const blob = await exportCoverPng300Dpi(geometry, studio, customFont);
      triggerBlobDownload(blob, 'outer_cover_300dpi.png');
      onStatusMessage(
        `Exported outer_cover_300dpi.png (${spec.pixelWidth}×${spec.pixelHeight}px @ 300 DPI)`,
      );
    } catch {
      onStatusMessage('Failed to export 300 DPI PNG.');
    } finally {
      setExportingKind(null);
    }
  };

  const handleExportAffinitySvg = async () => {
    setExportingKind('svg');
    try {
      let artworkDataUrl: string | undefined;
      if (studio.layers.length > 0) {
        const canvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
          includeSpineText: false,
          dpi: PRINT_DPI,
        });
        artworkDataUrl = canvas.toDataURL('image/png');
      }
      const svg = generateAffinityCoverSvg(geometry, studio, customFont, artworkDataUrl);
      triggerTextDownload(svg, 'outer_cover_300dpi.svg', 'image/svg+xml;charset=utf-8');
      onStatusMessage('Exported outer_cover_300dpi.svg (Affinity round-trip)');
    } catch {
      onStatusMessage('Failed to export Affinity SVG.');
    } finally {
      setExportingKind(null);
    }
  };

  return {
    extendingStub,
    sampledEdgeHex,
    exportingKind,
    savedPresets,
    updateStudio,
    updateSpineText,
    updateLayer,
    handleAddTextPreset,
    handleUpdateTextLayer,
    handleQuickAlignText,
    handleDeleteTextLayer,
    handleAddOrnament,
    handleUpdateOrnament,
    handleScaleOrnament,
    handleImportSvgStamp,
    handleFitOrnamentToBoard,
    handleFitOrnamentWithMargin,
    handleCenterOrnament,
    handleQuickAlignOrnament,
    handleQuickAlignImage,
    handleDeleteOrnament,
    handleSaveDesignPreset,
    handleApplyDesignPreset,
    handleDeleteDesignPreset,
    handleExportDesignPresets,
    handleImportDesignPresets,
    handleExtendLayerStub,
    handleQuickFitLayer,
    handleApplyQuickFix,
    handleAddImageFiles,
    handleCustomFontUpload,
    sampleColorAtSvgClick,
    handleExportPrintPdf,
    handleExportAffinityPng,
    handleExportAffinitySvg,
  };
}
