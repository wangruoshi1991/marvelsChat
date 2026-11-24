// Build admin first and set PLAYWRIGHT_MODULE to the local Playwright install.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const origin = 'http://127.0.0.1:49375';
const dist = process.env.ADMIN_BROWSER_DIST || path.resolve(__dirname, '../dist');
const operator = { id: 'operator', role: 'admin', adminPermissions: ['*'] };

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(6000);
    let controls = { revision: 9, operatorEnabled: true, providerCallsEnabled: false, queueEnabled: true,
      userDailyRequestLimit: null, userMonthlyBudgetFen: 100, globalDailyBudgetFen: null,
      captionReserveFen: 1, embeddingReserveFen: 1, lifecycle: 'sandbox' };
    let validRevision = false;
    const attempts = [];
    const reads = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(user => sessionStorage.setItem('miaoxun.admin.auth.v2',
      JSON.stringify({ token: 'intercepted-local', user })), operator);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const pathname = url.pathname;
      if (!pathname.startsWith('/api/')) {
        const asset = pathname.replace(/^\/admin\//, '');
        return route.fulfill({ path: path.join(dist, asset.includes('.') ? asset : 'index.html') });
      }
      if (pathname === '/api/me') return route.fulfill({ json: { data: { user: operator } } });
      if (pathname === '/api/admin/media-retrieval/overview') {
        reads.push(validRevision ? controls.revision : null);
        return route.fulfill({ json: { data: { controls: validRevision ? controls : { ...controls, revision: undefined } } } });
      }
      if (pathname !== '/api/admin/media-retrieval/controls') throw new Error('Unexpected local request ' + pathname);
      assert.equal(route.request().method(), 'PATCH');
      attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
      if (attempts.length === 1) {
        return route.fulfill({ status: 503, json: { error: { message: '本地传输失败' } } });
      }
      if (attempts.length === 2) {
        controls = { ...controls, revision: 10, userMonthlyBudgetFen: 102 };
        return route.abort('failed');
      }
      if (attempts.length === 4) {
        controls = { ...controls, providerCallsEnabled: true, revision: 11 };
      }
      return route.fulfill({ json: { data: { controls } } });
    });

    await page.goto(origin + '/admin/media');
    const save = page.getByRole('button', { name: '保存控制', exact: true });
    await page.getByText('控制版本不可用，请刷新后重试。').waitFor();
    assert.equal(await save.isDisabled(), true);
    assert.deepEqual(attempts, []);
    validRevision = true;
    await page.getByRole('button', { name: /刷\s*新$/ }).click();
    const monthly = page.getByRole('spinbutton', { name: '每用户每月预算（分）' });
    await monthly.fill('102');
    await monthly.press('Tab');
    await save.click();
    const dialog = page.getByRole('dialog', { name: '确认保存媒体检索控制？' });
    const confirm = dialog.getByRole('button', { name: '确认保存', exact: true });
    await confirm.click();
    await dialog.getByText('本地传输失败').waitFor();
    await confirm.click();
    await dialog.getByText('Failed to fetch').waitFor();
    await confirm.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('控制已保存').waitFor();
    await page.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled);
    assert.equal(await monthly.inputValue(), '102');
    assert.deepEqual(attempts.map(attempt => attempt.body),
      Array.from({ length: 3 }, () => ({ userMonthlyBudgetFen: 102, expectedRevision: 9 })));
    assert.equal(new Set(attempts.map(attempt => attempt.key)).size, 1);
    assert.ok(attempts[0].key);
    const provider = page.locator('#providerCallsEnabled');
    assert.equal(await provider.getAttribute('aria-checked'), 'false');
    await provider.click();
    await save.click();
    await confirm.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled);
    assert.deepEqual(attempts[3].body, { providerCallsEnabled: true, expectedRevision: 10 });
    assert.notEqual(attempts[3].key, attempts[0].key);
    assert.equal(await provider.getAttribute('aria-checked'), 'true');
    assert.deepEqual(reads, [null, 9, 10, 11]);
    assert.deepEqual(errors, []);
    console.log('PASS 503 and lost response reuse one key, submit one field, and read the new revision');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
