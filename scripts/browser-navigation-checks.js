// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const state = page.__storeopsQA;
  if (!state) throw new Error('Run browser-fixture.js first.');
  state.reset();
  const checks = [];
  function assert(value, message) { if (!value) throw new Error(message); checks.push(message); }
  const routes = [
    ['/apps', 'Your apps'],
    ['/apps/qa-app', 'Edit your store listing'],
    ['/apps/qa-app/pricing', 'App download price'],
    ['/apps/qa-app/iap', 'In-app product prices'],
    ['/apps/qa-app/subscriptions', 'Subscription prices'],
    ['/play', 'Connect Google Play'],
  ];
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, heading] of routes) {
      await page.goto('http://localhost:3100' + path, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path + ' fits at ' + width + 'px');
      assert(await page.locator('#main-content').count() === 1, path + ' has a working skip target at ' + width + 'px');
      if (path === '/apps') assert(await page.getByRole('link', { name: /Subscriptions Monthly/ }).count() === 1, 'The app picker offers task-based navigation at ' + width + 'px');
      if (path === '/apps/qa-app/pricing') assert(!await page.getByRole('textbox', { name: 'Price spreadsheet' }).isVisible(), 'App pricing starts without spreadsheet controls at ' + width + 'px');
      if (width === 390 && path === '/apps') await page.screenshot({ path: 'output/playwright/mobile-apps.png', fullPage: true });
      if (width === 390 && path === '/apps/qa-app') await page.screenshot({ path: 'output/playwright/mobile-listing.png', fullPage: true });
    }
  }
  await page.evaluate(() => localStorage.removeItem('storeops-credentials'));
  await page.goto('http://localhost:3100/connect', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Connect a store', exact: true }).waitFor();
  assert(await page.getByRole('textbox', { name: 'Issuer ID', exact: true }).isVisible(), 'Store connection has clear labelled fields');
  assert(!await page.getByText('App Manager', { exact: true }).isVisible(), 'Connection setup instructions are available on demand');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Store connection fits on narrow phones');
  assert(state.failures.length === 0, 'Navigation introduces no page errors');
  return { passed: checks.length, checks };
}
