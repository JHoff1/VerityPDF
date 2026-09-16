import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

async function fixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 4; i++) pdf.addPage([240, 300]).drawText(`Original page ${i}`, { x: 20, y: 200, font, size: 16 });
  return Buffer.from(await pdf.save());
}
async function openFixture(page: Page) {
  await page.goto("/");
  await page.locator('input[accept="application/pdf,.pdf"]').first().setInputFiles({ name: "conversion.pdf", mimeType: "application/pdf", buffer: await fixture() });
  await expect(page.getByRole("checkbox", { name: "Select page 4", exact: true })).toBeEnabled();
}
async function bytes(download: Download) { return readFile((await download.path())!); }

test("browse without selection and deselect every page", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openFixture(page);
  const checked = page.locator('aside input[type="checkbox"]:checked');
  await expect(checked).toHaveCount(0);
  const selectionControls = page.getByRole("group", { name: "Page selection controls" });
  const selectBox = await selectionControls.getByRole("button", { name: "Select all", exact: true }).boundingBox();
  const deselectBox = await selectionControls.getByRole("button", { name: "Deselect all", exact: true }).boundingBox();
  expect(selectBox!.y).toBe(deselectBox!.y);
  expect(selectBox!.height).toBe(deselectBox!.height);
  expect(selectBox!.width).toBeCloseTo(deselectBox!.width, 0);
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(checked).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete 0 pages", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rotate 0 pages right", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Select page 2", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select page 2", exact: true }).uncheck();
  await expect(checked).toHaveCount(0);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(checked).toHaveCount(4);
  await page.getByRole("button", { name: "Deselect all", exact: true }).click();
  await expect(checked).toHaveCount(0);
  await page.getByRole("button", { name: "3", exact: true }).click({ modifiers: ["Control"] });
  await expect(checked).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(checked).toHaveCount(0);
  await page.keyboard.press("Delete");
  await expect(page.locator('aside input[type="checkbox"]')).toHaveCount(4);
});

