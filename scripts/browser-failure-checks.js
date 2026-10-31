// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const state = page.__storeopsQA;
  if (!state) throw new Error('Run browser-fixture.js first.');
  const checks = [];
  function assert(condition, label) { if (!condition) throw new Error(label); checks.push(label); }
  async function choosePlans() {
    state.reset();
    await page.goto('http://localhost:3100/apps/qa-app/subscriptions', { waitUntil: 'domcontentloaded' });
    await page.getByRole('checkbox', { name: 'Starter Monthly studio.monthly', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Starter Yearly studio.yearly', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Same features, different billing periods.' }).check();
    await page.getByRole('button', { name: 'Continue to prices' }).click();
    await page.getByRole('heading', { name: 'Set your prices', exact: true }).waitFor();
  }
  async function preview() {
    await page.getByRole('button', { name: 'Preview both plans worldwide' }).click();
    await page.getByRole('heading', { name: 'Preview every country', exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'All available countries', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Include Egypt', exact: true }).check();
    await page.getByRole('checkbox', { name: /I reviewed the subscriber impact/ }).check();
  }
  async function apply() {
    await page.getByRole('button', { name: 'Review & apply both plans' }).click();
    await page.getByRole('button', { name: 'Save backups & apply', exact: true }).click();
    await page.getByRole('heading', { name: 'Your pricing results', exact: true }).waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await choosePlans();
  state.failReads = true;
  await page.getByRole('button', { name: 'Preview both plans worldwide' }).click();
  await page.getByRole('alert').filter({ hasText: 'Fixture read failure' }).waitFor();
  assert(state.writes.length === 0, 'A failed preview never starts a store write');
  assert(await page.getByRole('button', { name: 'Preview both plans worldwide' }).isEnabled(), 'Failed previews can be retried');
  state.failReads = false;
  await preview();
  state.stale = true;
  await apply();
  assert(state.writes.length === 0, 'Stale previews stop both plans before any write');
  assert((await page.getByRole('alert').filter({ hasText: 'changed in App Store Connect' }).count()) === 1, 'Stale-state errors explain how to recover');

  await choosePlans();
  await preview();
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'storeops.snapshots.v1') throw new DOMException('Test storage full', 'QuotaExceededError');
      return window.__originalSetItem.call(this, key, value);
    };
  });
  await apply();
  assert(state.writes.length === 0, 'Failed recovery backups block both plans');
  assert(await page.getByText('Not started', { exact: true }).count() === 2, 'Backup failure never claims success for either plan');
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; delete window.__originalSetItem; });

  await choosePlans();
  await preview();
  state.failYearly = true;
  await apply();
  assert(await page.getByText('Verified with Apple', { exact: true }).count() === 1, 'Partial apply verifies only the successful plan');
  assert(await page.getByText('Needs review', { exact: true }).count() === 1, 'Partial apply marks the failed plan for review');
  assert(state.writes.length === 1 && state.writes[0].relationships.subscription.data.id === 'm', 'Yearly failure does not fabricate accepted yearly writes');
  assert(await page.getByRole('button', { name: 'Create a new preview', exact: true }).isVisible(), 'Partial failures provide a clear recovery action');
  assert(state.failures.length === 0, 'Failure paths have no unhandled page errors');
  return { passed: checks.length, checks };
}
