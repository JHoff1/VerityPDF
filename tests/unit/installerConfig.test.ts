import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("pins the installer publisher and runs legacy migration before the reinstall page", () => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  expect(config.bundle.publisher).toBe("veritypdf");
  expect(config.bundle.windows.nsis.installMode).toBe("currentUser");
  expect(config.bundle.windows.nsis.installerHooks).toBe("installer/upgrade-hooks.nsh");
  const hook = readFileSync("src-tauri/installer/upgrade-hooks.nsh", "utf8");
  expect(hook).toContain("MUI_CUSTOMFUNCTION_GUIINIT VerityRestoreUpgradePath");
  expect(hook).toContain("Software\\sovereignpdf\\VerityPDF");
  expect(hook).toContain("Software\\veritypdf\\VerityPDF");
});
