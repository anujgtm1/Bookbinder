import { describe, expect, it } from 'vitest';
import { BINDING_STYLES } from '@/resources/paperSpecs';
import { DEFAULT_BOOK_PARAMETERS, type BindingStyle } from '@/types/bookParams';
import {
  BINDING_STYLE_STRATEGIES,
  evaluateFlapDepth,
  getBindingStrategy,
  listBindingStrategies,
} from './bindingStyles';

describe('bindingStyles strategy registry', () => {
  it('registers every BINDING_STYLES entry in canonical order with matching metadata', () => {
    const strategies = listBindingStrategies();
    expect(strategies).toHaveLength(BINDING_STYLES.length);
    expect(strategies.map((s) => s.id)).toEqual(BINDING_STYLES.map((s) => s.id));

    for (const spec of BINDING_STYLES) {
      const strategy = getBindingStrategy(spec.id);
      expect(strategy).toBe(BINDING_STYLE_STRATEGIES[spec.id]);
      expect(strategy.label).toBe(spec.label);
      expect(strategy.shortLabel).toBe(spec.shortLabel);
      expect(strategy.summary).toBe(spec.summary);
      expect(strategy.materialNote.length).toBeGreaterThan(10);
    }

    // Undefined or unknown style falls back safely to rigid-case
    expect(getBindingStrategy(undefined).id).toBe('rigid-case');
    expect(getBindingStrategy('non-existent' as BindingStyle).id).toBe('rigid-case');
  });

  it('exposes accurate orthogonal capability flags across all 5 binding styles', () => {
    const rigid = getBindingStrategy('rigid-case');
    expect(rigid.capabilities).toEqual({
      usesChipboard: true,
      hasRigidSpine: true,
      hasHingeSpacers: true,
      supportsThreePieceSplit: true,
      usesInnerPockets: true,
      hasFlaps: false,
      hasGlueTabs: false,
      hasTurnIns: true,
    });
    expect(rigid.innerPocketsNotice).toBeUndefined();
    expect(rigid.flapConfig).toBeUndefined();

    const flex = getBindingStrategy('flexible-spine');
    expect(flex.capabilities).toEqual({
      usesChipboard: true,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: true,
      usesInnerPockets: true,
      hasFlaps: false,
      hasGlueTabs: false,
      hasTurnIns: true,
    });

    const slip = getBindingStrategy('softcover-jacket');
    expect(slip.capabilities).toEqual({
      usesChipboard: false,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: false,
      usesInnerPockets: false,
      hasFlaps: true,
      hasGlueTabs: true,
      hasTurnIns: false,
    });
    expect(slip.flapConfig?.maxMm).toBe(65);
    expect(slip.innerPocketsNotice).toBeDefined();

    const dust = getBindingStrategy('dust-jacket');
    expect(dust.capabilities).toEqual({
      usesChipboard: false,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: false,
      usesInnerPockets: false,
      hasFlaps: true,
      hasGlueTabs: false,
      hasTurnIns: false,
    });
    expect(dust.flapConfig?.maxMm).toBe(100);
    expect(dust.panelLabels.leftFlap).toBe('BACK FLAP');
    expect(dust.panelLabels.rightFlap).toBe('FRONT FLAP');
    expect(dust.innerPocketsNotice).toBeDefined();

    const pb = getBindingStrategy('paperback-wrap');
    expect(pb.capabilities).toEqual({
      usesChipboard: false,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: false,
      usesInnerPockets: false,
      hasFlaps: false,
      hasGlueTabs: false,
      hasTurnIns: false,
    });
    expect(pb.flapConfig).toBeUndefined();
    expect(pb.innerPocketsNotice).toBeDefined();
  });

  it('populates exact foldLines and export notes cleanly from every strategy', () => {
    const a6Base = {
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    };

    // Paperback wrap -> 2 vertical spine fold lines
    const pbStrategy = getBindingStrategy('paperback-wrap');
    const pbParams = { ...a6Base, bindingStyle: 'paperback-wrap' as const };
    const pbCut = pbStrategy.calculateCutList(pbParams);
    const pbWrap = pbStrategy.calculateOuterWrap(pbParams, pbCut);
    expect(pbWrap.foldLines).toHaveLength(2);
    expect(pbWrap.foldLines.map((l) => l.x1)).toEqual([105, 115]);
    expect(pbStrategy.buildExportNote(pbWrap, pbCut)).toBe(
      'Paperback Cover 220 × 148 mm • Score 2 spine folds & glue spine to textblock • Scale 1:1 mm',
    );

    // Dust jacket -> 4 vertical fold lines
    const djStrategy = getBindingStrategy('dust-jacket');
    const djParams = {
      ...a6Base,
      bindingStyle: 'dust-jacket' as const,
      jacketFlapWidthMm: 50,
    };
    const djCut = djStrategy.calculateCutList(djParams);
    const djWrap = djStrategy.calculateOuterWrap(djParams, djCut);
    expect(djWrap.foldLines).toHaveLength(4);
    expect(djWrap.foldLines.map((l) => l.x1)).toEqual([50, 156, 167.5, 273.5]);
    expect(djStrategy.buildExportNote(djWrap, djCut)).toBe(
      'Dust Jacket 323.5 × 148 mm • 50 mm fold-in flaps • Score 4 vertical folds (no glue) • Scale 1:1 mm',
    );

    // Softcover slip cover -> 4 vertical + 4 horizontal glue-tab fold lines = 8
    const scStrategy = getBindingStrategy('softcover-jacket');
    const scParams = { ...a6Base, bindingStyle: 'softcover-jacket' as const };
    const scCut = scStrategy.calculateCutList(scParams);
    const scWrap = scStrategy.calculateOuterWrap(scParams, scCut);
    expect(scWrap.foldLines).toHaveLength(8);
  });

  it('evaluates flap depth thresholds accurately for softcover-jacket and dust-jacket and returns null for non-flap styles', () => {
    // Non-flap styles return null
    expect(evaluateFlapDepth('rigid-case', 140, 30)).toBeNull();
    expect(evaluateFlapDepth('flexible-spine', 140, 30)).toBeNull();
    expect(evaluateFlapDepth('paperback-wrap', 140, 30)).toBeNull();

    // Softcover slip cover (25% of page width, floor 25 mm, max 65 mm)
    expect(evaluateFlapDepth('softcover-jacket', 140, 24)).toEqual({
      currentFlapMm: 24,
      minRecommendedMm: 35,
      coverWidthPct: 17,
      isTooShallow: true,
    });
    expect(evaluateFlapDepth('softcover-jacket', 140, 35)).toEqual({
      currentFlapMm: 35,
      minRecommendedMm: 35,
      coverWidthPct: 25,
      isTooShallow: false,
    });
    // Narrow book respects 25 mm floor
    expect(evaluateFlapDepth('softcover-jacket', 80, 24)).toEqual({
      currentFlapMm: 24,
      minRecommendedMm: 25,
      coverWidthPct: 30,
      isTooShallow: true,
    });
    // Very wide book clamps recommendation to maxMm (65 mm)
    expect(evaluateFlapDepth('softcover-jacket', 300, 65)).toEqual({
      currentFlapMm: 65,
      minRecommendedMm: 65,
      coverWidthPct: 22,
      isTooShallow: false,
    });

    // Classic dust jacket (38% of page width, floor 40 mm, max 100 mm)
    expect(evaluateFlapDepth('dust-jacket', 140, 35)).toEqual({
      currentFlapMm: 35,
      minRecommendedMm: 53.2,
      coverWidthPct: 25,
      isTooShallow: true,
    });
    expect(evaluateFlapDepth('dust-jacket', 140, 53.2)).toEqual({
      currentFlapMm: 53.2,
      minRecommendedMm: 53.2,
      coverWidthPct: 38,
      isTooShallow: false,
    });
    // Narrow pocket book respects 40 mm floor
    expect(evaluateFlapDepth('dust-jacket', 90, 38)).toEqual({
      currentFlapMm: 38,
      minRecommendedMm: 40,
      coverWidthPct: 42,
      isTooShallow: true,
    });
  });
});
