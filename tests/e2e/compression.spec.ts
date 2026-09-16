import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, PDFName, PDFRawStream, PDFNumber } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "node:fs/promises";
import { compressionFixture } from "../fixtures/compressionFixture";

async function openCompression(page: Page, bytes: Uint8Array) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.locator('input[accept="application/pdf,.pdf"]').first().setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from(bytes) });
  await page.getByRole("button", { name: "Compress PDF", exact: true }).click();
}
async function download(page: Page) {
  await page.getByRole("button", { name: "Save PDF As", exact: true }).click();
  await page.getByRole("button", { name: "Continue to Save As" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "Save PDF As" }).getByRole("button", { name: "Continue", exact: true }).click();
  return new Uint8Array(await readFile((await (await pending).path())!));
}

async function vectorFixture() {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 3; index++) {
    const page = pdf.addPage([200, 300]);
    const commands = "0.2 0.3 0.4 RG 0.3 w 10 10 m 190 290 l S\n".repeat(12000);
    page.node.addContentStream(pdf.context.register(pdf.context.stream(commands)));
    page.drawText(`Vector page ${index + 1}`, { x: 20, y: 260, size: 10 });
    if (index === 2) page.setRotation({ type: "degrees", angle: 90 } as Parameters<typeof page.setRotation>[0]);
  }
  const field = pdf.getForm().createTextField("raster-test");
  field.setText("Editable original");
  field.addToPage(pdf.getPage(0), { x: 20, y: 220, width: 160, height: 25 });
  return pdf.save();
}

