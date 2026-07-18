import { afterEach, describe, expect, it, vi } from "vitest";

function installBrowserStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() {
      return values.size;
    },
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal(
    "CustomEvent",
    class TestCustomEvent {
      constructor(
        public type: string,
        public init?: { detail?: unknown }
      ) {}
    }
  );
  return storage;
}

const snapshotInput = {
  appId: "app_123",
  scope: "app-pricing",
  label: "Before price change",
  rows: [
    {
      territoryId: "USA",
      pricePointId: "point_1",
      customerPrice: "4.99",
      currency: "USD",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("required pricing snapshots", () => {
  it("keeps the local restore point but blocks the store write when cloud confirmation fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_storeops");
    const storage = installBrowserStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue({ error: "Sync unavailable" }),
      })
    );
    const { takeRequiredSnapshot } = await import("./snapshots");

    await expect(takeRequiredSnapshot(snapshotInput)).rejects.toThrow(
      /No store write was started/
    );
    const saved = JSON.parse(
      storage.getItem("storeops.snapshots.v1") ?? "[]"
    ) as Array<{ label: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0].label).toBe(snapshotInput.label);
  });

  it("continues after both the browser and account copies are confirmed", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_storeops");
    installBrowserStorage();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { takeRequiredSnapshot } = await import("./snapshots");

    const snapshot = await takeRequiredSnapshot(snapshotInput);

    expect(snapshot.schemaVersion).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects an empty imported restore point", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    installBrowserStorage();
    const { importSnapshot } = await import("./snapshots");

    expect(() =>
      importSnapshot(
        JSON.stringify({
          ...snapshotInput,
          id: "snap_exported",
          createdAt: new Date().toISOString(),
          rows: [],
        }),
        { appId: snapshotInput.appId, scope: snapshotInput.scope }
      )
    ).toThrow(/missing required pricing data/);
  });
});
