import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type FormFieldKind = "text" | "checkbox" | "dropdown" | "listbox" | "radio";
export type FormFieldValue = string | boolean | string[];

export type FormWidget = {
  id: string;
  name: string;
  page: number;
  kind: FormFieldKind;
  x: number;
  y: number;
  width: number;
  height: number;
  value: FormFieldValue;
  options: { label: string; value: string }[];
  readOnly: boolean;
  required: boolean;
  multiline: boolean;
};

type PdfJsWidget = {
  id: string;
  subtype?: string;
  fieldType?: string;
  fieldName?: string;
  fieldValue?: unknown;
  rect?: number[];
  readOnly?: boolean;
  required?: boolean;
  multiLine?: boolean;
  checkBox?: boolean;
  radioButton?: boolean;
  buttonValue?: string;
  combo?: boolean;
  options?: { displayValue?: string; exportValue?: string }[];
};

function kindFor(annotation: PdfJsWidget): FormFieldKind | null {
  if (annotation.fieldType === "Tx") return "text";
  if (annotation.fieldType !== "Btn" && annotation.fieldType !== "Ch") return null;
  if (annotation.checkBox) return "checkbox";
  if (annotation.radioButton) return "radio";
  if (annotation.fieldType === "Ch") return annotation.combo ? "dropdown" : "listbox";
  return null;
}

export async function detectFormWidgets(pages: PDFPageProxy[]): Promise<FormWidget[]> {
  const widgets: FormWidget[] = [];
  for (const page of pages) {
    const viewport = page.getViewport({ scale: 1 });
    const annotations = await page.getAnnotations() as PdfJsWidget[];
    for (const annotation of annotations) {
      if (annotation.subtype !== "Widget" || !annotation.fieldName || !annotation.rect) continue;
      const kind = kindFor(annotation);
      if (!kind) continue;
      const [left, top, right, bottom] = viewport.convertToViewportRectangle(annotation.rect);
      const values = Array.isArray(annotation.fieldValue)
        ? annotation.fieldValue.filter((value): value is string => typeof value === "string")
        : typeof annotation.fieldValue === "string" ? annotation.fieldValue : "";
      const optionValues = kind === "radio"
        ? [{ displayValue: annotation.buttonValue ?? "Yes", exportValue: annotation.buttonValue ?? "Yes" }]
        : annotation.options ?? [];
      widgets.push({
        id: annotation.id,
        name: annotation.fieldName,
        page: page.pageNumber,
        kind,
        x: Math.max(0, Math.min(left, right) / viewport.width),
        y: Math.max(0, Math.min(top, bottom) / viewport.height),
        width: Math.min(1, Math.abs(right - left) / viewport.width),
        height: Math.min(1, Math.abs(bottom - top) / viewport.height),
        value: kind === "checkbox" ? values === "Yes" || values === "On" || values === "true" : values,
        options: optionValues.map((option) => ({
          label: option.displayValue ?? option.exportValue ?? "",
          value: option.exportValue ?? option.displayValue ?? ""
        })),
        readOnly: Boolean(annotation.readOnly),
        required: Boolean(annotation.required),
        multiline: Boolean(annotation.multiLine)
      });
    }
  }
  return widgets;
}
