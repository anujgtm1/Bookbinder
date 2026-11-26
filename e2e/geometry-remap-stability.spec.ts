import { expect, test, type Page } from '@playwright/test';

interface CanvasSnapshot {
  readonly viewBoxWidth: number;
  readonly viewBoxHeight: number;
  readonly titleX: number;
  readonly titleY: number;
  readonly frameX: number;
  readonly frameY: number;
  readonly frameW: number;
  readonly frameH: number;
  readonly compassX: number;
  readonly compassY: number;
  readonly compassW: number;
  readonly compassH: number;
  readonly backBlurbX: number;
  readonly backBlurbY: number;
}

async function readNumAttr(locator: ReturnType<Page['locator']>, attr: string): Promise<number> {
  const val = await locator.getAttribute(attr);
  return Number.parseFloat(val ?? 'NaN');
}

async function readCanvasSnapshot(page: Page): Promise<CanvasSnapshot> {
  const svg = page.getByTestId('studio-preview-svg');
  const vbRaw = (await svg.getAttribute('viewBox')) ?? '0 0 0 0';
  const vb = vbRaw.split(/\s+/).map(Number);

  const titleText = page.getByTestId('studio-cover-text-0').locator('text').first();
  const backBlurbText = page.getByTestId('studio-cover-text-3').locator('text').first();
  const frameRect = page.getByTestId('studio-ornament-0').locator('rect').first();
  const compassRect = page.getByTestId('studio-ornament-1').locator('rect').first();

  const [
    titleX,
    titleY,
    frameX,
    frameY,
    frameW,
    frameH,
    compassX,
    compassY,
    compassW,
    compassH,
    backBlurbX,
    backBlurbY,
  ] = await Promise.all([
    readNumAttr(titleText, 'x'),
    readNumAttr(titleText, 'y'),
    readNumAttr(frameRect, 'x'),
    readNumAttr(frameRect, 'y'),
    readNumAttr(frameRect, 'width'),
    readNumAttr(frameRect, 'height'),
    readNumAttr(compassRect, 'x'),
    readNumAttr(compassRect, 'y'),
    readNumAttr(compassRect, 'width'),
    readNumAttr(compassRect, 'height'),
    readNumAttr(backBlurbText, 'x'),
    readNumAttr(backBlurbText, 'y'),
  ]);

  return {
    viewBoxWidth: vb[2],
    viewBoxHeight: vb[3],
    titleX,
    titleY,
    frameX,
    frameY,
    frameW,
    frameH,
    compassX,
    compassY,
    compassW,
    compassH,
    backBlurbX,
    backBlurbY,
  };
}

async function selectDropdownOption(page: Page, triggerTestId: string, optionPattern: RegExp) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: optionPattern }).click();
}

function expectSnapshotsWithin(
  actual: CanvasSnapshot,
  expected: CanvasSnapshot,
  toleranceMm: number,
) {
  expect(Math.abs(actual.titleX - expected.titleX)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.titleY - expected.titleY)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.frameX - expected.frameX)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.frameY - expected.frameY)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.frameW - expected.frameW)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.frameH - expected.frameH)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.compassX - expected.compassX)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.compassY - expected.compassY)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.compassW - expected.compassW)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.compassH - expected.compassH)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.backBlurbX - expected.backBlurbX)).toBeLessThan(toleranceMm);
  expect(Math.abs(actual.backBlurbY - expected.backBlurbY)).toBeLessThan(toleranceMm);
}

