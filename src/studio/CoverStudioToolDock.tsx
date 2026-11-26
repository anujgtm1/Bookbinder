import {
  Bookmark,
  BookOpen,
  ImagePlus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Type,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  ClassicOrnamentId,
  CoverElementZone,
  CoverOrnamentLayer,
  CoverTextLayer,
  CoverTextPresetKind,
} from '@/types/coverElements';
import { BUILT_IN_DESIGN_PRESETS, type CoverDesignPreset } from '@/types/designPreset';
import type { CoverStudioState, SpineTypographyConfig } from '@/types/studio';
import type {
  CoverImageLayer,
  LayerClipZone,
  QuickFitTarget,
  StubExtensionMode,
} from '@/types/studioLayer';
import {
  ArtworkControlsCard,
  type ApplyProceduralArtworkRequest,
  type EyedropperTarget,
} from './ArtworkControlsCard';
import { ClassicDesignsCard } from './ClassicDesignsCard';
import { CoverTextCard } from './CoverTextCard';
import type { DesignMuseCardProps } from './DesignMuseCard';
import { DesignPresetsCard } from './DesignPresetsCard';
import { PreflightCard } from './PreflightCard';
import { SpineTypographyCard } from './SpineTypographyCard';
import type { CustomFontAsset } from './fonts';
import type { PreflightQuickFix, PreflightReport } from './preflight';

export type StudioToolTab = 'artwork' | 'text' | 'designs' | 'spine' | 'presets' | 'preflight';

export interface CoverStudioToolDockProps {
  readonly activeTab: StudioToolTab;
  readonly onTabChange: (tab: StudioToolTab) => void;
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly selectedLayerId: string | null;
  readonly selectedTextId: string | null;
  readonly selectedOrnamentId: string | null;
  readonly eyedropperTarget: EyedropperTarget;
  readonly extendingStub: boolean;
  readonly sampledEdgeHex: string | null;
  readonly maxFontSizePt: number;
  readonly effectiveFontSizePt: number;
  readonly savedPresets: readonly CoverDesignPreset[];
  readonly preflight: PreflightReport;
  readonly showPreflightOverlays: boolean;
  readonly checkDpi: boolean;
  readonly activeIssueId: string | null;
  // Artwork actions
  readonly onSelectImageLayer: (id: string | null) => void;
  readonly onAddImageFiles: (files: readonly File[]) => void;
  readonly onApplyProceduralArtwork?: (request: ApplyProceduralArtworkRequest) => void;
  readonly onQuickFitLayer: (id: string, target: QuickFitTarget) => void;
  readonly onExtendLayerStub: (id: string, mode: StubExtensionMode) => void;
  readonly onMatchSpineBackToEdge: (hex: string) => void;
  readonly onSetLayerClip: (id: string, clipZone: LayerClipZone) => void;
  readonly onScaleLayer: (id: string, factor: number) => void;
  readonly onToggleLayerFlip: (id: string, axis: 'x' | 'y') => void;
  readonly onUpdateLayer: (id: string, patch: Partial<CoverImageLayer>) => void;
  readonly onReorderLayer: (id: string, direction: 'forward' | 'backward') => void;
  readonly onDetachSeriesLayer?: (kind: 'image' | 'text' | 'ornament', id: string) => void;
  readonly onDeleteLayer: (id: string) => void;
  readonly onUpdateStudio: (patch: Partial<CoverStudioState>) => void;
  readonly onToggleEyedropper: (target: Exclude<EyedropperTarget, null>) => void;
  // Cover Text actions
  readonly onSelectText: (id: string | null) => void;
  readonly onAddTextPreset: (preset: CoverTextPresetKind) => void;
  readonly onUpdateTextLayer: (id: string, patch: Partial<CoverTextLayer>) => void;
  readonly onQuickAlignText: (id: string, verticalSlot: 'upper' | 'center' | 'lower') => void;
  readonly onDeleteTextLayer: (id: string) => void;
  readonly onCustomFontSelected: (file: File, targetTextLayerId?: string) => void;
  // Classic Designs actions
  readonly onSelectOrnament: (id: string | null) => void;
  readonly onAddOrnament: (
    presetId: ClassicOrnamentId,
    zone: CoverElementZone,
    color: string,
  ) => void;
  readonly onImportSvgStamp: (file: File, zone: CoverElementZone, color: string) => void;
  readonly onUpdateOrnament: (id: string, patch: Partial<CoverOrnamentLayer>) => void;
  readonly onScaleOrnament: (id: string, factor: number) => void;
  readonly onFitOrnamentToBoard: (id: string) => void;
  readonly onFitOrnamentWithMargin: (id: string, marginMm: number) => void;
  readonly onCenterOrnament: (id: string) => void;
  readonly onQuickAlignOrnament?: (
    id: string,
    verticalSlot: 'upper' | 'center' | 'lower',
  ) => void;
  readonly onDeleteOrnament: (id: string) => void;
  // Spine actions
  readonly onUpdateSpineText: (patch: Partial<SpineTypographyConfig>) => void;
  // Presets & Design Muse actions
  readonly designMuse?: DesignMuseCardProps;
  readonly onSavePreset: (name: string) => void;
  readonly onApplyPreset: (preset: CoverDesignPreset) => void;
  readonly onDeletePreset: (id: string) => void;
  readonly onExportPresets: () => void;
  readonly onImportPresets: (file: File) => void;
  // Preflight actions
  readonly onTogglePreflightOverlays: (show: boolean) => void;
  readonly onToggleCheckDpi: (check: boolean) => void;
  readonly onHighlightIssue: (issueId: string | null) => void;
  readonly onApplyQuickFix: (fix: PreflightQuickFix) => void;
  readonly onIgnoreIssue: (issueId: string) => void;
  readonly onRestoreIgnored: () => void;
}

