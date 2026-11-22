import { expect, test } from '@playwright/test';

test('loads Bookbinder Studio shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bookbinder Studio');
});
