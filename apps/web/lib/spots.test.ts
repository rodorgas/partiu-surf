import { describe, expect, it } from "vitest";
import { DEFAULT_SPOT_SLUG, getSpot, SPOTS, SPOT_SLUGS } from "./spots";

describe("spots config", () => {
  it("every spot has matching slug as its key", () => {
    for (const [key, spot] of Object.entries(SPOTS)) {
      expect(spot.slug).toBe(key);
    }
  });

  it("default spot resolves", () => {
    expect(getSpot(DEFAULT_SPOT_SLUG)).not.toBeNull();
  });

  it("returns null for unknown spot", () => {
    expect(getSpot("nope")).toBeNull();
  });

  it("SPOT_SLUGS covers every entry in SPOTS", () => {
    expect(SPOT_SLUGS.sort()).toEqual(Object.keys(SPOTS).sort());
  });

  it("coordinates fall in plausible Brazilian latitude/longitude ranges", () => {
    // Brazil coast roughly spans lat -34..-2, lon -55..-28
    // (Fernando de Noronha at -32.4 lon is the eastmost surf zone).
    for (const spot of Object.values(SPOTS)) {
      expect(spot.lat).toBeGreaterThan(-34);
      expect(spot.lat).toBeLessThan(0);
      expect(spot.lon).toBeGreaterThan(-55);
      expect(spot.lon).toBeLessThan(-28);
    }
  });
});
