// Run in an isolated playwright-cli session with run-code --filename.
// Every /api request is intercepted. No store request leaves the browser.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const state = { writes: [], failures: [], failYearly: false, failReads: false, stale: false, live: {} };
  const regions = { USA: 'USD', EGY: 'EGP', DEU: 'EUR', GBR: 'GBP', IND: 'INR', JPN: 'JPY', BRA: 'BRL', CAN: 'CAD' };
  const tiers = {
    m: { USA: [3.99, 4.99, 5.99, 9.99], EGY: [79.99, 99.99, 109.99, 129.99, 149.99, 199.99] },
    y: { USA: [19.99, 29.99, 39.99, 49.99, 59.99], EGY: [499.99, 599.99, 699.99, 799.99, 999.99, 1199.99] },
  };
  function amounts(plan, region) { return tiers[plan][region] ?? (plan === 'm' ? [2.99, 3.99, 4.99, 5.99, 9.99] : [19.99, 24.99, 29.99, 39.99, 49.99]); }
  function point(plan, region, amount) { return { type: 'subscriptionPricePoints', id: ['p', plan, region, amount].join(':'), attributes: { customerPrice: String(amount), proceeds: String(amount * .7) }, relationships: { territory: { data: { type: 'territories', id: region } } } }; }
  function territory(id) { return { type: 'territories', id, attributes: { currency: regions[id] } }; }
  function reset() {
    state.writes = []; state.failYearly = false; state.failReads = false; state.stale = false;
    state.live = Object.fromEntries(['m', 'y'].map((plan) => [plan, Object.keys(regions).map((region) => ({
      type: 'subscriptionPrices', id: plan + '-' + region, attributes: { startDate: null }, relationships: {
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: point(plan, region, region === 'EGY' ? (plan === 'm' ? 149.99 : 999.99) : (plan === 'm' ? 4.99 : 29.99)).id } },
        territory: { data: { type: 'territories', id: region } },
      },
    }))]));
  }
  reset();
  state.reset = reset;
  page.__storeopsQA = state;
  page.on('pageerror', (error) => state.failures.push(String(error)));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/asc', '');
    const respond = (data, status = 200) => route.fulfill({ status, json: data });
    if (!url.pathname.startsWith('/api/asc')) {
      if (url.pathname === '/api/snapshots') return respond({ snapshots: [] });
      return respond({ error: 'Mocked service unavailable' }, 401);
    }
    if (state.failReads && request.method() === 'GET' && path.endsWith('/equalizations')) return respond({ errors: [{ detail: 'Fixture read failure' }] }, 400);
    if (request.method() === 'POST' && path === '/v1/subscriptionPrices') {
      const body = request.postDataJSON().data;
      const plan = body.relationships.subscription.data.id;
      if (state.failYearly && plan === 'y') return respond({ errors: [{ code: 'FIXTURE_FAILURE', detail: 'Simulated yearly failure' }] }, 422);
      state.writes.push(body);
      const row = { ...body, id: 'written-' + state.writes.length };
      state.live[plan].push(row);
      return respond({ data: row }, 201);
    }
    if (request.method() === 'DELETE' && path.startsWith('/v1/subscriptionPrices/')) {
      state.writes.push({ deletion: path });
      for (const plan of ['m', 'y']) state.live[plan] = state.live[plan].filter((row) => row.id !== path.split('/').pop());
      return route.fulfill({ status: 204 });
    }
    if (path === '/v1/apps') return respond({ data: [{ type: 'apps', id: 'qa-app', attributes: { name: 'StoreOps Test App', bundleId: 'com.storeops.qa', primaryLocale: 'en-US' } }] });
    if (path === '/v1/territories') return respond({ data: Object.keys(regions).map(territory) });
    if (path.endsWith('/subscriptionGroups')) return respond({ data: [{ type: 'subscriptionGroups', id: 'g1', attributes: { referenceName: 'Starter' } }, { type: 'subscriptionGroups', id: 'g2', attributes: { referenceName: 'Premium' } }] });
    if (path.includes('/subscriptionGroups/') && path.endsWith('/subscriptions')) {
      const premium = path.includes('/g2/');
      return respond({ data: ['m', 'y'].map((plan) => ({ type: 'subscriptions', id: premium ? plan + '-premium' : plan, attributes: { name: (premium ? 'Premium' : 'Starter') + (plan === 'm' ? ' Monthly' : ' Yearly'), productId: 'studio.' + (premium ? 'premium.' : '') + (plan === 'm' ? 'monthly' : 'yearly'), subscriptionPeriod: plan === 'm' ? 'ONE_MONTH' : 'ONE_YEAR', state: 'READY_TO_SUBMIT' } })) });
    }
    if (path.startsWith('/v1/subscriptions/') && path.endsWith('/pricePoints')) {
      const plan = path.split('/')[3].startsWith('m') ? 'm' : 'y';
      const countries = (url.searchParams.get('filter[territory]') || 'USA').split(',');
      return respond({ data: countries.flatMap((region) => amounts(plan, region).map((amount) => point(plan, region, amount))), included: countries.map(territory) });
    }
    if (path.startsWith('/v1/subscriptionPricePoints/') && path.endsWith('/equalizations')) {
      const [, plan] = decodeURIComponent(path.split('/')[3]).split(':');
      return respond({ data: Object.keys(regions).filter((region) => region !== 'USA').map((region) => point(plan, region, region === 'EGY' ? (plan === 'm' ? 149.99 : 999.99) : (plan === 'm' ? 4.99 : 29.99))), included: Object.keys(regions).map(territory) });
    }
    if (path.startsWith('/v1/subscriptions/') && path.endsWith('/prices')) {
      const plan = path.split('/')[3].startsWith('m') ? 'm' : 'y';
      const data = structuredClone(state.live[plan]);
      if (state.stale && plan === 'y') data.push({ ...data[0], id: 'changed-elsewhere', attributes: { startDate: '2099-01-01' } });
      return respond({ data, included: [...Object.keys(regions).map(territory), ...data.map((row) => { const [, p, region, amount] = row.relationships.subscriptionPricePoint.data.id.split(':'); return point(p, region, Number(amount)); })] });
    }
    if (path.endsWith('/appStoreVersions')) return respond({ data: [{ type: 'appStoreVersions', id: 'v1', attributes: { versionString: '1.0', platform: 'IOS', appStoreState: 'PREPARE_FOR_SUBMISSION' } }] });
    if (path.endsWith('/appStoreVersionLocalizations')) return respond({ data: ['en-US', 'ar-SA'].map((locale) => ({ type: 'appStoreVersionLocalizations', id: locale, attributes: { locale, whatsNew: 'A simpler way to plan your prices.', description: 'Your app description.', keywords: 'pricing,plans', promotionalText: '' } })) });
    if (path.endsWith('/inAppPurchasesV2')) return respond({ data: [] });
    if (path.endsWith('/appPriceSchedule')) return respond({ data: { type: 'appPriceSchedules', id: 'schedule' } });
    if (path.endsWith('/baseTerritory')) return respond({ data: territory('USA') });
    if (path.includes('/appPriceSchedules/') || path.endsWith('/appPricePoints')) return respond({ data: [], included: [] });
    state.failures.push('Unmocked API: ' + request.method() + ' ' + path);
    return respond({ errors: [{ detail: 'Unmocked fixture endpoint' }] }, 400);
  });
  await page.goto('http://localhost:3100', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    localStorage.clear();
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('storeops-keys', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put(pair.privateKey, 'asc-signing-key');
      tx.oncomplete = resolve; tx.onerror = reject;
    });
    db.close();
    localStorage.setItem('storeops-credentials', JSON.stringify({ state: { credentials: { issuerId: 'qa-issuer', keyId: 'qa-key' } }, version: 0 }));
  });
  await page.goto('http://localhost:3100/apps/qa-app/subscriptions', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Subscription prices', exact: true }).waitFor();
  return { ready: true, apiWrites: state.writes.length };
}
