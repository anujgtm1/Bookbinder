import { expect, test, type Page } from '@playwright/test';

async function selectDropdownOption(page: Page, triggerTestId: string, optionPattern: RegExp) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: optionPattern }).click();
}

test.describe('Declarative Layout Constraints — Pin, Resize Persistence & Detach', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('pins cover title to Front Center and frame to 12 mm margin, preserves pins on A6 resize, and detaches via Unpin button or drag', async ({
    page,
  }) => {
    // 1. Load Sample Book
    await page.getByTestId('load-sample-book-btn').click();
    await expect(page.getByTestId('studio-cover-text-0')).toContainText('TWENTY THOUSAND');

    // 2. Select front double-rule frame and pin to 12 mm board margin
    const frameOrnament = page.getByTestId('studio-ornament-0');
    await frameOrnament.click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'ornament',
    );

    const margin12Btn = page.getByTestId('selection-margin-12');
    await expect(margin12Btn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('selection-bar-unpin-btn')).toHaveCount(0);

    await margin12Btn.click();
    await expect(margin12Btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('selection-bar-unpin-btn')).toBeVisible();

    // 3. Select front title text and pin to Front Center
    const coverTitle = page.getByTestId('studio-cover-text-0');
    await coverTitle.click();
    await expect(page.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'text',
    );

    const centerBtn = page.getByTestId('selection-align-center');
    await expect(centerBtn).toHaveAttribute('aria-pressed', 'false');
    await centerBtn.click();
    await expect(centerBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('selection-bar-unpin-btn')).toBeVisible();

    // 4. Resize book to A6 Pocket Notebook (105 x 148 mm)
    // On A6 rigid-case (boardW=108, boardH=155, turnIn=18, hinge=9, spine=28, bleed=3):
    // Front board rect is x=175..283 (center 229.0), y=21..176 (center 98.5)
    await page.getByTestId('toggle-sidebar-btn').click();
    await selectDropdownOption(page, 'preset-select', /A6 Pocket Notebook/i);

    // Title remains pinned to Front Center and dead-centered on A6 front board
    await expect(centerBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('selection-bar-unpin-btn')).toBeVisible();

    const titleX = Number(await coverTitle.locator('text').first().getAttribute('x'));
    expect(Math.abs(titleX - 229.0)).toBeLessThan(0.5);

    // Frame holds exact 12 mm margins on A6 (108 - 24 = 84 mm wide, 155 - 24 = 131 mm tall)
    const frameHitRect = frameOrnament.locator('rect').first();
    const frameBoxOnA6 = {
      x: Number(await frameHitRect.getAttribute('x')),
      y: Number(await frameHitRect.getAttribute('y')),
      w: Number(await frameHitRect.getAttribute('width')),
      h: Number(await frameHitRect.getAttribute('height')),
    };
    expect(Math.abs(frameBoxOnA6.x - 187)).toBeLessThan(0.5);
    expect(Math.abs(frameBoxOnA6.y - 33)).toBeLessThan(0.5);
    expect(Math.abs(frameBoxOnA6.w - 84)).toBeLessThan(0.5);
    expect(Math.abs(frameBoxOnA6.h - 131)).toBeLessThan(0.5);

    // Select frame again -> 12 mm pin is still active, then click Unpin to detach without moving it
    await frameOrnament.click({ position: { x: 8, y: 8 } });
    await expect(margin12Btn).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('selection-bar-unpin-btn').click();
    await expect(margin12Btn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('selection-bar-unpin-btn')).toHaveCount(0);

    expect(Number(await frameHitRect.getAttribute('x'))).toBeCloseTo(frameBoxOnA6.x, 1);
    expect(Number(await frameHitRect.getAttribute('y'))).toBeCloseTo(frameBoxOnA6.y, 1);
    expect(Number(await frameHitRect.getAttribute('width'))).toBeCloseTo(frameBoxOnA6.w, 1);
    expect(Number(await frameHitRect.getAttribute('height'))).toBeCloseTo(frameBoxOnA6.h, 1);

    // 5. Select still-pinned cover title and drag manually -> auto-detaches constraint cleanly
    await coverTitle.click();
    await expect(centerBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('selection-bar-unpin-btn')).toBeVisible();

    const titleBox = await coverTitle.boundingBox();
    expect(titleBox).not.toBeNull();
    const startX = titleBox!.x + titleBox!.width / 2;
    const startY = titleBox!.y + titleBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 45, startY + 35, { steps: 6 });
    await page.mouse.up();

    await expect(centerBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('selection-bar-unpin-btn')).toHaveCount(0);
  });
});
