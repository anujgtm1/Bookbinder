import { CoverDesignPresetModel, type CoverDesignPreset } from '@/types/designPreset';

export const DESIGN_PRESETS_STORAGE_KEY = 'bookbinder-design-presets-v1';
export const DESIGN_PRESETS_EXPORT_SCHEMA_VERSION = 1 as const;

export type DesignPresetImportResult =
  | { readonly ok: true; readonly presets: CoverDesignPreset[] }
  | { readonly ok: false; readonly error: string };

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function asUserPreset(preset: CoverDesignPreset): CoverDesignPreset {
  return {
    id: preset.id,
    name: preset.name,
    createdAt: preset.createdAt,
    ...(preset.description ? { description: preset.description } : {}),
    frontBgColor: preset.frontBgColor,
    spineBgColor: preset.spineBgColor,
    backBgColor: preset.backBgColor,
    pocketBgColor: preset.pocketBgColor,
    spineStyle: { ...preset.spineStyle },
    textTemplates: preset.textTemplates.map((t) => ({ ...t })),
    ornamentTemplates: preset.ornamentTemplates.map((o) => ({
      ...o,
      ...(o.customSvgPaths ? { customSvgPaths: [...o.customSvgPaths] } : {}),
      ...(o.customSvgViewBox ? { customSvgViewBox: { ...o.customSvgViewBox } } : {}),
    })),
  };
}

export function loadSavedDesignPresets(
  storage: Storage | null = safeLocalStorage(),
): CoverDesignPreset[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(DESIGN_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    return CoverDesignPresetModel.deserializeList(raw).map(asUserPreset);
  } catch {
    return [];
  }
}

export function saveDesignPresets(
  presets: readonly CoverDesignPreset[],
  storage: Storage | null = safeLocalStorage(),
): void {
  if (!storage) return;
  try {
    const sanitized = presets.map(asUserPreset);
    storage.setItem(
      DESIGN_PRESETS_STORAGE_KEY,
      CoverDesignPresetModel.serializeList(sanitized),
    );
  } catch {
    // Ignore storage quota or restricted browsing context errors gracefully
  }
}

export function exportDesignPresetsJson(presets: readonly CoverDesignPreset[]): string {
  const sanitized = presets.map(asUserPreset);
  return JSON.stringify(
    {
      schemaVersion: DESIGN_PRESETS_EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      presets: sanitized,
    },
    null,
    2,
  );
}

export function importDesignPresetsJson(jsonText: string): DesignPresetImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'Invalid JSON syntax in design presets file.' };
  }

  const imported = CoverDesignPresetModel.deserializeList(parsed).map(asUserPreset);

  if (imported.length === 0) {
    return { ok: false, error: 'No valid design presets found in file.' };
  }

  return { ok: true, presets: imported };
}
