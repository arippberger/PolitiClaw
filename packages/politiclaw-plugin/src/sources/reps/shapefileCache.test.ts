import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import { CacheNotPrimedError, loadShapefileCache, primeShapefileCache } from "./shapefileCache.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixtureText(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

type FakeResponse = {
  ok: boolean;
  status: number;
  body: string | ArrayBuffer;
};

function fakeFetchFactory(
  responses: Record<string, FakeResponse>,
): typeof fetch {
  const fn = async (input: URL | string) => {
    const key = String(input);
    const item = responses[key];
    if (!item) throw new Error(`unexpected url ${key}`);
    return {
      ok: item.ok,
      status: item.status,
      async text() {
        if (typeof item.body !== "string") {
          throw new Error("response body is binary, not text");
        }
        return item.body;
      },
      async arrayBuffer() {
        if (typeof item.body === "string") {
          throw new Error("response body is text, not binary");
        }
        return item.body;
      },
    } as unknown as Response;
  };
  return fn as unknown as typeof fetch;
}

function buildMinimalPointShp(lon: number, lat: number): Buffer {
  // 100-byte header + 8-byte record header + 20-byte point record.
  const buf = Buffer.alloc(128);
  buf.writeInt32BE(9994, 0); // file code
  buf.writeInt32BE(64, 24); // file length in 16-bit words (128 bytes = 64 words)
  buf.writeInt32LE(1000, 28); // version
  buf.writeInt32LE(1, 32); // shape type: Point
  buf.writeDoubleLE(lon, 36); // xmin
  buf.writeDoubleLE(lat, 44); // ymin
  buf.writeDoubleLE(lon, 52); // xmax
  buf.writeDoubleLE(lat, 60); // ymax
  // Zmin/Zmax/Mmin/Mmax (68..99) left zero.
  // Record header
  buf.writeInt32BE(1, 100); // record number
  buf.writeInt32BE(10, 104); // content length in 16-bit words (20 bytes = 10 words)
  // Record content
  buf.writeInt32LE(1, 108); // shape type: Point
  buf.writeDoubleLE(lon, 112);
  buf.writeDoubleLE(lat, 120);
  return buf;
}

function buildMinimalDbf(name: string): Buffer {
  const field = "NAME";
  const fieldLength = 10;
  const headerLength = 32 + 32 + 1; // main header + 1 field descriptor + terminator
  const recordLength = 1 + fieldLength; // deletion flag + value
  const buf = Buffer.alloc(headerLength + recordLength);
  buf.writeUInt8(0x03, 0); // dBase III
  // date yy mm dd (arbitrary)
  buf.writeUInt8(125, 1);
  buf.writeUInt8(1, 2);
  buf.writeUInt8(1, 3);
  buf.writeUInt32LE(1, 4); // 1 record
  buf.writeUInt16LE(headerLength, 8);
  buf.writeUInt16LE(recordLength, 10);
  // Field descriptor at offset 32: name (11 bytes, null-padded), type, ...
  buf.write(field, 32, "ascii");
  buf.writeUInt8("C".charCodeAt(0), 32 + 11);
  buf.writeUInt8(fieldLength, 32 + 16);
  // Terminator 0x0D right before the first record.
  buf.writeUInt8(0x0d, 32 + 32);
  // Record: deletion flag (space) + padded value
  buf.writeUInt8(0x20, headerLength);
  const value = name.padEnd(fieldLength, " ").slice(0, fieldLength);
  buf.write(value, headerLength + 1, "ascii");
  return buf;
}

async function buildTigerStyleZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("tl_2024_us_cd119.shp", buildMinimalPointShp(-122.4, 37.8));
  zip.file("tl_2024_us_cd119.dbf", buildMinimalDbf("CA-12"));
  const uint8 = await zip.generateAsync({ type: "uint8array" });
  // Copy into a fresh ArrayBuffer so the backing store is exactly the zip bytes.
  const copy = new ArrayBuffer(uint8.byteLength);
  new Uint8Array(copy).set(uint8);
  return copy;
}

