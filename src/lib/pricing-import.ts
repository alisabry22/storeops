/**
 * CSV price-sheet parsing and price-point snapping.
 * The sheet contract is intentionally strict. Pricing is a financial write:
 * accepting the "first number" from arbitrary AI output can set the wrong
 * column (for example a USD equivalent instead of the local price).
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

  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { rows: [], warnings: ["Empty price sheet."] };
  const header = lines[0].split(/[,;\t]/).map((p) => p.trim().toLowerCase());
  const territoryColumn = header.findIndex((v) => v === "territory" || v === "region");
  const priceColumn = header.findIndex((v) => v === "price" || v === "customer_price");
  const currencyColumn = header.findIndex((v) => v === "currency");
  if (territoryColumn < 0 || priceColumn < 0) {
    return {
      rows: [],
      warnings: ["Header must include territory and price columns (recommended: territory,currency,price)."],
    };
  }
  if (territoryColumn !== 0) {
    return { rows: [], warnings: ["territory must be the first column."] };
  }
  if (currencyColumn < 0) warnings.push("No currency column supplied. StoreOps will validate territory price points, but cannot verify your intended currency.");
  lines.slice(1).forEach((raw, index) => {
    const i = index + 1;
    const line = raw.trim();
    if (!line) return;
    const parts = line
      .split(/[,;\t]/)
      .map((p) => p.trim().replace(/^"|"$/g, ""));

    const territory = (parts[0] ?? "").toUpperCase();

    if (!codeRe.test(territory)) {
      warnings.push(
        `Line ${i + 1}: "${parts[0]}" is not a ${codeLength}-letter region code (like ${example}) — skipped`
      );
      return;
    }

    const rawPrice = parts[priceColumn] ?? "";
    const price = Number(rawPrice.replace(/[^0-9.\-]/g, ""));

    if (!Number.isFinite(price) || price <= 0) {
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