test.describe('Geometry Remap Stability — Notebook Presets, Binding Styles & Envelope Round-Trips', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('keeps front cover elements centered when switching Paperback Presets (US Trade -> A6 -> US Trade) with zero drift', async ({
    page,
  }) => {
    await page.getByTestId('load-sample-book-btn').click();
    await expect(page.getByTestId('studio-cover-text-0')).toContainText('TWENTY THOUSAND');

    // Normalize onto exact US Trade Digest preset (139.7 x 215.9 mm) so preset round-trip returns to identical dimensions
    await page.getByTestId('toggle-sidebar-btn').click();
    await selectDropdownOption(page, 'preset-select', /US Trade Digest/i);
    const baseline = await readCanvasSnapshot(page);

    // Switch to A6 Pocket Notebook (105 x 148 mm)
    await selectDropdownOption(page, 'preset-select', /A6 Pocket Notebook/i);
    const onA6 = await readCanvasSnapshot(page);

    // On A6 rigid-case (boardW=108, boardH=155, turnIn=18, hinge=9, spine=28, bleed=3):
    // Front board rect is x=175..283 (center 229.0), y=21..176 (center 98.5)
    expect(Math.abs(onA6.titleX - 229.0)).toBeLessThan(0.5);
    expect(Math.abs(onA6.frameX + onA6.frameW / 2 - 229.0)).toBeLessThan(0.5);
    expect(Math.abs(onA6.frameY + onA6.frameH / 2 - 98.5)).toBeLessThan(0.5);
    expect(onA6.frameX).toBeGreaterThan(175);
    expect(onA6.frameX + onA6.frameW).toBeLessThan(283);
    expect(Math.abs(onA6.compassX + onA6.compassW / 2 - 229.0)).toBeLessThan(0.5);
    expect(Math.abs(onA6.compassW - onA6.compassH)).toBeLessThan(0.1);

    // Switch back to US Trade Digest -> must return to exact original coordinates
    await selectDropdownOption(page, 'preset-select', /US Trade Digest/i);
    const returned = await readCanvasSnapshot(page);
    expectSnapshotsWithin(returned, baseline, 0.5);
  });

  test('keeps front cover elements centered across Binding Styles (Slip Cover, Dust Jacket, Rigid Case) and Inner Pockets tab round-trip', async ({
    page,
  }) => {
    await page.getByTestId('load-sample-book-btn').click();
    await expect(page.getByTestId('studio-cover-text-0')).toContainText('TWENTY THOUSAND');

    const baseline = await readCanvasSnapshot(page);
    // Sample Book US Trade Digest (140 x 216 x 24, rigid-case, spine=28): front center = (281.5, 132.5)
    expect(Math.abs(baseline.titleX - 281.5)).toBeLessThan(0.2);

    // 1. Switch to Fold-and-Glue Slip Cover (1-Piece Flaps)
    await page.getByTestId('toggle-sidebar-btn').click();
    await selectDropdownOption(page, 'binding-style-select', /Fold-and-Glue Slip Cover/i);
    const onSlipIntegrated = await readCanvasSnapshot(page);
    // Slip Cover integrated: flap=32.2, coverW=141, spineW=25, tabH=10, bleed=3 -> front x=201.2..342.2 (center 271.7), y=13..231 (center 122.0)
    expect(Math.abs(onSlipIntegrated.titleX - 271.7)).toBeLessThan(0.5);
    expect(Math.abs(onSlipIntegrated.frameX + onSlipIntegrated.frameW / 2 - 271.7)).toBeLessThan(
      0.5,
    );
    expect(Math.abs(onSlipIntegrated.frameY + onSlipIntegrated.frameH / 2 - 122.0)).toBeLessThan(
      0.5,
    );

    // 2. Toggle to Separate Pockets (2-Sheet) and back to 1-Piece Flaps
    await page.getByTestId('softcover-pocket-mode-separate').click();
    const onSlipSeparate = await readCanvasSnapshot(page);
    // Separate pockets: front x=169..310 (center 239.5), y=13..231 (center 122.0)
    expect(Math.abs(onSlipSeparate.titleX - 239.5)).toBeLessThan(0.5);
    expect(Math.abs(onSlipSeparate.frameX + onSlipSeparate.frameW / 2 - 239.5)).toBeLessThan(0.5);

    // 3. Switch to Classic Dust Jacket
    await selectDropdownOption(page, 'binding-style-select', /Classic Dust Jacket/i);
    const onDustJacket = await readCanvasSnapshot(page);
    // Dust Jacket: flap=70, coverW=141, spineW=25.5, bleed=3 -> front x=239.5..380.5 (center 310.0), y=3..219 (center 111.0)
    expect(Math.abs(onDustJacket.titleX - 310.0)).toBeLessThan(0.5);
    expect(Math.abs(onDustJacket.frameX + onDustJacket.frameW / 2 - 310.0)).toBeLessThan(0.5);
    expect(Math.abs(onDustJacket.frameY + onDustJacket.frameH / 2 - 111.0)).toBeLessThan(0.5);

    // 4. Return to Rigid 3-Board Hardcover -> zero cumulative drift
    await selectDropdownOption(page, 'binding-style-select', /Rigid 3-Board Hardcover/i);
    const afterBindingRoundTrip = await readCanvasSnapshot(page);
    expectSnapshotsWithin(afterBindingRoundTrip, baseline, 0.5);

    // 5. Switch to Inner Pockets tab -> toggle Folded Glue-In Endpapers -> back to Removable Slip-In Pockets -> return to Cover Studio
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('inner-blueprint-svg')).toBeVisible();
    await page.getByTestId('interior-style-folded-endpapers').click();
    await expect(page.getByTestId('interior-style-folded-endpapers')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('interior-style-slip-pockets').click();
    await expect(page.getByTestId('interior-style-slip-pockets')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByTestId('nav-outer').click();
    await expect(page.getByTestId('studio-preview-svg')).toBeVisible();
    const afterPocketsRoundTrip = await readCanvasSnapshot(page);
    expectSnapshotsWithin(afterPocketsRoundTrip, baseline, 0.5);
  });
});