export function CoverStudioToolDock({
  activeTab,
  onTabChange,
  studio,
  customFont,
  selectedLayerId,
  selectedTextId,
  selectedOrnamentId,
  eyedropperTarget,
  extendingStub,
  sampledEdgeHex,
  maxFontSizePt,
  effectiveFontSizePt,
  savedPresets,
  preflight,
  showPreflightOverlays,
  checkDpi,
  activeIssueId,
  onSelectImageLayer,
  onAddImageFiles,
  onApplyProceduralArtwork,
  onQuickFitLayer,
  onExtendLayerStub,
  onMatchSpineBackToEdge,
  onSetLayerClip,
  onScaleLayer,
  onToggleLayerFlip,
  onUpdateLayer,
  onReorderLayer,
  onDetachSeriesLayer,
  onDeleteLayer,
  onUpdateStudio,
  onToggleEyedropper,
  onSelectText,
  onAddTextPreset,
  onUpdateTextLayer,
  onQuickAlignText,
  onDeleteTextLayer,
  onCustomFontSelected,
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
  onUpdateSpineText,
  designMuse,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onExportPresets,
  onImportPresets,
  onTogglePreflightOverlays,
  onToggleCheckDpi,
  onHighlightIssue,
  onApplyQuickFix,
  onIgnoreIssue,
  onRestoreIgnored,
}: CoverStudioToolDockProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as StudioToolTab)}
      data-testid="studio-tool-dock"
      className="washi-sheet flex flex-col overflow-hidden rounded-md border border-border border-t-2 border-t-vermilion xl:sticky xl:top-[64px] xl:max-h-[calc(100vh-80px)]"
    >
      {/* Docked Washi Inspector Header & 6-Tool Grid Tab Bar */}
      <div className="shrink-0 border-b border-border/90 bg-secondary/35 p-2">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="font-serif text-sm font-semibold tracking-tight text-foreground">
            Design Inspector
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
            FOLIO TOOLS
          </span>
        </div>
        <TabsList
          aria-label="Cover studio tools"
          className="grid h-auto w-full grid-cols-3 gap-1 rounded-none bg-transparent p-0 sm:grid-cols-6 xl:grid-cols-3"
        >
          <TabsTrigger
            value="artwork"
            data-testid="studio-tool-artwork"
            className="h-auto justify-center gap-1 rounded-[2px] border border-border/70 bg-card/70 px-2 py-1.5 text-[11px] data-[state=active]:border-vermilion data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
          >
            <ImagePlus className="h-3.5 w-3.5 shrink-0 text-vermilion" aria-hidden="true" />
            <span className="truncate">Artwork</span>
            {studio.layers.length > 0 && (
              <Badge variant="outline" className="h-4 px-1 font-mono text-[9.5px]">
                {studio.layers.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="text"
            data-testid="studio-tool-text"
            className="h-auto justify-center gap-1 rounded-[2px] border border-border/70 bg-card/70 px-2 py-1.5 text-[11px] data-[state=active]:border-vermilion data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
          >
            <Type className="h-3.5 w-3.5 shrink-0 text-vermilion" aria-hidden="true" />
            <span className="truncate">Text</span>
            {(studio.textLayers ?? []).length > 0 && (
              <Badge variant="outline" className="h-4 px-1 font-mono text-[9.5px]">
                {(studio.textLayers ?? []).length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="designs"
            data-testid="studio-tool-designs"
            className="h-auto justify-center gap-1 rounded-[2px] border border-border/70 bg-card/70 px-2 py-1.5 text-[11px] data-[state=active]:border-vermilion data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-vermilion" aria-hidden="true" />
            <span className="truncate">Designs</span>
            {(studio.ornaments ?? []).length > 0 && (
              <Badge variant="outline" className="h-4 px-1 font-mono text-[9.5px]">
                {(studio.ornaments ?? []).length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="spine"
            data-testid="studio-tool-spine"
            className="h-auto justify-center gap-1 rounded-[2px] border border-border/70 bg-card/70 px-2 py-1.5 text-[11px] data-[state=active]:border-vermilion data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-vermilion" aria-hidden="true" />
            <span className="truncate">Spine</span>
            {(studio.spineText.title.trim().length > 0 ||
              studio.spineText.author.trim().length > 0) && (
              <span
                aria-label="Spine text configured"
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-vermilion"
              />
            )}
          </TabsTrigger>

          <TabsTrigger
            value="presets"
            data-testid="studio-tool-presets"
            className="h-auto justify-center gap-1 rounded-[2px] border border-border/70 bg-card/70 px-2 py-1.5 text-[11px] data-[state=active]:border-vermilion data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
          >
            <Bookmark className="h-3.5 w-3.5 shrink-0 text-vermilion" aria-hidden="true" />
            <span className="truncate">Presets</span>
            {savedPresets.length > 0 && (
              <Badge
                variant="outline"
                data-testid="studio-tool-presets-badge"
                className="h-4 px-1 font-mono text-[9.5px]"
              >
                {savedPresets.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="preflight"
            data-testid="studio-tool-preflight"
            className="h-auto justify-center gap-1 rounded-[2px] border border-border/70 bg-card/70 px-2 py-1.5 text-[11px] data-[state=active]:border-vermilion data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
          >
            {preflight.status === 'pass' ? (
              <ShieldCheck
                className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-success-fg)]"
                aria-hidden="true"
              />
            ) : (
              <ShieldAlert
                className={`h-3.5 w-3.5 shrink-0 ${
                  preflight.errorCount > 0
                    ? 'text-destructive'
                    : 'text-[color:var(--status-warning-fg)]'
                }`}
                aria-hidden="true"
              />
            )}
            <span className="truncate">Preflight</span>
            {preflight.status === 'pass' ? (
              <Badge
                variant="success"
                data-testid="studio-tool-preflight-badge"
                className="h-4 px-1 font-mono text-[9.5px]"
              >
                OK
              </Badge>
            ) : (
              <Badge
                variant={preflight.errorCount > 0 ? 'destructive' : 'warning'}
                data-testid="studio-tool-preflight-badge"
                className="h-4 px-1 font-mono text-[9.5px]"
              >
                {preflight.errorCount + preflight.warningCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="p-2.5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
        <TabsContent value="artwork" className="mt-0">
          <ArtworkControlsCard
            studio={studio}
            selectedLayerId={selectedLayerId}
            eyedropperTarget={eyedropperTarget}
            extendingStub={extendingStub}
            sampledEdgeHex={sampledEdgeHex}
            onSelectLayer={onSelectImageLayer}
            onAddImageFiles={onAddImageFiles}
            onApplyProceduralArtwork={onApplyProceduralArtwork}
            onQuickFitLayer={onQuickFitLayer}
            onExtendLayerStub={onExtendLayerStub}
            onMatchSpineBackToEdge={onMatchSpineBackToEdge}
            onSetLayerClip={onSetLayerClip}
            onScaleLayer={onScaleLayer}
            onToggleLayerFlip={onToggleLayerFlip}
            onUpdateLayer={onUpdateLayer}
            onReorderLayer={onReorderLayer}
            onDetachSeriesLayer={
              onDetachSeriesLayer ? (id) => onDetachSeriesLayer('image', id) : undefined
            }
            onDeleteLayer={onDeleteLayer}
            onUpdateStudio={onUpdateStudio}
            onToggleEyedropper={onToggleEyedropper}
          />
        </TabsContent>

        <TabsContent value="text" className="mt-0">
          <CoverTextCard
            textLayers={studio.textLayers ?? []}
            customFont={customFont}
            selectedTextId={selectedTextId}
            onSelectText={onSelectText}
            onAddTextPreset={onAddTextPreset}
            onUpdateTextLayer={onUpdateTextLayer}
            onQuickAlignText={onQuickAlignText}
            onDetachSeriesLayer={
              onDetachSeriesLayer ? (id) => onDetachSeriesLayer('text', id) : undefined
            }
            onDeleteTextLayer={onDeleteTextLayer}
            onCustomFontSelected={onCustomFontSelected}
          />
        </TabsContent>

        <TabsContent value="designs" className="mt-0">
          <ClassicDesignsCard
            ornaments={studio.ornaments ?? []}
            selectedOrnamentId={selectedOrnamentId}
            onSelectOrnament={onSelectOrnament}
            onAddOrnament={onAddOrnament}
            onImportSvgStamp={onImportSvgStamp}
            onUpdateOrnament={onUpdateOrnament}
            onScaleOrnament={onScaleOrnament}
            onFitOrnamentToBoard={onFitOrnamentToBoard}
            onFitOrnamentWithMargin={onFitOrnamentWithMargin}
            onCenterOrnament={onCenterOrnament}
            onQuickAlignOrnament={onQuickAlignOrnament}
            onDetachSeriesLayer={
              onDetachSeriesLayer ? (id) => onDetachSeriesLayer('ornament', id) : undefined
            }
            onDeleteOrnament={onDeleteOrnament}
          />
        </TabsContent>

        <TabsContent value="spine" className="mt-0">
          <SpineTypographyCard
            spineText={studio.spineText}
            maxFontSizePt={maxFontSizePt}
            effectiveFontSizePt={effectiveFontSizePt}
            customFont={customFont}
            onUpdateSpineText={onUpdateSpineText}
            onCustomFontSelected={(file) => onCustomFontSelected(file)}
          />
        </TabsContent>

        <TabsContent value="presets" className="mt-0">
          <DesignPresetsCard
            savedPresets={savedPresets}
            builtInPresets={BUILT_IN_DESIGN_PRESETS}
            designMuse={designMuse}
            onSaveCurrent={onSavePreset}
            onApplyPreset={onApplyPreset}
            onDeletePreset={onDeletePreset}
            onExportPresets={onExportPresets}
            onImportPresets={onImportPresets}
          />
        </TabsContent>

        <TabsContent value="preflight" className="mt-0">
          <PreflightCard
            report={preflight}
            showOverlays={showPreflightOverlays}
            checkDpi={checkDpi}
            activeIssueId={activeIssueId}
            onToggleOverlays={onTogglePreflightOverlays}
            onToggleCheckDpi={onToggleCheckDpi}
            onHighlightIssue={onHighlightIssue}
            onApplyQuickFix={onApplyQuickFix}
            onIgnoreIssue={onIgnoreIssue}
            onRestoreIgnored={onRestoreIgnored}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}
