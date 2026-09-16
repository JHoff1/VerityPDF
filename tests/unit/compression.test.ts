import { expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { compressPdf } from "../../src/lib/compressPdf";
import { compressionFixture } from "../fixtures/compressionFixture";

it("losslessly removes unreachable objects, preserving image streams, metadata and forms", async () => {
  const pdf = await PDFDocument.load(await compressionFixture(100, 100));
  pdf.context.register(pdf.context.stream(new Uint8Array(100_000).fill(97)));
  const original = await pdf.save();
  const result = await compressPdf(original, "lossless");
  expect(result.bytes.length).toBeLessThan(original.length - 90_000);
  const output = await PDFDocument.load(result.bytes);
  expect(output.getTitle()).toBe("Compression integrity fixture");
  expect(output.getForm().getTextField("name").getText()).toBe("Editable value");
  const imageBytes = (doc: PDFDocument) => doc.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image") ? [object.contents] : []);
  expect(imageBytes(output)).toEqual(imageBytes(pdf));
});

it("refuses signed documents and honors cancellation without altering the input", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  pdf.catalog.set(PDFName.of("TestSignature"), pdf.context.register(pdf.context.obj({ Type: "Sig" })));
  await expect(compressPdf(await pdf.save(), "lossless")).rejects.toThrow("signature");
  const original = await compressionFixture(10, 10);
  const copy = original.slice();
  await expect(compressPdf(original, "balanced", () => {}, () => true)).rejects.toThrow("cancelled");
  expect(original).toEqual(copy);
});

it("does not recompress a transparency image or its separate soft mask", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const mask = pdf.context.register(pdf.context.stream(new Uint8Array(100).fill(128), { Type: "XObject", Subtype: "Image", Width: 10, Height: 10, ColorSpace: "DeviceGray", BitsPerComponent: 8 }));
  const image = pdf.context.register(pdf.context.stream(new Uint8Array(300).fill(255), { Type: "XObject", Subtype: "Image", Width: 10, Height: 10, ColorSpace: "DeviceRGB", BitsPerComponent: 8, SMask: mask }));
  page.node.setXObject(PDFName.of("Transparent"), image);
  const original = await pdf.save();
  const result = await compressPdf(original, "smallest");
  expect(result.imagesCompressed).toBe(0);
  expect(result.imagesSkipped).toBe(2);
  const output = await PDFDocument.load(result.bytes);
  expect((output.context.lookup(mask) as PDFRawStream).contents).toEqual(new Uint8Array(100).fill(128));
});
