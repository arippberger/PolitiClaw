import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import JSZip from "jszip";
// @ts-expect-error shapefile has no bundled types
import * as shapefile from "shapefile";
import { parseLegislators, type NormalizedLegislator } from "./legislators.js";

type Fetcher = typeof fetch;

export type CacheManifest = {
  congress: number;
  tigerYear: number;
  downloadedAt: string;
  cdSha256: string;
  legislatorsSha256: string;
};

export type LoadedShapefileCache = {
  polygons: GeoJSON.FeatureCollection;
  legislators: NormalizedLegislator[];
  manifest: CacheManifest;
};

export type PrimeResult =
  | { status: "primed"; manifest: CacheManifest }
  | { status: "already_fresh"; manifest: CacheManifest };

export type PrimeCacheOptions = {
  cacheDir: string;
  force?: boolean;
  fetcher?: Fetcher;
  logger?: { info: (message: string) => void };
  districtsUrl?: string;
  legislatorsUrl?: string;
  congress?: number;
  tigerYear?: number;
};

export class CacheNotPrimedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CacheNotPrimedError";
  }
}

const DEFAULT_CONGRESS = 119;
const DEFAULT_TIGER_YEAR = 2024;
const DEFAULT_DISTRICTS_URL =
  "https://www2.census.gov/geo/tiger/TIGER2024/CD/tl_2024_us_cd119.zip";
const DEFAULT_LEGISLATORS_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml";

export async function primeShapefileCache(opts: PrimeCacheOptions): Promise<PrimeResult> {
  const fetcher = opts.fetcher ?? fetch;
  const paths = cachePaths(opts.cacheDir);

  if (!opts.force && existsSync(paths.manifest) && existsSync(paths.districts) && existsSync(paths.legislators)) {
    return { status: "already_fresh", manifest: readManifest(paths.manifest) };
  }

  const districtsUrl = opts.districtsUrl ?? DEFAULT_DISTRICTS_URL;
  const legislatorsUrl = opts.legislatorsUrl ?? DEFAULT_LEGISLATORS_URL;
  const logger = opts.logger;

  mkdirSync(opts.cacheDir, { recursive: true });
  const tempDir = join(opts.cacheDir, `.tmp-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    logger?.info("Downloading congressional district boundaries...");
    const districtsGeoJsonString = await fetchDistrictsAsGeoJson(
      fetcher,
      districtsUrl,
    );

    logger?.info("Downloading federal legislator roster...");
    const legislatorsPayload = await fetchTextOrThrow(fetcher, legislatorsUrl);

    // Persist to temp first, then atomically replace target files.
    const tempDistricts = join(tempDir, "districts.geojson");
    const tempLegislators = join(tempDir, "legislators-current.yaml");
    writeFileSync(tempDistricts, districtsGeoJsonString, "utf8");
    writeFileSync(tempLegislators, legislatorsPayload, "utf8");

    const manifest: CacheManifest = {
      congress: opts.congress ?? DEFAULT_CONGRESS,
      tigerYear: opts.tigerYear ?? DEFAULT_TIGER_YEAR,
      downloadedAt: new Date().toISOString(),
      cdSha256: sha256(districtsGeoJsonString),
      legislatorsSha256: sha256(legislatorsPayload),
    };
    const tempManifest = join(tempDir, "manifest.json");
    writeFileSync(tempManifest, JSON.stringify(manifest, null, 2), "utf8");

    mkdirSync(dirname(paths.districts), { recursive: true });
    copyFileSync(tempDistricts, paths.districts);
    copyFileSync(tempLegislators, paths.legislators);
    renameSync(tempManifest, paths.manifest);

    return { status: "primed", manifest };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function loadShapefileCache(cacheDir: string): LoadedShapefileCache {
  const paths = cachePaths(cacheDir);
  if (!existsSync(paths.manifest) || !existsSync(paths.districts) || !existsSync(paths.legislators)) {
    throw new CacheNotPrimedError("shapefile cache not primed");
  }
  const polygons = JSON.parse(readFileSync(paths.districts, "utf8")) as GeoJSON.FeatureCollection;
  const legislatorsYaml = readFileSync(paths.legislators, "utf8");
  const legislators = parseLegislators(legislatorsYaml);
  return {
    polygons,
    legislators,
    manifest: readManifest(paths.manifest),
  };
}

function cachePaths(cacheDir: string): {
  districts: string;
  legislators: string;
  manifest: string;
} {
  return {
    districts: join(cacheDir, "districts.geojson"),
    legislators: join(cacheDir, "legislators-current.yaml"),
    manifest: join(cacheDir, "manifest.json"),
  };
}

function readManifest(path: string): CacheManifest {
  return JSON.parse(readFileSync(path, "utf8")) as CacheManifest;
}

async function fetchTextOrThrow(fetcher: Fetcher, url: string): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`http ${response.status} for ${url}`);
  }
  return response.text();
}

async function fetchArrayBufferOrThrow(
  fetcher: Fetcher,
  url: string,
): Promise<ArrayBuffer> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`http ${response.status} for ${url}`);
  }
  return response.arrayBuffer();
}

/**
 * Districts can be served two ways:
 *   1. Plain GeoJSON text (e.g. a pre-converted mirror, or the fixtures used
 *      in tests) — read as text and validated.
 *   2. Census TIGER zip bundle of `.shp`/`.dbf` files — unzipped, converted
 *      to GeoJSON via the `shapefile` parser, then serialized.
 *
 * We branch on the URL extension because that is cheap and unambiguous for
 * the sources we care about. Serving is done by consumers that read the
 * persisted GeoJSON, so both paths emit the same on-disk format.
 */
async function fetchDistrictsAsGeoJson(
  fetcher: Fetcher,
  url: string,
): Promise<string> {
  if (isZipUrl(url)) {
    const zipBuffer = await fetchArrayBufferOrThrow(fetcher, url);
    const collection = await geoJsonFromTigerZip(zipBuffer);
    return JSON.stringify(collection);
  }
  const text = await fetchTextOrThrow(fetcher, url);
  // Validate early so a malformed payload fails prime instead of load.
  JSON.parse(text);
  return text;
}

function isZipUrl(url: string): boolean {
  const withoutQuery = url.split("?")[0] ?? url;
  return withoutQuery.toLowerCase().endsWith(".zip");
}

async function geoJsonFromTigerZip(
  zipBuffer: ArrayBuffer,
): Promise<GeoJSON.FeatureCollection> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const shpEntry = findFirstByExtension(zip, ".shp");
  const dbfEntry = findFirstByExtension(zip, ".dbf");
  if (!shpEntry) {
    throw new Error("tiger zip missing .shp entry");
  }
  const shp = await shpEntry.async("uint8array");
  const dbf = dbfEntry ? await dbfEntry.async("uint8array") : undefined;
  const collection = (await shapefile.read(
    shp,
    dbf,
  )) as GeoJSON.FeatureCollection;
  if (!collection || !Array.isArray(collection.features)) {
    throw new Error("shapefile parser returned no features");
  }
  return collection;
}

function findFirstByExtension(
  zip: JSZip,
  extension: string,
): JSZip.JSZipObject | null {
  const lower = extension.toLowerCase();
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    if (name.toLowerCase().endsWith(lower)) return entry;
  }
  return null;
}

function sha256(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}
