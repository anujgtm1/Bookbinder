import { describe, expect, it } from 'vitest';
import { BINDING_STYLES } from '@/resources/paperSpecs';
import { DEFAULT_BOOK_PARAMETERS, type BindingStyle } from '@/types/bookParams';
import {
  BINDING_STYLE_STRATEGIES,
  SOFTCOVER_SEPARATE_POCKETS_STRATEGY,
  evaluateDetachedSlipCoverFit,
  evaluateFlapDepth,
  getBindingStrategy,
  listBindingStrategies,
  resolveBindingStrategy,
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
      supportsSeparatePockets: false,
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
      supportsSeparatePockets: false,
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
      supportsSeparatePockets: true,
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
      supportsSeparatePockets: false,
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
      supportsSeparatePockets: false,
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
      'Paperback Cover 220 × 148 mm • Score 2 spine folds & glue spine to textblock',
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
      'Dust Jacket 323.5 × 148 mm • 50 mm fold-in flaps • Score 4 vertical folds (no glue)',
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

    // Softcover slip cover (35% of page width, floor 35 mm, max 65 mm)
    expect(evaluateFlapDepth('softcover-jacket', 140, 24)).toEqual({
      currentFlapMm: 24,
      minRecommendedMm: 49,
      coverWidthPct: 17,
      isTooShallow: true,
    });
    expect(evaluateFlapDepth('softcover-jacket', 140, 49)).toEqual({
      currentFlapMm: 49,
      minRecommendedMm: 49,
      coverWidthPct: 35,
      isTooShallow: false,
    });
    // Narrow book respects 35 mm floor
    expect(evaluateFlapDepth('softcover-jacket', 80, 24)).toEqual({
      currentFlapMm: 24,
      minRecommendedMm: 35,
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

    // Classic dust jacket (45% of page width, floor 45 mm, max 100 mm)
    expect(evaluateFlapDepth('dust-jacket', 140, 35)).toEqual({
      currentFlapMm: 35,
      minRecommendedMm: 63,
      coverWidthPct: 25,
      isTooShallow: true,
    });
    expect(evaluateFlapDepth('dust-jacket', 140, 63)).toEqual({
      currentFlapMm: 63,
      minRecommendedMm: 63,
      coverWidthPct: 45,
      isTooShallow: false,
    });
    // Narrow pocket book respects 45 mm floor
    expect(evaluateFlapDepth('dust-jacket', 90, 38)).toEqual({
      currentFlapMm: 38,
      minRecommendedMm: 45,
      coverWidthPct: 42,
      isTooShallow: true,
    });
  });

  it('resolves SOFTCOVER_SEPARATE_POCKETS_STRATEGY for 2-sheet slip cover and evaluates detached single-sheet fit', () => {
    const a6Separate = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket' as const,
      softcoverPocketMode: 'separate' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    };

    const sepStrategy = resolveBindingStrategy(a6Separate);
    expect(sepStrategy).toBe(SOFTCOVER_SEPARATE_POCKETS_STRATEGY);
    expect(sepStrategy.capabilities).toEqual({
      usesChipboard: false,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: false,
      usesInnerPockets: true,
      supportsSeparatePockets: true,
      hasFlaps: false,
      hasGlueTabs: true,
      hasTurnIns: false,
    });
    expect(sepStrategy.innerPocketsNotice).toBeUndefined();
    expect(sepStrategy.flapConfig).toBeUndefined();
    expect(sepStrategy.materialNote).toContain('2-Sheet Slip Cover');
    expect(evaluateFlapDepth(a6Separate, 105, 0)).toBeNull();

    // Integrated softcover resolves standard 1-piece strategy
    expect(
      resolveBindingStrategy({ bindingStyle: 'softcover-jacket', softcoverPocketMode: 'integrated' }),
    ).toBe(BINDING_STYLE_STRATEGIES['softcover-jacket']);

    const cutList = sepStrategy.calculateCutList(a6Separate);
    const outerWrap = sepStrategy.calculateOuterWrap(a6Separate, cutList);
    expect(outerWrap.softcoverPocketMode).toBe('separate');
    expect(outerWrap.widthMm).toBe(223);
    expect(outerWrap.heightMm).toBe(170);
    expect(outerWrap.jacketFlapWidthMm).toBe(0);
    expect(outerWrap.jacketGlueTabHeightMm).toBe(10);
    expect(outerWrap.outerCutPolygon).toHaveLength(12);
    expect(outerWrap.jacketGlueTabPolygons).toHaveLength(4);
    expect(outerWrap.foldLines).toHaveLength(6);
    expect(sepStrategy.buildExportNote(outerWrap, cutList)).toContain('2-SHEET SLIP COVER');

    // evaluateDetachedSlipCoverFit returns single-sheet fit on integrated softcover-jacket, null otherwise
    const a6Integrated = {
      ...a6Separate,
      softcoverPocketMode: undefined,
      jacketFlapWidthMm: 50,
    };
    const detachedEval = evaluateDetachedSlipCoverFit(a6Integrated, 'letter');
    expect(detachedEval).not.toBeNull();
    expect(detachedEval?.fitsSingleSheet).toBe(true);
    expect(detachedEval?.detachedWidthMm).toBe(223);
    expect(detachedEval?.detachedHeightMm).toBe(170);
    expect(detachedEval?.fit.status).toBe('fits-1-sheet');

    // Returns null when already separate or on other binding styles
    expect(evaluateDetachedSlipCoverFit(a6Separate, 'letter')).toBeNull();
    expect(
      evaluateDetachedSlipCoverFit({ ...DEFAULT_BOOK_PARAMETERS, bindingStyle: 'dust-jacket' }, 'letter'),
    ).toBeNull();
  });
});
