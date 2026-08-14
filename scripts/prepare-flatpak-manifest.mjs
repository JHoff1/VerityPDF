import { readFile, writeFile } from "node:fs/promises";

const [, , tag] = process.argv;

if (!tag) {
  throw new Error("Usage: node scripts/prepare-flatpak-manifest.mjs <release-tag>");
}

const manifestPath = new URL("../flatpak/com.veritypdf.VerityPDF.json", import.meta.url);
const npmSourcesPath = new URL("../flatpak/npm-sources.json", import.meta.url);
const cargoSourcesPath = new URL("../flatpak/cargo-sources.json", import.meta.url);
const outputPath = new URL("../flatpak/release-manifest.json", import.meta.url);

const [manifest, npmSources, cargoSources] = await Promise.all([
  readFile(manifestPath, "utf8").then(JSON.parse),
  readFile(npmSourcesPath, "utf8").then(JSON.parse),
  readFile(cargoSourcesPath, "utf8").then(JSON.parse),
]);

const module = manifest.modules.find((entry) => entry.name === "veritypdf");
if (!module) {
  throw new Error("The VerityPDF Flatpak module is missing.");
}

const gitSource = module.sources.find((entry) => entry.type === "git");
if (!gitSource) {
  throw new Error("The VerityPDF Flatpak git source is missing.");
}

gitSource.tag = tag;
module.sources = module.sources.filter(
  (entry) => entry.path !== "npm-sources.json" && entry.path !== "cargo-sources.json",
);
module.sources.push(...npmSources, ...cargoSources);

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
