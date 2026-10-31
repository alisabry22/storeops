// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const state = page.__googleQA;
  if (!state) throw new Error('Run browser-google-fixture.js first.');
  // This browser is seeded with synthetic credentials by the fixture above.
  await page.evaluate(() => localStorage.removeItem('storeops.snapshots.v1'));
  const checks = [];
  function assert(condition, description) { if (!condition) throw new Error(description); checks.push(description); }
  async function choose() {
    state.reset();
    await page.goto('http://localhost:3100/play', { waitUntil: 'domcontentloaded' });
    await page.getByRole('checkbox', { name: 'Starter · monthly pro', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Starter · yearly pro', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Same features, different billing periods.' }).check();
    await page.getByRole('button', { name: 'Continue to prices' }).click();
    await page.getByRole('heading', { name: 'Set your prices', exact: true }).waitFor();
  }
  async function preview() {
    await page.getByRole('button', { name: 'Preview both plans worldwide' }).click();
    await page.getByRole('heading', { name: 'Preview every country', exact: true }).waitFor();
  }
  async function egyptOnly() {
    await page.getByRole('checkbox', { name: 'All available countries', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Include Egypt', exact: true }).check();
    const acknowledgement = page.getByRole('checkbox', { name: /I reviewed the subscriber impact/ });
    if (await acknowledgement.isVisible()) await acknowledgement.check();
  }
  async function apply() {
    await page.getByRole('button', { name: 'Review & apply both plans' }).click();
    await page.getByRole('button', { name: 'Save backups & apply', exact: true }).click();
    await page.getByRole('heading', { name: 'Your pricing results', exact: true }).waitFor();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await choose();
  assert(await page.getByRole('spinbutton', { name: 'Monthly · USD' }).inputValue() === '4.99', 'Google monthly reference uses its live US price');
  assert(await page.getByRole('spinbutton', { name: 'Yearly · USD' }).inputValue() === '29.99', 'Google yearly reference uses its live US price');
  assert(await page.getByRole('radio').count() === 5, 'Both stores share the same five pricing goals');
  await page.getByText('Discount & price protection', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Yearly pricing', exact: true }).selectOption('target-discount');
  await page.getByRole('spinbutton', { name: 'Target yearly discount (%)' }).fill('0');
  await page.getByRole('button', { name: 'Preview both plans worldwide' }).click();
  await page.getByRole('alert').filter({ hasText: 'Choose an annual discount' }).waitFor();
  assert(state.writes.length === 0, 'Invalid discount blocks any Google mutation');
  await page.getByRole('spinbutton', { name: 'Target yearly discount (%)' }).fill('40');
  await page.getByRole('combobox', { name: 'Limit changes to existing prices', exact: true }).selectOption('full');
  await page.screenshot({ path: 'output/playwright/google-desktop-prices.png', fullPage: true });
  await preview();
  assert(state.writes.length === 0, 'Google pricing preview performs no subscription writes');
  assert(await page.getByRole('table').getByRole('row').count() === 9, 'Desktop comparison includes all configured Google regions');
  assert(await page.getByText('For new buyers only. Existing subscribers keep their prices.', { exact: true }).isVisible(), 'Google subscriber impact is explicit, not copied from Apple');
  assert(await page.getByRole('button', { name: 'Review & apply both plans' }).isDisabled(), 'Large Google changes require acknowledgement');
  await page.getByRole('textbox', { name: 'Search countries or currencies' }).fill('Egypt');
  assert(await page.getByRole('table').getByRole('row').count() === 2, 'Google countries can be searched by full name');
  assert((await page.getByRole('table').getByRole('row').last().innerText()).includes('EGP'), 'Google Egypt prices preserve EGP');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download comparison', exact: true }).click();
  await (await download).saveAs('output/playwright/google-paired-pricing.csv'); checks.push('Google comparison exports as CSV');
  await page.getByRole('textbox', { name: 'Search countries or currencies' }).fill('');
  await page.screenshot({ path: 'output/playwright/google-desktop-preview.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.getByRole('table').isHidden(), `Google preview uses country cards at ${width}px`);
    assert(await page.locator('.pricing-mobile-countries article').count() === 8, `All Google countries remain available at ${width}px`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Google preview fits ${width}px without horizontal overflow`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await egyptOnly();
  await page.getByRole('textbox', { name: 'Search countries or currencies' }).fill('Egypt');
  await page.screenshot({ path: 'output/playwright/google-mobile-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Review & apply both plans' }).click();
  assert(state.writes.length === 0, 'Google final review is still read-only');
  await page.getByRole('button', { name: 'Keep reviewing', exact: true }).click();
  assert(state.writes.length === 0, 'Cancelling Google final review changes nothing');
  const weekly = JSON.stringify(state.live.pro.basePlans[2]);
  const originalUS = JSON.stringify(state.live.pro.basePlans.map((plan) => plan.regionalConfigs.find((rc) => rc.regionCode === 'US')));
  await apply();
  assert(await page.getByText('Verified with Google Play', { exact: true }).count() === 2, 'Both Google plans are verified after apply');
  assert(state.writes.length === 1, 'Monthly and yearly base plans share one combined product update');
  assert(JSON.stringify(state.live.pro.basePlans[2]) === weekly, 'Unselected sibling base plans are preserved');
  assert(JSON.stringify(state.live.pro.basePlans.map((plan) => plan.regionalConfigs.find((rc) => rc.regionCode === 'US'))) === originalUS, 'Unselected countries remain unchanged in both plans');
  assert(state.writes[0].params['regionsVersion.version'] === 'qa-2026', 'Apply uses the same Google regions version as the preview');
  const backups = await page.evaluate(() => JSON.parse(localStorage.getItem('storeops.snapshots.v1')).filter((snapshot) => snapshot.platform === 'googleplay'));
  assert(backups.length === 2 && backups.every((snapshot) => snapshot.rows.length === 8), 'Both full Google recovery grids are saved');
  await page.getByRole('button', { name: 'One product', exact: true }).click();
  await page.getByRole('combobox', { name: 'Choose product', exact: true }).selectOption('sub:pro:monthly');
  await page.locator('summary').filter({ hasText: 'Price backups' }).click();
  assert(await page.getByText('Before pricing plans together · Starter · monthly', { exact: true }).isVisible(), 'Paired Google backups are accessible in the individual plan view');

  await choose(); state.failRead = true;
  await page.getByRole('button', { name: 'Preview both plans worldwide' }).click();
  await page.getByRole('alert').filter({ hasText: 'Fixture conversion failed' }).waitFor();
  assert(state.writes.length === 0, 'Failed Google conversion cannot mutate either plan');
  assert(await page.getByRole('button', { name: 'Preview both plans worldwide' }).isEnabled(), 'Failed Google previews can be retried');
  state.failRead = false; await preview(); await egyptOnly(); state.stale = true; await apply();
  assert(state.writes.length === 0, 'A changed sibling base plan invalidates both reviewed Google plans');
  assert(await page.getByRole('alert').filter({ hasText: 'changed since this preview' }).isVisible(), 'Google stale-state errors ask for a fresh preview');

  await choose(); await preview(); await egyptOnly();
  await page.evaluate(() => { window.__originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'storeops.snapshots.v1') throw new DOMException('QA storage full', 'QuotaExceededError'); return window.__originalSetItem.call(this, key, value); }; });
  await apply();
  assert(state.writes.length === 0, 'Failed Google recovery storage blocks both plans');
  assert(await page.getByText('Not started', { exact: true }).count() === 2, 'Failed backups never claim Google success');
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; delete window.__originalSetItem; });

  await choose(); await preview(); await egyptOnly(); state.failPatch = true; await apply();
  assert(await page.getByText('Needs review', { exact: true }).count() === 2, 'A rejected combined product write marks both Google plans for review');
  assert(await page.getByText('Verified with Google Play', { exact: true }).count() === 0, 'Google rejection never produces a success result');
  assert(state.writes.length === 1, 'A rejected Google preview is not silently repriced or retried');

  await choose(); await preview(); await egyptOnly(); state.ignorePatch = true; await apply();
  assert(await page.getByRole('alert').filter({ hasText: 'could not be verified' }).isVisible(), 'Google read-back mismatch is surfaced after accepted updates');
  assert(await page.getByText('Verified with Google Play', { exact: true }).count() === 0, 'An accepted but unverified Google update is never called successful');
  assert(state.failures.length === 0, 'Google flow has no uncaught JavaScript errors or unexpected store requests');
  return { passed: checks.length, checks };
}
