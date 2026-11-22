import { describe, expect, it } from 'vitest';
import { BookParametersModel } from './bookParams';
import { BookbinderProjectModel, PROJECT_SCHEMA_VERSION } from './project';
import { CoverStudioModel } from './studio';

describe('BookbinderProjectModel', () => {
  it('creates and round-trips a project through JSON', () => {
    const params = BookParametersModel.applyPreset(
      BookParametersModel.createDefault(),
      'us-trade-standard',
    );
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineBgColor: '#224466',
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Piranesi',
        author: 'Susanna Clarke',
      },
    };

    const project = BookbinderProjectModel.create(params, studio, 'Piranesi Hardcover');
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);

    const json = BookbinderProjectModel.toJson(project);
    const parsed = BookbinderProjectModel.fromJson(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.project.name).toBe('Piranesi Hardcover');
      expect(parsed.project.parameters).toEqual(params);
      expect(parsed.project.studio).toEqual(studio);
    }
  });

  it('returns structured errors on invalid JSON or missing parameters', () => {
    const badJson = BookbinderProjectModel.fromJson('{not valid json');
    expect(badJson.ok).toBe(false);

    const missingParams = BookbinderProjectModel.fromJson(JSON.stringify({ name: 'Oops' }));
    expect(missingParams.ok).toBe(false);

    const arrayInput = BookbinderProjectModel.fromUnknown([]);
    expect(arrayInput.ok).toBe(false);
  });

  it('sanitizes project file names cleanly', () => {
    expect(BookbinderProjectModel.suggestFileName('My Project', 'Dune: Messiah!')).toBe(
      'dune-messiah.json',
    );
    expect(BookbinderProjectModel.suggestFileName('   ', '')).toBe('bookbinder-project.json');
  });
});
