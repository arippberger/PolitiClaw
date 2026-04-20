import { describe, expect, it } from "vitest";
import { findContainingDistrict } from "./pointInPolygon.js";

const districts: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { STATEFP: "06", CD119FP: "11" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-123, 37],
            [-122, 37],
            [-122, 38],
            [-123, 38],
            [-123, 37],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { STATEFP: "06", CD119FP: "12" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122, 37],
            [-121, 37],
            [-121, 38],
            [-122, 38],
            [-122, 37],
          ],
        ],
      },
    },
  ],
};

describe("pointInPolygon district lookup", () => {
  it("finds the first district", () => {
    const district = findContainingDistrict({ lat: 37.5, lon: -122.5 }, districts);
    expect(district).toEqual({ state: "CA", district: "11" });
  });

  it("finds the second district", () => {
    const district = findContainingDistrict({ lat: 37.5, lon: -121.5 }, districts);
    expect(district).toEqual({ state: "CA", district: "12" });
  });

  it("returns null when outside all districts", () => {
    const district = findContainingDistrict({ lat: 39, lon: -122.5 }, districts);
    expect(district).toBeNull();
  });
});
