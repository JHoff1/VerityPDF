import type { PDFDocument, PDFObject, PDFRawStream } from "pdf-lib";

export type CompressionMode = "lossless" | "balanced" | "smallest";
export type CompressionResult = { bytes: Uint8Array; originalSize: number; imagesCompressed: number; imagesSkipped: number; imagesAlreadySmall: number; imagesUnsupported: number; imagesTotal: number };

async function removeUnreachable(pdf: PDFDocument) {
  const { PDFRef, PDFDict, PDFArray, PDFStream, PDFName } = await import("pdf-lib");
  let hasTransparencyGroup = false;
  const reachable = new Set<string>();
  const visited = new Set<PDFObject>();
  const pending = Object.values(pdf.context.trailerInfo).filter(Boolean) as PDFObject[];
  while (pending.length) {
    const object = pending.pop()!;
    if (object instanceof PDFRef) {
      if (reachable.has(object.toString())) continue;
      reachable.add(object.toString());
      const target = pdf.context.lookup(object);
      if (target) pending.push(target);
    } else if (!visited.has(object)) {
      visited.add(object);
      if (object instanceof PDFStream) pending.push(object.dict);
      else if (object instanceof PDFDict) {
        if (object.get(PDFName.of("Type")) === PDFName.of("Sig") || (object.get(PDFName.of("FT")) === PDFName.of("Sig") && object.has(PDFName.of("V")))) throw new Error("This PDF contains a digital signature. Compression would invalidate it, so the document was left unchanged.");
        // A soft-mask graphics group can use ordinary images as alpha data.
        // Keep images unchanged when this more complex transparency is present.
        const mask = object.get(PDFName.of("SMask"));
        if (mask && mask !== PDFName.of("None") && object.get(PDFName.of("Subtype")) !== PDFName.of("Image")) hasTransparencyGroup = true;
        pending.push(...object.values());
      }
      else if (object instanceof PDFArray) pending.push(...object.asArray());
    }
  }
  for (const [ref] of pdf.context.enumerateIndirectObjects()) if (!reachable.has(ref.toString())) pdf.context.delete(ref);
  return hasTransparencyGroup;
}

export async function assertCompressionAllowed(bytes: Uint8Array) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  await removeUnreachable(pdf);
}

