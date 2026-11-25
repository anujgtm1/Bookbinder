import {
  SeriesProjectModel,
  asSeriesId,
  isSeriesId,
  type SeriesId,
  type SeriesParseResult,
  type SeriesProject,
} from '@/types/seriesSpines';

export const SERIES_WORKSPACE_STORAGE_KEY = 'bookbinder.series.v1' as const;

export interface SeriesWorkspaceState {
  readonly activeSeriesId: SeriesId;
  readonly seriesList: readonly SeriesProject[];
}

export interface SaveSeriesWorkspaceResult {
  readonly saved: boolean;
  readonly omittedPanoramaForQuota: boolean;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function createDefaultSeriesWorkspace(): SeriesWorkspaceState {
  const starter = SeriesProjectModel.createDefault();
  return {
    activeSeriesId: starter.id,
    seriesList: [starter],
  };
}

export function loadSeriesWorkspace(
  storage: Storage | null = safeLocalStorage(),
): SeriesWorkspaceState {
  if (!storage) {
    return createDefaultSeriesWorkspace();
  }
  try {
    const rawText = storage.getItem(SERIES_WORKSPACE_STORAGE_KEY);
    if (!rawText) {
      return createDefaultSeriesWorkspace();
    }
    const parsed: unknown = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createDefaultSeriesWorkspace();
    }
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.seriesList) || obj.seriesList.length === 0) {
      return createDefaultSeriesWorkspace();
    }

    const validList: SeriesProject[] = [];
    for (const item of obj.seriesList) {
      const res = SeriesProjectModel.fromUnknown(item);
      if (res.ok) {
        validList.push(res.series);
      }
    }

    if (validList.length === 0) {
      return createDefaultSeriesWorkspace();
    }

    const requestedActiveId = isSeriesId(obj.activeSeriesId)
      ? asSeriesId(obj.activeSeriesId)
      : null;
    const activeSeriesId =
      requestedActiveId && validList.some((s) => s.id === requestedActiveId)
        ? requestedActiveId
        : validList[0].id;

    return {
      activeSeriesId,
      seriesList: validList,
    };
  } catch {
    return createDefaultSeriesWorkspace();
  }
}

export function saveSeriesWorkspace(
  state: SeriesWorkspaceState,
  storage: Storage | null = safeLocalStorage(),
): SaveSeriesWorkspaceResult {
  if (!storage) {
    return { saved: false, omittedPanoramaForQuota: false };
  }

  const payload = {
    activeSeriesId: state.activeSeriesId,
    seriesList: state.seriesList.map((s) => SeriesProjectModel.serialize(s)),
  };

  try {
    storage.setItem(SERIES_WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
    return { saved: true, omittedPanoramaForQuota: false };
  } catch {
    // Retry without embedded panoramic image dataUrl if localStorage quota is exceeded
    try {
      const stripped = {
        activeSeriesId: state.activeSeriesId,
        seriesList: state.seriesList.map((s) =>
          SeriesProjectModel.serialize(s, { includePanoramaData: false }),
        ),
      };
      storage.setItem(SERIES_WORKSPACE_STORAGE_KEY, JSON.stringify(stripped));
      return { saved: true, omittedPanoramaForQuota: true };
    } catch {
      return { saved: false, omittedPanoramaForQuota: false };
    }
  }
}

export function exportSeriesToJson(series: SeriesProject): string {
  return SeriesProjectModel.toJson(series);
}

export function parseSeriesFromJson(jsonText: string): SeriesParseResult {
  return SeriesProjectModel.fromJson(jsonText);
}
