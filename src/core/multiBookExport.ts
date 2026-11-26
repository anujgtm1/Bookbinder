import {
  generatePrintReadyRollPdf,
  type CoverPdfLayerMode,
  type PrintReadyCoverPdfOptions,
} from '@/studio/exporters/coverPdfExporter';
import type { CustomFontAsset } from '@/studio/fonts';
import type { CaseGeometry } from '@/types/geometry';
import {
  clampQueueEntryCopies,
  type MultiBookExportTarget,
  type MultiBookQueueEntry,
} from '@/types/multiBookExport';
import type { SavedCustomFontRecord } from '@/types/projectLibrary';
import type { CoverStudioState } from '@/types/studio';
import { calculateCaseGeometry } from './geometry';
import { generateOuterWrapPdf } from './pdfExport';
import type { MultiBookGangPdfItem } from './pdfSheetLayout';
import type { ProjectRepository } from './projectLibrary';

export type StyledCoverPdfRenderer = (
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  options?: PrintReadyCoverPdfOptions,
) => Promise<Uint8Array>;

export interface ResolveMultiBookSourcesOptions {
  readonly repository: ProjectRepository;
  readonly target: MultiBookExportTarget;
  readonly dpi?: 300 | 600;
  readonly includeGuides?: boolean;
  readonly exportLayerMode?: CoverPdfLayerMode;
  readonly renderStyledCoverPdf?: StyledCoverPdfRenderer;
  readonly onProgress?: (completed: number, total: number, label: string) => void;
}

export interface ResolveMultiBookSourcesResult {
  readonly items: readonly MultiBookGangPdfItem[];
  readonly skippedIds: readonly string[];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled multi-book queue entry kind: ${String(value)}`);
}

function toCustomFontAsset(
  savedFont: SavedCustomFontRecord | null | undefined,
): CustomFontAsset | null {
  if (!savedFont) return null;
  return {
    familyName: savedFont.familyName,
    fileName: savedFont.fileName,
    bytes: savedFont.bytes,
    pdfEmbeddable: savedFont.pdfEmbeddable,
  };
}

/**
 * Resolves a heterogeneous multi-book export queue (`saved-project` library records and
 * `uploaded-pdf` blobs) into 1:1 mm `exact-auto` PDF items ready for cut-sheet or roll nesting.
 */
export async function resolveMultiBookQueueSources(
  entries: readonly MultiBookQueueEntry[],
  options: ResolveMultiBookSourcesOptions,
): Promise<ResolveMultiBookSourcesResult> {
  const total = entries.length;
  let completed = 0;
  const items: MultiBookGangPdfItem[] = [];
  const skippedIds: string[] = [];
  const renderStyled = options.renderStyledCoverPdf ?? generatePrintReadyRollPdf;

  for (const entry of entries) {
    const copies = clampQueueEntryCopies(entry.copies);

    switch (entry.kind) {
      case 'uploaded-pdf': {
        if (entry.pdfBytes.byteLength === 0) {
          skippedIds.push(entry.id);
        } else {
          items.push({
            id: entry.id,
            label: entry.label,
            pdfBytes: entry.pdfBytes,
            copies,
          });
        }
        completed += 1;
        options.onProgress?.(completed, total, entry.label);
        break;
      }

      case 'saved-project': {
        const record = await options.repository.getProject(entry.projectId);
        if (!record) {
          skippedIds.push(entry.id);
          completed += 1;
          options.onProgress?.(completed, total, entry.label);
          break;
        }

        const geometry = calculateCaseGeometry(record.project.parameters);
        const customFont = toCustomFontAsset(record.customFont);

        const pdfBytes =
          options.target === 'cover-styled'
            ? await renderStyled(geometry, record.project.studio, customFont, {
                printMediaId: 'exact-auto',
                includeScaleBar: false,
                dpi: options.dpi,
                includeGuides: options.includeGuides,
                exportLayerMode: options.exportLayerMode,
              })
            : await generateOuterWrapPdf(geometry, 'single', {
                printMediaId: 'exact-auto',
                includeScaleBar: false,
                includeGuides: options.includeGuides,
              });

        items.push({
          id: entry.id,
          label: entry.label,
          pdfBytes,
          copies,
        });
        completed += 1;
        options.onProgress?.(completed, total, entry.label);
        break;
      }

      default:
        assertNever(entry);
    }
  }

  return { items, skippedIds };
}
