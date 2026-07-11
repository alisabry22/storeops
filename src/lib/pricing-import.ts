/**
 * CSV price-sheet parsing and price-point snapping.
 * The sheet contract is deliberately loose — AI tools generate CSVs with
 * varying columns. We take: first column = 3-letter territory code,
 * first numeric column after it = price in that territory's local currency.
 */

export interface SheetRow {
  territoryId: string;
  price: number;
}

export interface ParsedSheet {
  rows: SheetRow[];
  warnings: string[];
}

export function parsePriceSheet(
  text: string,
  options: { codeLength?: 2 | 3 } = {}
): ParsedSheet {
  const codeLength = options.codeLength ?? 3;
  const codeRe = codeLength === 2 ? /^[A-Z]{2}$/ : /^[A-Z]{3}$/;
  const example = codeLength === 2 ? "US, EG, DE" : "USA, EGY, DEU";
  const warnings: string[] = [];
  const seen = new Map<string, number>();

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line
      .split(/[,;\t]/)
      .map((p) => p.trim().replace(/^"|"$/g, ""));

    const territory = (parts[0] ?? "").toUpperCase();

    // Header row: first cell isn't a region code → skip silently on line 1
    if (!codeRe.test(territory)) {
      if (i > 0) {
        warnings.push(
          `Line ${i + 1}: "${parts[0]}" is not a ${codeLength}-letter region code (like ${example}) — skipped`
        );
      }
      return;
    }

    let price: number | null = null;
    for (let j = 1; j < parts.length; j++) {
      if (!parts[j]) continue;
      const n = Number(parts[j].replace(/[^0-9.\-]/g, ""));
      if (!isNaN(n) && parts[j].match(/\d/)) {
        price = n;
        break;
      }
    }

    if (price === null || price < 0) {
      warnings.push(`Line ${i + 1}: ${territory} has no valid price — skipped`);
      return;
    }

    if (seen.has(territory)) {
      warnings.push(`Line ${i + 1}: duplicate ${territory} — last value wins`);
    }
    seen.set(territory, price);
  });

  return {
    rows: [...seen.entries()].map(([territoryId, price]) => ({
      territoryId,
      price,
    })),
    warnings,
  };
}

/** Nearest valid Apple price point to the requested price (ties → cheaper). */
export function snapToPricePoint<T extends { id: string; attributes: { customerPrice: string } }>(
  points: T[],
  target: number
): T | null {
  let best: T | null = null;
  let bestDiff = Infinity;
  for (const p of points) {
    const v = Number(p.attributes.customerPrice);
    const diff = Math.abs(v - target);
    if (
      diff < bestDiff ||
      (diff === bestDiff &&
        best !== null &&
        v < Number(best.attributes.customerPrice))
    ) {
      best = p;
      bestDiff = diff;
    }
  }
  return best;
}

export function buildCsv(
  rows: Array<{ territoryId: string; currency: string; customerPrice: string }>
): string {
  const header = "territory,currency,price";
  const body = rows
    .map((r) => `${r.territoryId},${r.currency},${r.customerPrice}`)
    .join("\n");
  return `${header}\n${body}`;
}

export function buildAiPrompt(csv: string): string {
  return `I'm pricing my iOS app across App Store territories. Below are my current prices as CSV (territory = ISO 3166-1 alpha-3 code, price = local currency).

Adjust the prices for local purchasing power (PPP) so the app is fairly priced in every market — e.g. cheaper in emerging markets, standard in US/EU. Keep psychological pricing (x.99 or local equivalent).

Reply ONLY with a CSV in the exact same format (territory,currency,price). Include every territory you want changed; omitted territories keep their current price.

${csv}`;
}
