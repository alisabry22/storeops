import { describe, expect, it } from "vitest";
import {
  editionFromEnvironment,
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
});
