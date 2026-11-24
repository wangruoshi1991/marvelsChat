// Build admin first. Set PLAYWRIGHT_MODULE to a local Playwright install if needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const dist = process.env.ADMIN_BROWSER_DIST || path.resolve(__dirname, '../dist');
const origin = 'http://127.0.0.1:49374';
const operator = { id: 'operator', role: 'admin', adminPermissions: ['*'] };
const user = { id: 'subject', role: 'user', displayName: 'QA', status: 'active' };
const agent = { id: 'album-manager', name: '相册助手', enabled: true, grantedScopes: ['album:read'] };
let profile = {
  nickname: 'QA', bio: '简介', community: '社区', activityArea: '活动区域',
  headline: '设计师 <script>"&', publicLocation: '上海', experienceYears: 0, languages: ['zh', 'en'],
};

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const writes = { status: [], 'reset-password': [], profile: [], 'revoke-sessions': [], 'album-manager': [] };
    let finishProfileSave;
    const profileSave = new Promise(resolve => { finishProfileSave = resolve; });
    let details = 0;
    let lists = 0;
    await page.addInitScript(user => sessionStorage.setItem('miaoxun.admin.auth.v2',
      JSON.stringify({ token: 'intercepted-local', user })), operator);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const p = url.pathname;
      if (!p.startsWith('/api/')) {
        const asset = p.replace(/^\/admin\//, '');
        return route.fulfill({ path: path.join(dist, asset.includes('.') ? asset : 'index.html') });
      }
      if (p === '/api/me') return route.fulfill({ json: { data: { user: operator } } });
      if (p === '/api/admin/users') {
        lists++;
        return route.fulfill({ json: { data: { items: [user], total: 1 } } });
      }
      if (p === '/api/admin/users/subject') {
        details++;
        return route.fulfill({ json: { data: { user, profile, agents: [agent] } } });
      }
      const action = p.split('/').pop();
      if (!Object.hasOwn(writes, action)) throw Error('Unexpected route ' + p);
      const attempts = writes[action];
      if (action === 'album-manager') {
        assert.equal(p, '/api/admin/users/subject/agents/album-manager');
        assert.equal(route.request().method(), 'PATCH');
        assert.ok(route.request().headers()['idempotency-key']);
        assert.deepEqual(route.request().postDataJSON(), { enabled: false, grantedScopes: [] });
        attempts.push(true);
        agent.enabled = false;
        return route.fulfill({ json: { data: {} } });
      }
      attempts.push(action === 'profile'
        ? route.request().postDataJSON() : route.request().headers()['idempotency-key']);
      if (attempts.length === 1 || (action === 'reset-password' && attempts.length === 2)) {
        return route.fulfill({ status: 503, json: { error: { message: '本地操作失败' } } });
      }
      if (action === 'profile') {
        assert.equal(route.request().method(), 'PATCH');
        await profileSave;
        profile = attempts.at(-1);
      }
      if (action === 'status') user.status = 'disabled';
      return route.fulfill({ json: { data: {} } });
    });
    const button = (root, name) => root.getByRole('button', { name, exact: true });
    await page.goto(origin + '/admin/users');
    await button(page, '查看用户 QA 详情').click();
    await button(page, /停用账号$/).click();
    let dialog = page.getByRole('dialog', { name: '确认变更账号状态？' });
    const confirm = root => button(root, /^确\s*认$/).click();
    await confirm(dialog);
    await dialog.getByText('本地操作失败').waitFor();
    assert.equal(details, 1);
    await confirm(dialog);
    await button(page, /启用账号$/).waitFor();
    assert.ok(lists >= 2);
    assert.equal(details, 2);
    assert.ok(writes.status[0]);
    assert.deepEqual(writes.status, [writes.status[0], writes.status[0]]);

    await button(page, '撤销全部会话').click();
    dialog = page.getByRole('dialog', { name: '确认撤销全部会话？' });
    await button(dialog, /^取\s*消$/).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes['revoke-sessions'], []);
    await button(page, /重置密码$/).click();
    dialog = page.getByRole('dialog', { name: '重置密码' });
    const field = dialog.getByLabel('新的临时密码');
    await button(dialog, '确认重置').click();
    await dialog.getByText('临时密码须为 8 至 128 个字符，并包含英文大小写字母').waitFor();
    assert.equal(writes['reset-password'].length, 0);
    await field.fill('local-only-entry');
    await button(dialog, '确认重置').click();
    await dialog.getByText('临时密码须为 8 至 128 个字符，并包含英文大小写字母').waitFor();
    assert.equal(writes['reset-password'].length, 0);
    await field.fill('Local-only-entry-one');
    await button(dialog, '确认重置').click();
    await dialog.getByText('本地操作失败').waitFor();
    await button(dialog, '确认重置').click();
    await dialog.getByText('本地操作失败').waitFor();
    await field.fill('Local-only-entry-two');
    await button(dialog, '确认重置').click();
    await dialog.waitFor({ state: 'hidden' });
    const keys = writes['reset-password'];
    assert.equal(keys.length, 3);
    assert.equal(keys[0], keys[1]);
    assert.notEqual(keys[1], keys[2]);

    const nickname = page.getByLabel('昵称', { exact: true });
    const headline = page.getByLabel('身份标题');
    const city = page.getByLabel('公开城市');
    const years = page.getByLabel('从业年限');
    const languages = page.getByRole('combobox', { name: '语言' });
    assert.equal(await headline.inputValue(), '设计师 <script>"&');
    assert.equal(await years.inputValue(), '0');
    await page.getByText('英语', { exact: true }).waitFor();
    await page.getByText(/不更改 GPS 位置/).waitFor();
    await years.fill('2.5');
    await button(page, '保存资料').click();
    await page.getByText(/从业年限请填写 0 至 80/).waitFor();
    assert.equal(writes.profile.length, 0);

    await nickname.fill('edited locally');
    await headline.fill('');
    await city.fill('');
    await years.fill('');
    await languages.press('Backspace');
    await languages.press('Backspace');
    await button(page, '保存资料').click();
    await page.getByText('本地操作失败').waitFor();
    assert.equal(writes.profile.length, 1);
    assert.equal(await nickname.inputValue(), 'edited locally');
    await page.getByRole('button', { name: /保存资料$/ }).click();
    const busyForm = page.locator('form[aria-busy="true"]');
    await busyForm.waitFor();
    assert.equal(await nickname.isDisabled(), true);
    await busyForm.evaluate(form => form.requestSubmit());
    finishProfileSave();
    await page.getByText('资料已保存').waitFor();
    assert.equal(writes.profile.length, 2);
    assert.deepEqual(writes.profile[1], {
      nickname: 'edited locally', bio: '简介', community: '社区', activityArea: '活动区域',
      headline: '', publicLocation: '', experienceYears: null, languages: [],
    });
    await years.waitFor();
    assert.equal(await years.inputValue(), '');

    const agentRow = page.getByRole('row').filter({ hasText: '相册助手' });
    await button(agentRow, /^撤\s*销$/).click();
    await confirm(page.getByRole('dialog', { name: '确认撤销 Agent 授权？' }));
    await agentRow.getByText('未启用', { exact: true }).waitFor();
    assert.equal(await agentRow.getByRole('button').count(), 0);
    assert.equal(writes['album-manager'].length, 1);
    assert.deepEqual(errors, []);
    console.log('PASS account confirmation, retry, cancellation, and profile validation, clearing and duplicate protection');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
