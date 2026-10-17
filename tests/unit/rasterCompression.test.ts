import { expect, it } from "vitest";
import { rasterDimensions, rasterCompressPdf } from "../../src/lib/rasterCompression";

it("calculates independent DPI dimensions and bounds canvas allocations", () => {
  expect(rasterDimensions(612, 792, 200)).toEqual({ width: 1700, height: 2200 });
  expect(rasterDimensions(612, 792, 300)).toEqual({ width: 2550, height: 3300 });
  expect(() => rasterDimensions(612, 792, 144)).toThrow("200 or 300");
  expect(() => rasterDimensions(10000, 10000, 300)).toThrow("too large");
  expect(() => rasterDimensions(NaN, 100, 200)).toThrow("too large");
});

it("honors cancellation before loading or allocating anything", async () => {
  const abort = new AbortController(); abort.abort();
  await expect(rasterCompressPdf(new Uint8Array(), "balanced", 200, false, abort.signal)).rejects.toThrow("cancelled");
});
