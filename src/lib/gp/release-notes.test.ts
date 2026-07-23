import { describe, expect, it } from "vitest";
import {
  formatPlayConsoleReleaseNotes,
  releaseNoteErrors,
} from "./release-notes";

describe("Google Play release notes", () => {
  it("formats localized notes for Play Console", () => {
    expect(formatPlayConsoleReleaseNotes({
      "fr-FR": "Corrections de bugs.",
      "en-US": "Faster snapshots.",
      "de-DE": "  ",
    })).toBe(
      "<en-US>\nFaster snapshots.\n</en-US>\n\n<fr-FR>\nCorrections de bugs.\n</fr-FR>",
    );
  });

  it("enforces the 500-character per-language limit", () => {
    expect(releaseNoteErrors({ "en-US": "x".repeat(501) })).toEqual([
      "en-US: 501/500 characters.",
    ]);
  });
});
