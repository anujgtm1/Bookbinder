import { evaluatePrintMediaFit } from '@/core/geometry';
import { resolveMultiBookQueueSources } from '@/core/multiBookExport';
import type {
  RollNestingExportOptions,
  SheetNestingExportOptions,
} from '@/core/pdfSheetLayout';
import type { PrinterMargins } from '@/core/printerMargins';
import { getDefaultProjectRepository, type ProjectRepository } from '@/core/projectLibrary';
import {
  triggerBlobDownload,
  triggerBytesDownload,
  triggerTextDownload,
} from '@/core/storage';
import type {
  BookParameters,
  PageSizeId,
  PrintMediaId,
  SplitMode,
} from '@/types/bookParams';
import type { CaseGeometry } from '@/types/geometry';
import type { MultiBookQueueEntry } from '@/types/multiBookExport';
import type { CoverStudioState } from '@/types/studio';
import { PRINT_DPI } from '@/types/units';
import { computeStudioCanvasSpec } from '../canvasSpec';
import type { CustomFontAsset } from '../fonts';
import { hasImageAboveVectorElements } from '../layerStack';
import { generateAffinityCoverSvg } from './coverAffinitySvgExporter';
import { generatePrintReadyRollPdf, type CoverPdfLayerMode } from './coverPdfExporter';
import { exportCoverPng300Dpi, renderCoverArtworkCanvas } from './coverRasterExporter';

export interface StyledCoverPdfExportRequest {
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly params: BookParameters;
  readonly includeCutLines?: boolean;
  readonly includeFoldLines?: boolean;
  readonly includeFoldGuideTicks?: boolean;
  readonly includeGuides?: boolean;
  readonly printMediaId?: PrintMediaId;
  readonly dpi?: 300 | 600;
  readonly tileOverlapMm?: number;
  readonly includeScaleBar?: boolean;
  readonly splitMode?: SplitMode;
  readonly exportLayerMode?: CoverPdfLayerMode;
  readonly appendInnerPocketsPage?: boolean;
  readonly innerPageSizeId?: PageSizeId;
  readonly customRollWidthMm?: number;
  readonly printerMargins?: PrinterMargins;
  readonly rollNesting?: RollNestingExportOptions;
  readonly sheetNesting?: SheetNestingExportOptions;
  readonly multiBookQueueEntries?: readonly MultiBookQueueEntry[];
  readonly skippedMultiBookCount?: number;
  readonly onFlushActiveBook?: () => Promise<void>;
  readonly getProjectRepository?: () => Promise<ProjectRepository>;
  readonly onProgressLabel?: (label: string | null) => void;
}