test("delete keeps the visible survivor anchored and action Undo restores its position", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto("/");
  const pdf = await PDFDocument.create();
  for (let index = 1; index <= 8; index++) pdf.addPage([600, 900]).drawText(`Anchor page ${index}`);
  await page.locator('input[accept="application/pdf,.pdf"]').first().setInputFiles({ name: "anchors.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
  await expect(page.getByRole("checkbox", { name: "Select page 8", exact: true })).toBeEnabled();
  await page.getByRole("checkbox", { name: "Select page 1", exact: true }).check();
  await page.keyboard.press("Control+1");
  const workspace = page.locator("section > div.overflow-auto");
  await workspace.evaluate((element) => {
    const target = element.querySelector('[data-virtual-page="4"]')!;
    element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top + 125;
  });
  const originalTop = await page.locator('#page-4').evaluate((element) => element.getBoundingClientRect().top);
  const width = await page.locator('#page-4').evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("checkbox", { name: "Select page 3", exact: true }).check();
  await expect(page.getByRole("button", { name: "Delete 2 pages", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Rotate 2 pages right", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Delete 2 pages", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted 2 pages" })).toBeVisible();
  await expect.poll(() => page.locator('#page-2').evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(originalTop, 0);
  expect(await page.locator('#page-2').evaluate((element) => element.getBoundingClientRect().width)).toBe(width);
  await page.getByRole("button", { name: "Undo page action", exact: true }).click();
  await expect(page.locator('[data-virtual-page]')).toHaveCount(8);
  await expect.poll(() => page.locator('#page-4').evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(originalTop, 0);
  // Delete the visible page and retain the same reading offset on its successor.
  await page.getByRole("checkbox", { name: "Select page 4", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select page 2", exact: true }).uncheck();
  await page.getByRole("button", { name: "Delete 1 page", exact: true }).click();
  await expect(page.locator('[data-virtual-page]')).toHaveCount(7);
  await expect.poll(() => page.locator('#page-4').evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(originalTop, 0);
  await page.getByRole("checkbox", { name: "Select page 4", exact: true }).check();
  await page.getByRole("button", { name: "Rotate 1 page right", exact: true }).click();
  await expect.poll(() => page.locator('#page-4').evaluate((element) => element.getBoundingClientRect().width)).toBe(900);
  await expect.poll(() => page.locator('#page-4').evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(originalTop, 0);
  await expect(page.getByRole("button", { name: "Rotate 1 page right", exact: true })).toBeEnabled();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(() => page.locator('#page-3').evaluate((element) => element.getBoundingClientRect().width)).toBe(900);
  await expect.poll(() => page.locator('#page-3').evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(originalTop, 0);
  await expect(page.getByRole("button", { name: "Rotate 1 page right", exact: true })).toBeEnabled();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => page.locator('#page-4').evaluate((element) => element.getBoundingClientRect().width)).toBe(900);
  await expect.poll(() => page.locator('#page-4').evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(originalTop, 0);
});

test("page navigation and editing never scroll the top toolbar out of view", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 720 });
  await openFixture(page);
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select page 4", exact: true }).check();
  const workspace = page.locator("section > div.overflow-auto");
  await expect.poll(() => workspace.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  const checkHeader = async () => {
    await expect.poll(() => page.locator("header").evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
    await expect(page.getByRole("button", { name: "Open PDF", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => [document.documentElement.scrollTop, document.body.scrollTop, document.getElementById("root")!.scrollTop])).toEqual([0, 0, 0]);
  };
  await checkHeader();
  await page.getByRole("button", { name: /^Delete \d+ pages?$/, exact: true }).click();
  await expect(page.locator("aside input[type=checkbox]")).toHaveCount(3);
  await checkHeader();
  await page.getByRole("checkbox", { name: "Select page 3", exact: true }).check();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator("aside input[type=checkbox]")).toHaveCount(4);
  await checkHeader();
  await page.getByRole("button", { name: /^Rotate \d+ pages? right$/, exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Select page 4", exact: true })).toBeEnabled();
  await checkHeader();
  await page.locator(".editor-toolbar").getByRole("button", { name: "Undo", exact: true }).click();
  await checkHeader();
});

test("checkbox batch deletion keeps surviving canvas nodes and supports undo/redo", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openFixture(page);
  await page.keyboard.press("Control+1");
  const canvas = page.locator('[data-page-mounted="1"] > canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element) => element.setAttribute("data-survivor", "yes"));
  await page.locator('[data-page-mounted="3"] > canvas').evaluate((element) => element.setAttribute("data-renumbered-survivor", "yes"));
  // Keep page one and remove two non-adjacent pages without modifier keys.
  await page.getByRole("checkbox", { name: "Select page 2", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select page 4", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select page 1", exact: true }).uncheck();
  await expect(page.getByRole("contentinfo")).toContainText("2 pages selected");
  await page.getByRole("button", { name: /^Delete \d+ pages?$/, exact: true }).click();
  await expect(page.locator("aside input[type=checkbox]")).toHaveCount(2);
  await expect(canvas).toHaveAttribute("data-survivor", "yes");
  await expect(page.locator('[data-page-mounted="2"] > canvas')).toHaveAttribute("data-renumbered-survivor", "yes");
  await page.locator(".editor-toolbar").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("aside input[type=checkbox]")).toHaveCount(4);
  await expect(canvas).toHaveAttribute("data-survivor", "yes");
  await expect(page.locator('[data-page-mounted="3"] > canvas')).toHaveAttribute("data-renumbered-survivor", "yes");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator("aside input[type=checkbox]")).toHaveCount(2);
  await expect(canvas).toHaveAttribute("data-survivor", "yes");
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Delete \d+ pages?$/, exact: true })).toBeDisabled();
  // A second deletion composes the original-page mapping (original page 3 remains).
  await page.getByRole("checkbox", { name: "Select page 2", exact: true }).uncheck();
  await page.getByRole("button", { name: /^Delete \d+ pages?$/, exact: true }).click();
  await expect(page.locator("aside input[type=checkbox]")).toHaveCount(1);
  await page.getByRole("button", { name: "Save PDF As" }).click();
  await page.getByRole("button", { name: "Continue to Save As" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "Save PDF As" }).getByRole("button", { name: "Continue", exact: true }).click();
  const rendered = await getDocument({ data: new Uint8Array(await bytes(await pending)) }).promise;
  expect(rendered.numPages).toBe(1);
  const text = (await (await rendered.getPage(1)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
  expect(text).toContain("Original page 3");
  expect(text).not.toContain("Original page 1");
  await rendered.destroy();
});

test("conversion wizard exports PNG and ZIP with selected pages", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openFixture(page);
  await page.getByRole("button", { name: "Convert PDF or PNG" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Resolution", { exact: true })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ path: "test-results/conversion-wizard.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Resolution", { exact: true })).toHaveCSS("background-color", "rgb(21, 23, 27)");
  await expect(page.getByLabel("Resolution", { exact: true })).toHaveCSS("color", "oklch(0.967 0.001 286.375)");
  await page.screenshot({ path: "test-results/conversion-wizard-dark.png" });
  await page.getByLabel("Pages (blank means all)").fill("2");
  await page.getByLabel("Resolution", { exact: true }).selectOption("72");
  let pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Convert and save" }).click();
  let output = await bytes(await pending);
  expect(output.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(output.readUInt32BE(16)).toBe(240);
  expect(output.readUInt32BE(20)).toBe(300);
  await page.getByLabel("Pages (blank means all)").fill("1,3");
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Convert and save" }).click();
  output = await bytes(await pending);
  expect(output.readUInt32LE(0)).toBe(0x04034b50);
  expect(output.includes(Buffer.from("page-0001.png"))).toBe(true);
  expect(output.includes(Buffer.from("page-0003.png"))).toBe(true);
  expect(output.includes(Buffer.from("page-0002.png"))).toBe(false);
  expect(output.readUInt16LE(output.length - 12)).toBe(2);
  await page.getByLabel("Pages (blank means all)").fill("999");
  await page.getByRole("button", { name: "Convert and save" }).click();
  await expect(page.getByRole("alert")).toContainText("between 1 and 4");
});

test("PNG to PDF creates one fitted page per image without replacing the open document", async ({ page }) => {
  await page.goto("/");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 30; canvas.height = 60;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "red"; ctx.fillRect(0, 0, 30, 60);
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByRole("button", { name: "Convert PDF or PNG" }).click();
  await page.getByRole("button", { name: "PNG to PDF", exact: true }).click();
  await page.getByLabel("Conversion files").setInputFiles(["one", "two"].map((name) => ({ name: `${name}.png`, mimeType: "image/png", buffer: Buffer.from(png, "base64") })));
  await page.getByRole("button", { name: "Move image 2 earlier" }).click();
  await expect(page.getByRole("listitem").first()).toContainText("two.png");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("PDF page size").selectOption("letter");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Convert and save" }).click();
  const pdf = await PDFDocument.load(await bytes(await pending));
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByText("No document open", { exact: true })).toBeVisible();
});