describe("shapefile cache", () => {
  it("primes cache and loads parsed content", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const districtsUrl = "https://example.test/districts.geojson";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const fetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: fixtureText("districts_subset.geojson") },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    const result = await primeShapefileCache({ cacheDir, fetcher, districtsUrl, legislatorsUrl });
    expect(result.status).toBe("primed");

    const loaded = loadShapefileCache(cacheDir);
    expect(loaded.polygons.features).toHaveLength(2);
    expect(loaded.legislators.length).toBeGreaterThan(0);
  });

  it("is idempotent when cache already exists", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const districtsUrl = "https://example.test/districts.geojson";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const fetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: fixtureText("districts_subset.geojson") },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    await primeShapefileCache({ cacheDir, fetcher, districtsUrl, legislatorsUrl });
    const second = await primeShapefileCache({ cacheDir, fetcher, districtsUrl, legislatorsUrl });
    expect(second.status).toBe("already_fresh");
  });

  it("keeps existing cache if force refresh fails partway", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const districtsUrl = "https://example.test/districts.geojson";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const initialFetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: fixtureText("districts_subset.geojson") },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    await primeShapefileCache({ cacheDir, fetcher: initialFetcher, districtsUrl, legislatorsUrl });
    const before = loadShapefileCache(cacheDir);

    const failingFetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: fixtureText("districts_subset.geojson") },
      [legislatorsUrl]: { ok: false, status: 503, body: "" },
    });
    await expect(
      primeShapefileCache({
        cacheDir,
        force: true,
        fetcher: failingFetcher,
        districtsUrl,
        legislatorsUrl,
      }),
    ).rejects.toThrow("503");

    const after = loadShapefileCache(cacheDir);
    expect(after.manifest.downloadedAt).toBe(before.manifest.downloadedAt);
  });

  it("throws a typed error when cache is missing", () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    expect(() => loadShapefileCache(cacheDir)).toThrow(CacheNotPrimedError);
  });

  it("extracts and parses districts when the URL points at a TIGER-style zip", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const districtsUrl = "https://example.test/tl_2024_us_cd119.zip";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const zipBuffer = await buildTigerStyleZip();
    const fetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: zipBuffer },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    const result = await primeShapefileCache({
      cacheDir,
      fetcher,
      districtsUrl,
      legislatorsUrl,
    });
    expect(result.status).toBe("primed");

    const loaded = loadShapefileCache(cacheDir);
    expect(loaded.polygons.features).toHaveLength(1);
    const first = loaded.polygons.features[0];
    expect(first?.geometry.type).toBe("Point");
  });

  it("merges districts from multiple TIGER state zips", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const californiaUrl = "https://example.test/tl_2025_06_cd119.zip";
    const texasUrl = "https://example.test/tl_2025_48_cd119.zip";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const californiaZip = await buildTigerStyleZip();
    const texasZip = await buildTigerStyleZip();
    const fetcher = fakeFetchFactory({
      [californiaUrl]: { ok: true, status: 200, body: californiaZip },
      [texasUrl]: { ok: true, status: 200, body: texasZip },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    const result = await primeShapefileCache({
      cacheDir,
      fetcher,
      districtsUrls: [californiaUrl, texasUrl],
      legislatorsUrl,
      congress: 119,
      tigerYear: 2025,
    });
    expect(result.status).toBe("primed");

    const loaded = loadShapefileCache(cacheDir);
    expect(loaded.polygons.features).toHaveLength(2);
    expect(loaded.manifest.tigerYear).toBe(2025);
  });

  it("raises a clear error when the zip has no .shp entry", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const districtsUrl = "https://example.test/empty.zip";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const zip = new JSZip();
    zip.file("readme.txt", "nothing to see here");
    const uint8 = await zip.generateAsync({ type: "uint8array" });
    const zipBuffer = new ArrayBuffer(uint8.byteLength);
    new Uint8Array(zipBuffer).set(uint8);
    const fetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: zipBuffer },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    await expect(
      primeShapefileCache({ cacheDir, fetcher, districtsUrl, legislatorsUrl }),
    ).rejects.toThrow(/tiger zip missing \.shp entry/);
  });
});