test("raster sliders estimate a sample, save all pages separately, and retain the original", async ({ page }) => {
  await openCompression(page, await vectorFixture());
  await expect(page.getByRole("slider", { name: "Page rendering", exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "200 DPI", exact: true }).click();
  await expect(page.getByRole("button", { name: "Analyze and compress", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: /I understand this creates/ }).check();
  await page.getByRole("button", { name: "Estimate & preview first page", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("estimate covers 3 pages");
  await expect(page.getByRole("img", { name: "Compressed page 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save rasterized copy", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Analyze and compress", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save rasterized copy", exact: true })).toBeEnabled();
  await expect(page.getByRole("dialog")).toContainText("After (measured)");
  await page.getByRole("img", { name: "Compressed page 1", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/raster-compression.png" });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save rasterized copy", exact: true }).click();
  const saved = await pending;
  expect(saved.suggestedFilename()).toBe("scan-rasterized.pdf");
  const data = new Uint8Array(await readFile((await saved.path())!));
  const output = await PDFDocument.load(data);
  expect(output.getPageCount()).toBe(3);
  expect(output.getPage(2).getSize()).toEqual({ width: 300, height: 200 });
  expect(output.getForm().getFields()).toHaveLength(0);
  const images = output.context.enumerateIndirectObjects().map(([, value]) => value).filter((value): value is PDFRawStream => value instanceof PDFRawStream && value.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
  expect(images).toHaveLength(3);
  expect((images[0].dict.get(PDFName.of("Width")) as PDFNumber).asNumber()).toBe(556);
  const rendered = await getDocument({ data: data.slice() }).promise;
  expect((await (await rendered.getPage(1)).getTextContent()).items).toHaveLength(0);
  await rendered.destroy();
  await expect(page.locator(".editor-toolbar").getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  const original = await PDFDocument.load(await download(page));
  expect(original.getForm().getTextField("raster-test").getText()).toBe("Editable original");
});

test("raster settings invalidate estimates, cancellation is safe, and signatures are refused", async ({ page }) => {
  await openCompression(page, await vectorFixture());
  await page.getByRole("button", { name: "300 DPI", exact: true }).click();
  await page.getByRole("checkbox", { name: /I understand this creates/ }).check();
  await page.getByRole("button", { name: "Estimate & preview first page", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("estimate covers 3 pages");
  await page.getByRole("button", { name: "Strong", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Not measured yet");
  await expect(page.getByRole("img", { name: "Compressed page 1", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Analyze and compress", exact: true }).click();
  await page.getByRole("button", { name: "Stop compression", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await expect(page.getByRole("button", { name: "Save rasterized copy", exact: true })).toHaveCount(0);
  const signed = await PDFDocument.create(); signed.addPage();
  signed.catalog.set(PDFName.of("TestSignature"), signed.context.register(signed.context.obj({ Type: "Sig" })));
  await openCompression(page, await signed.save());
  await page.getByRole("button", { name: "200 DPI", exact: true }).click();
  await page.getByRole("checkbox", { name: /I understand this creates/ }).check();
  await page.getByRole("button", { name: "Analyze and compress", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("signature");
});

test("keyboard sliders support 300 DPI with lossless raster encoding", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openCompression(page, await vectorFixture());
  const quality = page.getByRole("slider", { name: "Image & file compression", exact: true });
  await quality.focus(); await page.keyboard.press("Home");
  await expect(quality).toHaveAttribute("aria-valuetext", "Lossless");
  const rendering = page.getByRole("slider", { name: "Page rendering", exact: true });
  await rendering.focus(); await page.keyboard.press("End");
  await expect(rendering).toHaveAttribute("aria-valuetext", "300 DPI");
  await expect(page.getByRole("dialog")).toContainText("PNG encoding preserves the rendered pixels");
  await page.screenshot({ path: "test-results/compression-sliders-dark.png" });
  await page.getByRole("checkbox", { name: /I understand this creates/ }).check();
  await page.getByRole("button", { name: "Analyze and compress", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save rasterized copy", exact: true }).click();
  const saved = await pending;
  const pdf = await PDFDocument.load(await readFile((await saved.path())!));
  const image = pdf.context.enumerateIndirectObjects().map(([, value]) => value).find((value): value is PDFRawStream => value instanceof PDFRawStream && value.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"))!;
  expect((image.dict.get(PDFName.of("Width")) as PDFNumber).asNumber()).toBe(834);
  expect(image.dict.get(PDFName.of("Filter"))?.toString()).toBe("/FlateDecode");
});

test("balanced compression reduces an image PDF while preserving text, forms and Undo", async ({ page }) => {
  const original = await compressionFixture();
  await openCompression(page, original);
  await page.getByRole("button", { name: "Analyze and compress" }).click();
  await expect(page.getByRole("button", { name: "Apply compression" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("1 image compressed");
  await expect(page.getByRole("img", { name: "Original page 1", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Compressed page 1", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/compression-result.png" });
  await page.getByRole("button", { name: "Apply compression" }).click();
  await expect(page.getByRole("dialog", { name: "Compress PDF" })).toBeHidden();
  const output = await download(page);
  expect(output.length).toBeLessThan(original.length * 0.6);
  const pdf = await PDFDocument.load(output);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe("Compression integrity fixture");
  expect(pdf.getForm().getTextField("name").getText()).toBe("Editable value");
  const rendered = await getDocument({ data: output.slice() }).promise;
  expect((await (await rendered.getPage(1)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ")).toContain("SEARCHABLE_COMPRESSION_TEXT");
  await rendered.destroy();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const restored = await PDFDocument.load(await download(page));
  const streams = restored.context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
  expect((streams[0][1] as PDFRawStream).contents.length).toBe(900 * 900 * 3);
});

test("smallest downsamples oversized images and lossless keeps a non-smaller result unapplied", async ({ page }) => {
  test.setTimeout(60000);
  await openCompression(page, await compressionFixture(2600, 200));
  await page.getByRole("button", { name: "Strong", exact: true }).click();
  await page.getByRole("button", { name: "Analyze and compress" }).click();
  await page.getByRole("button", { name: "Apply compression" }).click();
  const pdf = await PDFDocument.load(await download(page));
  const image = pdf.context.enumerateIndirectObjects().map(([, obj]) => obj).find((obj) => obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) as PDFRawStream;
  expect((image.dict.get(PDFName.of("Width")) as PDFNumber).asNumber()).toBe(1600);
  const tiny = await PDFDocument.create(); tiny.addPage();
  // Normalize once so structural compression has nothing left to remove.
  const bytes = await tiny.save({ useObjectStreams: true });
  await openCompression(page, bytes);
  await page.getByRole("button", { name: "Lossless", exact: true }).click();
  await page.getByRole("button", { name: "Analyze and compress" }).click();
  await expect(page.getByRole("dialog")).toContainText("No savings — original kept");
  await expect(page.getByRole("dialog")).toContainText("No embedded raster images were found");
  await expect(page.getByRole("button", { name: "Apply compression" })).toHaveCount(0);
  await page.getByRole("button", { name: "Keep original" }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("recompresses existing JPEG images without rasterizing the page", async ({ page }) => {
  await page.goto("/");
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 600;
    const context = canvas.getContext("2d")!;
    const pixels = context.createImageData(600, 600);
    let seed = 9;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      pixels.data[index] = seed & 255; pixels.data[index + 1] = (seed >>> 8) & 255;
      pixels.data[index + 2] = (seed >>> 16) & 255; pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", 1).split(",")[1];
  });
  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(Buffer.from(jpeg, "base64"));
  pdf.addPage([612, 792]).drawImage(image, { x: 50, y: 100, width: 500, height: 500 });
  const original = await pdf.save();
  await openCompression(page, original);
  await page.getByRole("button", { name: "Analyze and compress" }).click();
  await expect(page.getByRole("dialog")).toContainText("1 image compressed");
  await page.getByRole("button", { name: "Apply compression" }).click();
  const output = await download(page);
  expect(output.length).toBeLessThan(original.length * 0.7);
});
