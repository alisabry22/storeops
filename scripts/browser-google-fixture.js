// Isolated QA only: synthetic browser-held key and intercepted API requests.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const state = { live: {}, writes: [], failures: [], stale: false, failRead: false, failPatch: false, ignorePatch: false };
  const regions = { US: ['USD', 1], EG: ['EGP', 10], DE: ['EUR', .9], GB: ['GBP', .8], IN: ['INR', 80], JP: ['JPY', 150], BR: ['BRL', 5], CA: ['CAD', 1.4] };
  const money = (amount, currencyCode) => { const total = Math.round(amount * 1e9); const units = Math.trunc(total / 1e9); return { currencyCode, units: String(units), nanos: total - units * 1e9 }; };
  const price = (m) => Number(m.units || 0) + (m.nanos || 0) / 1e9;
  function reset() {
    state.writes = []; state.stale = false; state.failRead = false; state.failPatch = false; state.ignorePatch = false;
    state.live = { pro: { packageName: 'com.storeops.qa', productId: 'pro', listings: [{ languageCode: 'en-US', title: 'Starter' }], basePlans: ['monthly', 'yearly', 'weekly'].map((basePlanId) => ({
      basePlanId, state: 'ACTIVE', autoRenewingBasePlanType: { billingPeriodDuration: basePlanId === 'monthly' ? 'P1M' : basePlanId === 'yearly' ? 'P1Y' : 'P1W', gracePeriodDuration: 'P7D' },
      otherRegionsConfig: { newSubscriberAvailability: false }, offerTags: [{ tag: 'keep-me' }],
      regionalConfigs: Object.entries(regions).map(([regionCode, [currency, rate]]) => ({ regionCode, price: money((basePlanId === 'monthly' ? 4.99 : basePlanId === 'yearly' ? 29.99 : 1.99) * rate, currency), newSubscriberAvailability: true })),
    })) } };
  }
  reset(); state.reset = reset; page.__googleQA = state;
  page.on('pageerror', (error) => state.failures.push(String(error)));
  await page.route('**/api/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const respond = (data, status = 200) => route.fulfill({ status, json: data });
    if (url.pathname === '/api/gp-token') return respond({ access_token: 'qa-google-token', expires_in: 3600 });
    if (url.pathname === '/api/snapshots') return respond({ snapshots: [] });
    if (!url.pathname.startsWith('/api/gp/')) return respond({ error: 'Mocked service unavailable' }, 401);
    const path = url.pathname.replace('/api/gp', '');
    if (path.endsWith('/edits') && request.method() === 'POST') return respond({ id: 'qa-edit' });
    if (path.endsWith('/edits/qa-edit/listings')) return respond({ listings: [{ language: 'en-US', title: 'Starter', shortDescription: 'Your app, worldwide.', fullDescription: 'A sample listing for browser QA.' }] });
    if (path.endsWith('/edits/qa-edit') && request.method() === 'DELETE') return route.fulfill({ status: 204 });
    if (path.endsWith('/pricing:convertRegionPrices')) {
      if (state.failRead) return respond({ error: { message: 'Fixture conversion failed' } }, 400);
      const amount = price(request.postDataJSON().price);
      return respond({ regionVersion: { version: 'qa-2026' }, convertedRegionPrices: Object.fromEntries(Object.entries(regions).map(([regionCode, [currency, rate]]) => [regionCode, { regionCode, price: money(Math.round(amount * rate * 100) / 100, currency) }])) });
    }
    if (path.endsWith('/subscriptions')) return respond({ subscriptions: Object.values(state.live) });
    if (path.includes('/subscriptions/')) {
      const id = path.split('/').pop();
      if (request.method() === 'PATCH') {
        state.writes.push({ path, params: Object.fromEntries(url.searchParams), body: request.postDataJSON() });
        if (state.failPatch) return respond({ error: { message: 'Simulated Google rejection' } }, 400);
        if (!state.ignorePatch) state.live[id] = request.postDataJSON();
        return respond(state.live[id]);
      }
      const resource = structuredClone(state.live[id]);
      if (state.stale) resource.basePlans[2].state = 'INACTIVE';
      return respond(resource);
    }
    if (/\/(oneTimeProducts|inappproducts)$/.test(path)) return respond({ oneTimeProducts: [], inappproducts: [] });
    state.failures.push('Unmocked Google API: ' + request.method() + ' ' + path);
    return respond({ error: { message: 'Unexpected fixture endpoint' } }, 400);
  });
  await page.goto('http://localhost:3100/play', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    localStorage.clear();
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['sign', 'verify']);
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('storeops-keys', 1); request.onupgradeneeded = () => request.result.createObjectStore('keys'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').put(pair.privateKey, 'gp-signing-key'); tx.oncomplete = resolve; tx.onerror = reject; }); db.close();
    localStorage.setItem('storeops-gp', JSON.stringify({ state: { gpCredentials: { clientEmail: 'qa@storeops.example' }, packages: ['com.storeops.qa'] }, version: 0 }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Choose your plans', exact: true }).waitFor();
  return { ready: true, writes: state.writes.length };
}
