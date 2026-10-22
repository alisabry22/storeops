import { describe, expect, it } from "vitest";
import {
  editionFromEnvironment,
  isDevelopmentEnvironment,
  isCloudEdition,
  isCommunityEdition,
} from "./edition";

describe("StoreOps edition selection", () => {
  it("requires an explicit community value", () => {
    expect(editionFromEnvironment("community")).toBe("community");
    expect(editionFromEnvironment("cloud")).toBe("cloud");
    expect(editionFromEnvironment(undefined)).toBe("cloud");
    expect(editionFromEnvironment("true")).toBe("cloud");
  });

  it("keeps the default build on the paid Cloud edition", () => {
    expect(isCloudEdition).toBe(true);
    expect(isCommunityEdition).toBe(false);
  });

  it("enables the subscription bypass only in development", () => {
    expect(isDevelopmentEnvironment("development")).toBe(true);
    expect(isDevelopmentEnvironment("production")).toBe(false);
    expect(isDevelopmentEnvironment("test")).toBe(false);
    expect(isDevelopmentEnvironment(undefined)).toBe(false);
  });
});