async function compressImage(stream: PDFRawStream, mode: CompressionMode): Promise<{ bytes: Uint8Array; width: number; height: number } | "already-small" | null> {
  const { PDFName, PDFNumber, decodePDFRawStream } = await import("pdf-lib");
  const dict = stream.dict;
  const lookup = (key: string) => dict.lookup(PDFName.of(key));
  // Do not change transparency, masks, color profiles, custom decode mappings,
  // indexed/CMYK colors, or specialized encodings without a color-managed path.
  if (["SMask", "Mask", "ImageMask", "Decode", "DecodeParms", "SMaskInData", "Alternates", "F"].some((key) => dict.has(PDFName.of(key)))) return null;
  const color = lookup("ColorSpace");
  if (color !== PDFName.of("DeviceRGB") && color !== PDFName.of("DeviceGray")) return null;
  const bits = lookup("BitsPerComponent");
  const widthValue = lookup("Width"), heightValue = lookup("Height");
  if (!(bits instanceof PDFNumber) || bits.asNumber() !== 8 || !(widthValue instanceof PDFNumber) || !(heightValue instanceof PDFNumber)) return null;
  const width = widthValue.asNumber(), height = heightValue.asNumber();
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 32_000_000) return null;
  const filter = lookup("Filter");
  if (filter && filter !== PDFName.of("DCTDecode") && filter !== PDFName.of("FlateDecode")) return null;
  const edge = mode === "balanced" ? 2400 : 1600;
  const scale = Math.min(1, edge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  const source = document.createElement("canvas");
  let bitmap: ImageBitmap | undefined;
  try {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (filter === PDFName.of("DCTDecode")) {
      bitmap = await createImageBitmap(new Blob([new Uint8Array(stream.contents)], { type: "image/jpeg" }), { imageOrientation: "none" });
      if (bitmap.width !== width || bitmap.height !== height) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } else {
      const channels = color === PDFName.of("DeviceRGB") ? 3 : 1;
      const expected = width * height * channels;
      const pixels = decodePDFRawStream(stream).getBytes(expected + 1);
      if (pixels.length !== expected) return null;
      source.width = width; source.height = height;
      const sourceContext = source.getContext("2d");
      if (!sourceContext) return null;
      const rgba = sourceContext.createImageData(width, height);
      for (let pixel = 0; pixel < width * height; pixel++) {
        const offset = pixel * channels;
        rgba.data[pixel * 4] = pixels[offset];
        rgba.data[pixel * 4 + 1] = pixels[offset + (channels === 3 ? 1 : 0)];
        rgba.data[pixel * 4 + 2] = pixels[offset + (channels === 3 ? 2 : 0)];
        rgba.data[pixel * 4 + 3] = 255;
      }
      sourceContext.putImageData(rgba, 0, 0);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", mode === "balanced" ? 0.82 : 0.58));
    if (!blob) return null;
    if (blob.size >= stream.contents.length) return "already-small";
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    bitmap?.close();
    canvas.width = canvas.height = source.width = source.height = 0;
  }
}

export async function compressPdf(bytes: Uint8Array, mode: CompressionMode, progress: (message: string) => void = () => {}, cancelled: () => boolean = () => false): Promise<CompressionResult> {
  const { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFRef } = await import("pdf-lib");
  const checkCancelled = () => { if (cancelled()) throw new Error("Compression cancelled. The document is unchanged."); };
  progress("Reading PDF structure…");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  // Rewriting a signed PDF invalidates its signature; do not silently do that.
  if (pdf.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Sig"))) throw new Error("This PDF contains a digital signature. Compression would invalidate it, so the document was left unchanged.");
  checkCancelled();
  const hasTransparencyGroup = await removeUnreachable(pdf);
  let imagesCompressed = 0, imagesSkipped = 0, imagesAlreadySmall = 0, imagesUnsupported = 0;
  const images = pdf.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
  if (mode !== "lossless") {
    const masks = new Set<string>();
    for (const [, object] of images) for (const key of ["SMask", "Mask"]) {
      const mask = (object as PDFRawStream).dict.get(PDFName.of(key));
      if (mask instanceof PDFRef) masks.add(mask.toString());
    }
    for (const [index, [ref, object]] of images.entries()) {
      checkCancelled();
      progress(`Optimizing image ${index + 1} of ${images.length}…`);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const stream = object as PDFRawStream;
      if (hasTransparencyGroup || masks.has(ref.toString())) { imagesSkipped++; imagesUnsupported++; continue; }
      let image: Awaited<ReturnType<typeof compressImage>>;
      try { image = await compressImage(stream, mode); } catch { image = null; }
      if (image === "already-small") { imagesSkipped++; imagesAlreadySmall++; continue; }
      if (!image) { imagesSkipped++; imagesUnsupported++; continue; }
      const dict = stream.dict.clone(pdf.context);
      dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
      dict.set(PDFName.of("Width"), pdf.context.obj(image.width));
      dict.set(PDFName.of("Height"), pdf.context.obj(image.height));
      dict.set(PDFName.of("BitsPerComponent"), pdf.context.obj(8));
      pdf.context.assign(ref, PDFRawStream.of(dict, image.bytes));
      imagesCompressed++;
    }
  }
  checkCancelled();
  progress("Writing compressed PDF…");
  const output = await pdf.save({ useObjectStreams: true, updateFieldAppearances: false });
  checkCancelled();
  return { bytes: output, originalSize: bytes.length, imagesCompressed, imagesSkipped, imagesAlreadySmall, imagesUnsupported, imagesTotal: images.length };
}
