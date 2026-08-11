import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const output = resolve("output/pdf/generic-fillable-form.pdf");
const pdf = await PDFDocument.create();
const page = pdf.addPage([612, 792]);
const form = pdf.getForm();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const navy = rgb(0.08, 0.12, 0.2);
const orange = rgb(0.88, 0.27, 0.1);
const border = rgb(0.48, 0.54, 0.64);
const fieldStyle = { borderColor: border, borderWidth: 1, backgroundColor: rgb(0.98, 0.99, 1), textColor: navy, font, fontSize: 10 };

page.drawRectangle({ x: 0, y: 720, width: 612, height: 72, color: navy });
page.drawText("Generic Fillable Form", { x: 46, y: 754, size: 24, font: bold, color: rgb(1, 1, 1) });
page.drawText("Use this sample to test local form filling, saving, and flattening.", { x: 46, y: 735, size: 10, font, color: rgb(0.86, 0.9, 0.96) });

const label = (text, x, y) => page.drawText(text, { x, y, size: 10, font: bold, color: navy });
const section = (text, y) => {
  page.drawRectangle({ x: 46, y: y - 6, width: 520, height: 22, color: rgb(0.94, 0.96, 0.99) });
  page.drawText(text, { x: 56, y, size: 11, font: bold, color: orange });
};
const textField = (name, caption, x, y, width) => {
  label(caption, x, y + 26);
  const field = form.createTextField(name);
  field.addToPage(page, { x, y, width, height: 22, ...fieldStyle });
};

section("Contact details", 680);
textField("full_name", "Full name", 46, 630, 250);
textField("email_address", "Email address", 316, 630, 250);
textField("phone_number", "Phone number", 46, 575, 250);
label("Preferred contact", 316, 601);
const contact = form.createDropdown("preferred_contact");
contact.addOptions(["Email", "Phone", "Either"]);
contact.addToPage(page, { x: 316, y: 575, width: 250, height: 22, ...fieldStyle });

section("Request", 525);
label("Request type", 46, 496);
const request = form.createDropdown("request_type");
request.addOptions(["General question", "Technical support", "Feature request", "Billing"]);
request.addToPage(page, { x: 46, y: 470, width: 250, height: 22, ...fieldStyle });
label("Priority", 316, 496);
const priority = form.createRadioGroup("priority");
priority.addOptionToPage("Normal", page, { x: 318, y: 473, width: 14, height: 14, borderColor: border, borderWidth: 1, selected: true });
page.drawText("Normal", { x: 338, y: 475, size: 10, font, color: navy });
priority.addOptionToPage("High", page, { x: 402, y: 473, width: 14, height: 14, borderColor: border, borderWidth: 1 });
page.drawText("High", { x: 422, y: 475, size: 10, font, color: navy });
priority.addOptionToPage("Urgent", page, { x: 474, y: 473, width: 14, height: 14, borderColor: border, borderWidth: 1 });
page.drawText("Urgent", { x: 494, y: 475, size: 10, font, color: navy });

section("Notes", 420);
label("Describe your request", 46, 390);
const notes = form.createTextField("notes");
notes.enableMultiline();
notes.addToPage(page, { x: 46, y: 270, width: 520, height: 105, ...fieldStyle });
const consent = form.createCheckBox("contact_consent");
consent.addToPage(page, { x: 46, y: 226, width: 15, height: 15, borderColor: border, borderWidth: 1 });
page.drawText("You may contact me about this request.", { x: 70, y: 229, size: 10, font, color: navy });

page.drawLine({ start: { x: 46, y: 186 }, end: { x: 566, y: 186 }, thickness: 1, color: rgb(0.85, 0.88, 0.92) });
page.drawText("All fields are local to this PDF. Nothing is sent to VerityPDF or any service.", { x: 46, y: 166, size: 9, font, color: rgb(0.36, 0.42, 0.5) });
form.updateFieldAppearances(font);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, await pdf.save());
console.log(output);
