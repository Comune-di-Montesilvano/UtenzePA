import { expect, Page, test } from '@playwright/test';

// Smoke su un'installazione nuova (DB vuoto, solo migration): login dalla UI con l'Admin
// creato da tests.yml, poi ogni pagina principale. Fallisce su errori JavaScript, risposte
// 5xx dell'API o pagine che non arrivano a mostrare il contenuto.
const API = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';
const USERNAME = process.env.E2E_USERNAME ?? 'e2e.admin';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

const PAGES = [
  'dashboard',
  'building',
  'utilities',
  'plants',
  'contracts',
  'utilizer-grant',
  'invoices',
  'commitments',
  'budget-chapter',
  'third-parties',
  'consip-agreement',
  'acts',
  'map',
  'audit-log',
  'system-users',
  'utility-types',
  'act-types',
  'asset-nature',
  'asset-function',
  'branding',
  'invoice-import',
  'backup-import',
  'guida',
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().startsWith(API) && r.status() >= 500) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return errors;
}

test('API: health e setup già fatto', async ({ request }) => {
  expect((await request.get(`${API}/health/liveness`)).ok()).toBeTruthy();
  const setup = await request.get(`${API}/setup/status`);
  expect(setup.ok()).toBeTruthy();
  expect((await setup.json()).available).toBe(false);
});

test('login e pagine principali', async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto('/login');
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  for (const path of PAGES) {
    await test.step(path, async () => {
      await page.goto(`/${path}`);
      await expect(page).toHaveURL(new RegExp(`/${path}`));
      // Attesa delle chiamate della pagina, poi nessun errore raccolto.
      await page.waitForLoadState('networkidle');
      await expect(page.locator('app-root')).not.toBeEmpty();
      expect(errors, `errori su /${path}`).toEqual([]);
    });
  }
});
