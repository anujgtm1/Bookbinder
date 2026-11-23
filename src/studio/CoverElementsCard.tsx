import { Sparkles, Type } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  ClassicOrnamentId,
  CoverElementZone,
  CoverOrnamentLayer,
  CoverTextLayer,
  CoverTextPresetKind,
} from '@/types/coverElements';
import type { CoverStudioState } from '@/types/studio';
import { ClassicDesignsCard } from './ClassicDesignsCard';
import { CoverTextCard } from './CoverTextCard';
import type { CustomFontAsset } from './fonts';

export type CoverElementsTab = 'text' | 'ornaments';

export interface CoverElementsCardProps {
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly selectedTextId: string | null;
  readonly selectedOrnamentId: string | null;
  /** When set, locks this card to a single section and hides its internal tablist (used inside the Cover Studio Tool Dock). */
  readonly forcedTab?: CoverElementsTab;
  readonly onSelectText: (id: string | null) => void;
  readonly onSelectOrnament: (id: string | null) => void;
  readonly onAddTextPreset: (preset: CoverTextPresetKind) => void;
  readonly onUpdateTextLayer: (id: string, patch: Partial<CoverTextLayer>) => void;
  readonly onQuickAlignText: (id: string, verticalSlot: 'upper' | 'center' | 'lower') => void;
  readonly onDeleteTextLayer: (id: string) => void;
  readonly onCustomFontSelected?: (file: File, targetTextLayerId: string) => void;
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
  readonly onDeleteOrnament: (id: string) => void;
}

export function CoverElementsCard({
  studio,
  customFont,
  selectedTextId,
  selectedOrnamentId,
  forcedTab,
  onSelectText,
  onSelectOrnament,
  onAddTextPreset,
  onUpdateTextLayer,
  onQuickAlignText,
  onDeleteTextLayer,
  onCustomFontSelected,
  onAddOrnament,
  onImportSvgStamp,
  onUpdateOrnament,
  onScaleOrnament,
  onFitOrnamentToBoard,
  onFitOrnamentWithMargin,
  onCenterOrnament,
  onDeleteOrnament,
}: CoverElementsCardProps) {
  const [activeTab, setActiveTab] = useState<CoverElementsTab>('text');

  const textLayers = studio.textLayers ?? [];
  const ornaments = studio.ornaments ?? [];
  const selectedText = textLayers.find((t) => t.id === selectedTextId) ?? null;
  const selectedOrnament = ornaments.find((o) => o.id === selectedOrnamentId) ?? null;

  // Keep visible tab in sync when the user clicks a text/ornament directly on the canvas
  const resolvedTab: CoverElementsTab =
    forcedTab ??
    (selectedOrnament && !selectedText
      ? 'ornaments'
      : selectedText && !selectedOrnament
        ? 'text'
        : activeTab);

  return (
    <Card data-testid="cover-elements-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 font-serif text-base">
            {forcedTab === 'text' ? (
              <>
                <Type className="h-4 w-4 text-brass" aria-hidden="true" />
                Front &amp; Back Cover Text
              </>
            ) : forcedTab === 'ornaments' ? (
              <>
                <Sparkles className="h-4 w-4 text-brass" aria-hidden="true" />
                Classic Bookbindery Designs &amp; SVG Stamps
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-brass" aria-hidden="true" />
                Front &amp; Back Text + Classic Designs
              </>
            )}
          </CardTitle>
          {!forcedTab && (
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
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {resolvedTab === 'text' ? (
          <CoverTextCard
            embedded
            textLayers={textLayers}
            customFont={customFont}
            selectedTextId={selectedTextId}
            onSelectText={onSelectText}
            onAddTextPreset={onAddTextPreset}
            onUpdateTextLayer={onUpdateTextLayer}
            onQuickAlignText={onQuickAlignText}
            onDeleteTextLayer={onDeleteTextLayer}
            onCustomFontSelected={onCustomFontSelected}
          />
        ) : (
          <ClassicDesignsCard
            embedded
            ornaments={ornaments}
            selectedOrnamentId={selectedOrnamentId}
            onSelectOrnament={onSelectOrnament}
            onAddOrnament={onAddOrnament}
            onImportSvgStamp={onImportSvgStamp}
            onUpdateOrnament={onUpdateOrnament}
            onScaleOrnament={onScaleOrnament}
            onFitOrnamentToBoard={onFitOrnamentToBoard}
            onFitOrnamentWithMargin={onFitOrnamentWithMargin}
            onCenterOrnament={onCenterOrnament}
            onDeleteOrnament={onDeleteOrnament}
          />
        )}
      </CardContent>
    </Card>
  );
}
