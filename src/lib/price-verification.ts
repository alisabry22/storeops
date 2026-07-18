export interface PriceMismatch {
  region: string;
  expected: number;
  actual: number | null;
}

export interface PricePointMismatch {
  territoryId: string;
  expectedPricePointId: string;
  actualPricePointId: string | null;
}

/** Pure verification used after a store reports a successful write. */
export function findPriceMismatches(
  expected: ReadonlyMap<string, number>,
  actual: ReadonlyMap<string, number>,
  tolerance = 0.000001
): PriceMismatch[] {
  const mismatches: PriceMismatch[] = [];
  for (const [region, expectedPrice] of expected) {
    const actualPrice = actual.get(region);
    if (
      actualPrice === undefined ||
      !Number.isFinite(actualPrice) ||
      Math.abs(actualPrice - expectedPrice) > tolerance
    ) {
      mismatches.push({
        region,
        expected: expectedPrice,
        actual: actualPrice ?? null,
      });
    }
  }
  return mismatches;
}

export function findPricePointMismatches(
  expected: ReadonlyMap<string, string>,
  actual: ReadonlyMap<string, string>
): PricePointMismatch[] {
  const mismatches: PricePointMismatch[] = [];
  for (const [territoryId, expectedPricePointId] of expected) {
    const actualPricePointId = actual.get(territoryId);
    if (actualPricePointId !== expectedPricePointId) {
      mismatches.push({
        territoryId,
        expectedPricePointId,
        actualPricePointId: actualPricePointId ?? null,
      });
    }
  }
  return mismatches;
}

/** Allow store propagation a short window before declaring verification unknown. */
export async function verifyPricePointsWithRetry(
  expected: ReadonlyMap<string, string>,
  readActual: () => Promise<ReadonlyMap<string, string> | null>,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<PricePointMismatch[]> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delayMs = Math.max(0, options.delayMs ?? 750);
  let last: PricePointMismatch[] = [...expected].map(([territoryId, expectedPricePointId]) => ({
    territoryId,
    expectedPricePointId,
    actualPricePointId: null,
  }));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const actual = await readActual();
    if (actual) {
      last = findPricePointMismatches(expected, actual);
      if (last.length === 0) return [];
    }
    if (attempt < attempts - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return last;
}
