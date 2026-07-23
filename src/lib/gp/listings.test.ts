import { describe, expect, it } from "vitest";
import {
  changedListingFields,
  findListingMismatches,
  validateListingFields,
} from "./listings";

const listing = {
  language: "en-US",
  title: "StoreOps",
  shortDescription: "Safe store operations",
  fullDescription: "Preview, apply, verify.",
  video: "",
};

describe("Google Play listings", () => {
  it("keeps only fields that differ from Google", () => {
    expect(changedListingFields(listing, {
      title: "StoreOps",
      shortDescription: "Safer store operations",
    })).toEqual({ shortDescription: "Safer store operations" });
  });

  it("enforces Google's text limits", () => {
    expect(validateListingFields({ title: "x".repeat(31), shortDescription: "x".repeat(81) })).toEqual([
      "App title is 31/30 characters.",
      "Short description is 81/80 characters.",
    ]);
  });

  it("detects a post-commit mismatch", () => {
    expect(findListingMismatches([listing], [{ ...listing, title: "Old title" }])).toEqual([
      "en-US: App title did not match after commit",
    ]);
  });
});