export async function runStyledCoverPdfExport(
  req: StyledCoverPdfExportRequest,
): Promise<{ readonly statusMessage: string }> {
  const effectiveMediaId = req.printMediaId ?? req.params.printMedia;
  const effectiveDpi = req.dpi ?? 300;
  const effectiveLayerMode: CoverPdfLayerMode = req.exportLayerMode ?? 'full';
  const isBaseOnly = effectiveLayerMode === 'base-only';
  const fileName = isBaseOnly ? 'outer_cover_base_for_htv.pdf' : 'outer_cover_print.pdf';
  const effectiveCustomRollWidthMm = req.customRollWidthMm ?? req.params.customRollWidthMm;

  let resolvedRollNesting = req.rollNesting;
  let resolvedSheetNesting = req.sheetNesting;
  let skippedCount = req.skippedMultiBookCount ?? 0;

  try {
    const queueEntries = req.multiBookQueueEntries;
    if (
      queueEntries &&
      queueEntries.length > 0 &&
      (req.sheetNesting?.enabled || req.rollNesting?.enabled)
    ) {
      await req.onFlushActiveBook?.();
      const repository = await (req.getProjectRepository
        ? req.getProjectRepository()
        : getDefaultProjectRepository());
      req.onProgressLabel?.(`Rendering 1/${queueEntries.length}: ${queueEntries[0].label}…`);
      const resolved = await resolveMultiBookQueueSources(queueEntries, {
        repository,
        target: 'cover-styled',
        dpi: effectiveDpi,
        includeGuides: req.includeCutLines ?? req.includeGuides,
        exportLayerMode: effectiveLayerMode,
        onProgress: (done, total) => {
          const nextEntry = queueEntries[done];
          req.onProgressLabel?.(
            done < total && nextEntry
              ? `Rendering ${done + 1}/${total}: ${nextEntry.label}…`
              : 'Composing PDF…',
          );
        },
      });
      skippedCount += resolved.skippedIds.length;
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

    const bytes = await generatePrintReadyRollPdf(req.geometry, req.studio, req.customFont, {
      includeCutLines: req.includeCutLines,
      includeFoldLines: req.includeFoldLines,
      includeFoldGuideTicks: req.includeFoldGuideTicks,
      includeGuides: req.includeGuides,
      exportLayerMode: effectiveLayerMode,
      printMediaId: effectiveMediaId,
      dpi: effectiveDpi,
      tileOverlapMm: req.tileOverlapMm,
      includeScaleBar: req.includeScaleBar,
      appendInnerPocketsPage: req.appendInnerPocketsPage,
      innerPageSizeId: req.innerPageSizeId,
      customRollWidthMm: effectiveCustomRollWidthMm,
      printerMargins: req.printerMargins,
      rollNesting: resolvedRollNesting,
      sheetNesting: resolvedSheetNesting,
    });
    triggerBytesDownload(bytes, fileName, 'application/pdf');

    const fit = evaluatePrintMediaFit(
      effectiveMediaId,
      req.geometry.outerWrap.widthMm,
      req.geometry.outerWrap.heightMm,
      req.tileOverlapMm,
      {
        customRollWidthMm: effectiveCustomRollWidthMm,
        margins: req.printerMargins,
      },
    );
    const layerTag = isBaseOnly ? ', Base Only for HTV' : '';
    const pocketsTag = req.appendInnerPocketsPage ? ' + Pockets' : '';
    const skippedNote =
      skippedCount > 0
        ? ` — ${skippedCount} saved ${skippedCount === 1 ? 'book was' : 'books were'} unavailable and skipped`
        : '';

    const statusMessage = resolvedSheetNesting?.enabled
      ? `Exported ${fileName} (multi-cover ${fit.mediaLabel} sheet layout${pocketsTag}, ${effectiveDpi} DPI${layerTag})${skippedNote}`
      : resolvedRollNesting?.enabled
        ? `Exported ${fileName} (multi-cover ${fit.mediaLabel} roll layout${pocketsTag}, ${effectiveDpi} DPI${layerTag})${skippedNote}`
        : fit.status === 'fits-1-sheet'
          ? `Exported ${fileName} (centered on 1× ${fit.mediaLabel}${pocketsTag}, ${effectiveDpi} DPI${layerTag})`
          : fit.status === 'fits-2-sheet-tile'
            ? `Exported ${fileName} (2 tiled ${fit.mediaLabel} pages with ${fit.tileOverlapMm} mm overlap${pocketsTag}, ${effectiveDpi} DPI${layerTag})`
            : isBaseOnly
              ? `Exported ${fileName} (${effectiveDpi} DPI, Base Only for HTV${pocketsTag})`
              : `Exported ${fileName} (${effectiveDpi} DPI + vector spine text${pocketsTag})`;

    return { statusMessage };
  } finally {
    req.onProgressLabel?.(null);
  }
}

export async function runStyledCoverPngExport(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
): Promise<{ readonly statusMessage: string }> {
  const spec = computeStudioCanvasSpec(geometry, PRINT_DPI);
  const blob = await exportCoverPng300Dpi(geometry, studio, customFont);
  triggerBlobDownload(blob, 'outer_cover_300dpi.png');
  return {
    statusMessage: `Exported outer_cover_300dpi.png (${spec.pixelWidth}×${spec.pixelHeight}px @ 300 DPI)`,
  };
}

export async function runStyledCoverSvgExport(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
): Promise<{ readonly statusMessage: string }> {
  let artworkDataUrl: string | undefined;
  if (studio.layers.length > 0 && !hasImageAboveVectorElements(studio)) {
    const canvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
      includeSpineText: false,
      dpi: PRINT_DPI,
    });
    artworkDataUrl = canvas.toDataURL('image/png');
  }
  const svg = generateAffinityCoverSvg(geometry, studio, customFont, artworkDataUrl);
  triggerTextDownload(svg, 'outer_cover_300dpi.svg', 'image/svg+xml;charset=utf-8');
  return {
    statusMessage: 'Exported outer_cover_300dpi.svg (Affinity round-trip)',
  };
}
