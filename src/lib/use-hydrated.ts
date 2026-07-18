"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Hydration-safe browser readiness without a setState-on-mount effect. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
