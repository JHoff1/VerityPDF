import { PDFDocument, PDFName, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from "pdf-lib";

export async function compressionFixture(width = 900, height = 900) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const pixels = new Uint8Array(width * height * 3);
  let seed = 42;
  for (let i = 0; i < pixels.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; pixels[i] = seed >>> 24; }
  const image = pdf.context.register(pdf.context.stream(pixels, { Type: "XObject", Subtype: "Image", Width: width, Height: height, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }));
  page.node.setXObject(PDFName.of("Scan"), image);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(500, 0, 0, 500, 50, 200), drawObject("Scan"), popGraphicsState());
  page.drawText("SEARCHABLE_COMPRESSION_TEXT", { x: 50, y: 160, size: 14 });
  const field = pdf.getForm().createTextField("name");
  field.setText("Editable value");
  field.addToPage(page, { x: 50, y: 90, width: 230, height: 30 });
  pdf.setTitle("Compression integrity fixture");
  return pdf.save();
}
