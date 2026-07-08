/** Minimal App Store Connect API types for the MVP surface. */

export interface AscResource<A> {
  type: string;
  id: string;
  attributes: A;
  relationships?: Record<
    string,
    { data?: { type: string; id: string } | Array<{ type: string; id: string }> }
  >;
}

// ---- Apps ----
export interface AppAttributes {
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
}
export type App = AscResource<AppAttributes>;

// ---- App Store Versions ----
export interface AppStoreVersionAttributes {
  platform: string;
  versionString: string;
  appStoreState:
    | "PREPARE_FOR_SUBMISSION"
    | "READY_FOR_SALE"
    | "WAITING_FOR_REVIEW"
    | "IN_REVIEW"
    | "REJECTED"
    | "DEVELOPER_REJECTED"
    | "PENDING_DEVELOPER_RELEASE"
    | string;
  createdDate: string;
}
export type AppStoreVersion = AscResource<AppStoreVersionAttributes>;

// ---- Version Localizations (per-version, editable in PREPARE_FOR_SUBMISSION) ----
export interface VersionLocalizationAttributes {
  locale: string;
  description: string | null;
  keywords: string | null;
  promotionalText: string | null;
  whatsNew: string | null;
  marketingUrl: string | null;
  supportUrl: string | null;
}
export type VersionLocalization = AscResource<VersionLocalizationAttributes>;

// ---- App Info Localizations (name/subtitle, editable pre-submission) ----
export interface AppInfoLocalizationAttributes {
  locale: string;
  name: string | null;
  subtitle: string | null;
  privacyPolicyUrl: string | null;
}
export type AppInfoLocalization = AscResource<AppInfoLocalizationAttributes>;

// Editable field definitions used by the bulk editor UI
export const VERSION_FIELDS = [
  { key: "description", label: "Description", maxLen: 4000, multiline: true },
  { key: "keywords", label: "Keywords", maxLen: 100, multiline: false },
  { key: "promotionalText", label: "Promo Text", maxLen: 170, multiline: true },
  { key: "whatsNew", label: "What's New", maxLen: 4000, multiline: true },
] as const;

export const APP_INFO_FIELDS = [
  { key: "name", label: "Name", maxLen: 30, multiline: false },
  { key: "subtitle", label: "Subtitle", maxLen: 30, multiline: false },
] as const;

export type VersionFieldKey = (typeof VERSION_FIELDS)[number]["key"];
export type AppInfoFieldKey = (typeof APP_INFO_FIELDS)[number]["key"];
