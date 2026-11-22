import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookParametersModel } from '@/types/bookParams';
import { BookbinderProjectModel } from '@/types/project';
import { CoverStudioModel } from '@/types/studio';
import {
  PROJECT_STORAGE_KEY,
  clearProjectStorage,
  loadProjectFromStorage,
  saveProjectToStorage,
} from './storage';

describe('storage persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads a BookbinderProject round-trip', () => {
    const params = BookParametersModel.applyPreset(
      BookParametersModel.createDefault(),
      'mass-market',
    );
    const project = BookbinderProjectModel.create(params, CoverStudioModel.createDefault(), 'Pocket Novel');

    const result = saveProjectToStorage(project);
    expect(result).toEqual({ saved: true, omittedImageForQuota: false });

    const loaded = loadProjectFromStorage();
    expect(loaded.name).toBe('Pocket Novel');
    expect(loaded.parameters.pbWidthMm).toBe(106.0);
    expect(loaded.parameters.pbHeightMm).toBe(174.0);
  });

  it('falls back gracefully on corrupt storage data and clears cleanly', () => {
    window.localStorage.setItem(PROJECT_STORAGE_KEY, '{corrupt');
    const loaded = loadProjectFromStorage();
    expect(loaded.parameters).toEqual(BookParametersModel.createDefault());

    clearProjectStorage();
    expect(window.localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull();
  });

  it('retries without image dataUrl when localStorage quota is exceeded', () => {
    let calls = 0;
    const mockStorage = {
      length: 0,
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn((_k: string, val: string) => {
        calls += 1;
        if (calls === 1) {
          throw new DOMException('QuotaExceededError');
        }
        expect(val).not.toContain('data:image/png');
      }),
    } as unknown as Storage;

    const defaultStudio = CoverStudioModel.createDefault();
    const studio = {
      ...defaultStudio,
      layers: [
        {
          id: 'img-1',
          dataUrl: 'data:image/png;base64,AAAA',
          fileName: 'cover.png',
          naturalWidth: 100,
          naturalHeight: 150,
          xMm: 0,
          yMm: 0,
          widthMm: 100,
          heightMm: 150,
          clipZone: 'none' as const,
        },
      ],
    };
    const project = BookbinderProjectModel.create(BookParametersModel.createDefault(), studio);

    const res = saveProjectToStorage(project, mockStorage);
    expect(res).toEqual({ saved: true, omittedImageForQuota: true });
    expect(calls).toBe(2);
  });
});
