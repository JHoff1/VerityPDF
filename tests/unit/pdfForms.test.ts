import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { applyPdfFormUpdates, normalizeRadioSelection } from "../../src/editor/useDocumentEditor";

describe("radio-form export values", () => {
  const priorityOptions = ["Normal", "High", "Urgent"];

  it("maps PDF.js widget indexes to the radio group's export values", () => {
    expect(normalizeRadioSelection("0", priorityOptions)).toBe("Normal");
    expect(normalizeRadioSelection("1", priorityOptions)).toBe("High");
    expect(normalizeRadioSelection("2", priorityOptions)).toBe("Urgent");
  });

  it("keeps valid export values and unknown custom values intact", () => {
    expect(normalizeRadioSelection("High", priorityOptions)).toBe("High");
    expect(normalizeRadioSelection("Custom", priorityOptions)).toBe("Custom");
  });

  it("exports a PDF.js radio widget index as the matching radio option", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const priority = pdf.getForm().createRadioGroup("priority");
    priority.addOptionToPage("Normal", page, { x: 10, y: 10, width: 14, height: 14 });
    priority.addOptionToPage("High", page, { x: 30, y: 10, width: 14, height: 14 });
    priority.addOptionToPage("Urgent", page, { x: 50, y: 10, width: 14, height: 14 });

    const updated = await applyPdfFormUpdates(await pdf.save(), [{
      name: "priority",
      kind: "radio",
      value: "1"
    }]);
    const reopened = await PDFDocument.load(updated);
    expect(reopened.getForm().getRadioGroup("priority").getSelected()).toBe("High");
  });
});
