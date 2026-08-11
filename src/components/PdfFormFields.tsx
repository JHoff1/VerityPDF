import type { FormWidget, FormFieldValue } from "../editor/pdfForms";
import type { Tool } from "../editorUiTypes";

export function PdfFormFields({
  fields,
  activeTool,
  onCommit
}: {
  fields: FormWidget[];
  activeTool: Tool;
  onCommit: (field: FormWidget, value: FormFieldValue) => void;
}) {
  if (!fields.length || activeTool !== "select") return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" aria-label="Fillable PDF form fields">
      {fields.map((field) => {
        const value = field.value;
        const style = {
          left: `${field.x * 100}%`, top: `${field.y * 100}%`,
          width: `${field.width * 100}%`, height: `${field.height * 100}%`
        };
        const className = "absolute min-w-0 rounded border border-sky-500/45 bg-white/20 px-1 text-[max(10px,0.9em)] text-zinc-900 outline-none transition hover:border-sky-500 focus:border-sky-600 focus:bg-white/75 focus:ring-2 focus:ring-sky-400/50 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent";
        if (field.kind === "checkbox") {
          return <input key={field.id} aria-label={field.name} title={field.name} type="checkbox" defaultChecked={Boolean(value)} disabled={field.readOnly} className="pointer-events-auto absolute cursor-pointer rounded-sm border border-sky-600 bg-white accent-sky-600 shadow-sm" style={{ ...style, colorScheme: "light" }} onChange={(event) => onCommit(field, event.currentTarget.checked)} />;
        }
        if (field.kind === "dropdown" || field.kind === "listbox") {
          return <select key={field.id} aria-label={field.name} title={field.name} defaultValue={Array.isArray(value) ? value[0] ?? "" : String(value)} disabled={field.readOnly} className={`pointer-events-auto ${className}`} style={style} onChange={(event) => onCommit(field, event.currentTarget.value)}>
            <option value="" />
            {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>;
        }
        if (field.kind === "radio") {
          const option = field.options[0]?.value ?? "Yes";
          return <input key={field.id} aria-label={field.name} title={field.name} type="radio" defaultChecked={String(value) === option} disabled={field.readOnly} className="pointer-events-auto absolute cursor-pointer border border-sky-600 bg-white accent-sky-600 shadow-sm" style={{ ...style, colorScheme: "light" }} onChange={() => onCommit(field, option)} />;
        }
        const textValue = Array.isArray(value) ? value.join(", ") : String(value);
        return field.multiline
          ? <textarea key={field.id} aria-label={field.name} title={field.name} defaultValue={textValue} disabled={field.readOnly} className={`pointer-events-auto ${className} resize-none py-0.5`} style={style} onBlur={(event) => onCommit(field, event.currentTarget.value)} />
          : <input key={field.id} aria-label={field.name} title={field.name} defaultValue={textValue} disabled={field.readOnly} className={`pointer-events-auto ${className}`} style={style} onBlur={(event) => onCommit(field, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
      })}
    </div>
  );
}
