import { describe, expect, it } from "vitest";
import { isNonMutatingGoogleOperation } from "./google-proxy-policy";

describe("Google Play proxy policy", () => {
  const root = "androidpublisher/v3/applications/com.example.app";

  it("allows reads and creation of an empty temporary edit", () => {
    expect(isNonMutatingGoogleOperation("GET", `${root}/edits/123/listings`)).toBe(true);
    expect(isNonMutatingGoogleOperation("POST", `${root}/edits`)).toBe(true);
  });

  it("does not classify listing writes, validation, or commit as non-mutating", () => {
    expect(isNonMutatingGoogleOperation("PUT", `${root}/edits/123/listings/en-US`)).toBe(false);
    expect(isNonMutatingGoogleOperation("POST", `${root}/edits/123:validate`)).toBe(false);
    expect(isNonMutatingGoogleOperation("POST", `${root}/edits/123:commit`)).toBe(false);
  });

  it("does not allow broad edit deletion patterns", () => {
    expect(isNonMutatingGoogleOperation("DELETE", `${root}/edits/123`)).toBe(false);
    expect(isNonMutatingGoogleOperation("DELETE", `${root}/edits/123/listings/en-US`)).toBe(false);
    expect(isNonMutatingGoogleOperation("DELETE", `${root}/edits`)).toBe(false);
  });
});
