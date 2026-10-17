import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("declares Node types explicitly for the supported build runtime", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const tooling = JSON.parse(readFileSync("tsconfig.node.json", "utf8"));
  expect(manifest.devDependencies["@types/node"]).toBeTruthy();
  expect(tooling.compilerOptions.types).toContain("node");
  const runtimeMajor = manifest.engines.node.match(/>=([0-9]+)/)?.[1];
  expect(runtimeMajor).toBeTruthy();
  expect(lock.packages["node_modules/@types/node"].version.split(".")[0]).toBe(runtimeMajor);
});

it("keeps JavaScript and Rust Tauri packages on matching major/minor versions", () => {
  const npm = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const cargo = readFileSync("src-tauri/Cargo.lock", "utf8");
  for (const [crate, packageName] of [
    ["tauri", "@tauri-apps/api"],
    ["tauri-plugin-dialog", "@tauri-apps/plugin-dialog"],
    ["tauri-plugin-fs", "@tauri-apps/plugin-fs"],
    ["tauri-plugin-opener", "@tauri-apps/plugin-opener"]
  ]) {
    const rustVersion = cargo.match(new RegExp(`name = "${crate}"\\r?\\nversion = "([^"]+)"`))?.[1];
    const jsVersion = npm.packages[`node_modules/${packageName}`]?.version;
    expect(rustVersion, `${crate} must be present in Cargo.lock`).toBeTruthy();
    expect(jsVersion, `${packageName} must be present in package-lock.json`).toBeTruthy();
    expect(jsVersion.split(".").slice(0, 2).join("."), `Update ${packageName} and ${crate} together`).toBe(rustVersion!.split(".").slice(0, 2).join("."));
  }
});
