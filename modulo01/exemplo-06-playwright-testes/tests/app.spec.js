const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/vanilla-js-web-app-example/');
});

test('loads the app and shows the image form', async ({ page }) => {
  await expect(page).toHaveTitle(/TDD Frontend Example/i);
  await expect(page.getByRole('textbox', { name: 'Image Title' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Image URL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit Form' })).toBeVisible();
});

test('submits the form and updates the image list', async ({ page }) => {
  const uniqueTitle = `Playwright E2E ${Date.now()}`;
  const imageUrl = 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=800&q=80';
  const initialCount = await page.locator('#card-list .card').count();

  await page.getByRole('textbox', { name: 'Image Title' }).fill(uniqueTitle);
  await page.getByRole('textbox', { name: 'Image URL' }).fill(imageUrl);
  await page.getByRole('button', { name: 'Submit Form' }).click();

  await expect(page.getByRole('heading', { name: uniqueTitle })).toBeVisible();
  await expect(page.locator('#card-list .card')).toHaveCount(initialCount + 1);
});

test('shows validation errors for empty and invalid fields', async ({ page }) => {
  await page.getByRole('button', { name: 'Submit Form' }).click();

  await expect(page.locator('#titleFeedback')).toBeVisible();
  await expect(page.locator('#urlFeedback')).toBeVisible();

  const validTitle = 'Valid Title';
  await page.getByRole('textbox', { name: 'Image Title' }).fill(validTitle);
  await page.getByRole('textbox', { name: 'Image URL' }).fill('not-a-valid-url');
  await page.getByRole('button', { name: 'Submit Form' }).click();

  await expect(page.locator('#urlFeedback')).toBeVisible();
  await expect(page.getByRole('heading', { name: validTitle })).not.toBeVisible();
});
