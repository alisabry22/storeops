// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const state = page.__googleQA; state.reset();
  const checks = [];
  function assert(condition, description) { if (!condition) throw new Error(description); checks.push(description); }
  await page.goto('http://localhost:3100/play', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Choose your plans', exact: true }).waitFor();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.getByRole('heading', { name: 'Choose your plans', exact: true }).isVisible(), `Google starts with paired pricing at ${width}px`);
    assert(!await page.getByRole('heading', { name: 'Store listing metadata', exact: true }).isVisible(), `Google metadata does not crowd pricing at ${width}px`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Google plan selection fits ${width}px`);
    await page.getByRole('button', { name: /^Store listing/ }).click();
    await page.getByRole('heading', { name: 'Store listing metadata', exact: true }).waitFor();
    assert(!await page.getByRole('heading', { name: 'Choose your plans', exact: true }).isVisible(), `Store listing is a separate task at ${width}px`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Connected Google store listing fits ${width}px`);
    await page.getByRole('button', { name: /^Pricing/ }).click();
  }
  await page.getByRole('button', { name: 'One product', exact: true }).click();
  await page.getByRole('combobox', { name: 'Choose product', exact: true }).selectOption('sub:pro:monthly');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.getByRole('button', { name: 'Preview local prices', exact: true }).isVisible(), `Individual Google pricing remains available at ${width}px`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Individual Google pricing fits ${width}px`);
  }
  assert(state.writes.length === 0, 'Google task navigation does not change prices');
  assert(state.failures.length === 0, 'Google connected navigation has no page errors or unmocked requests');
  return { passed: checks.length, checks };
}
