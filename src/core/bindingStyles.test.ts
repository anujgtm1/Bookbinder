import { describe, expect, it } from 'vitest';
import { BINDING_STYLES } from '@/resources/paperSpecs';
import { DEFAULT_BOOK_PARAMETERS, type BindingStyle } from '@/types/bookParams';
import {
  BINDING_STYLE_STRATEGIES,
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
});
