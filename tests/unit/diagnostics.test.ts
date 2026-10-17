import { describe, expect, it } from "vitest";
import { createDiagnosticReport, createIssueReport, errorGuidance, scrubDiagnosticText } from "../../src/diagnostics";

describe("privacy-scrubbed diagnostics", () => {
  it("provides actionable permission and file-lock guidance", () => {
    expect(errorGuidance("Access is denied. (os error 5)")).toContain("Save As");
    expect(errorGuidance("Permission denied (os error 13)")).toContain("Keep this window open");
    expect(errorGuidance("os error 32", "Win32")).toContain("locking");
    expect(errorGuidance("os error 5", "Win32")).toContain("Save As");
    expect(errorGuidance("os error 5", "Linux x86_64")).toBeNull();
    expect(errorGuidance("os error 13", "Win32")).toBeNull();
    expect(errorGuidance("os error 50")).toBeNull();
    expect(errorGuidance("Invalid PDF header")).toBeNull();
  });

  it("scrubs forward-slash Windows and mounted-drive paths", () => {
    expect(scrubDiagnosticText("Failed C:/Users/Jacob/private.png")).not.toContain("Jacob");
    expect(scrubDiagnosticText("Failed /mnt/private/image.png")).not.toContain("private");
  });
  it("removes local paths, PDF names, email addresses, and network paths", () => {
    const source =
      'Could not open “Tax Return 2025.pdf” or bare-name.pdf at C:\\Users\\Person\\Documents\\Tax Return 2025.pdf for person@example.com from \\\\server\\private\\file.pdf';
    const scrubbed = scrubDiagnosticText(source);
    expect(scrubbed).not.toContain("Tax Return");
    expect(scrubbed).not.toContain("Person");
    expect(scrubbed).not.toContain("person@example.com");
    expect(scrubbed).not.toContain("server");
    expect(scrubbed).not.toContain("bare-name.pdf");
    expect(scrubbed).toContain("[REDACTED_FILE]");
  });

  it("includes useful state without document or annotation contents", () => {
    const report = createDiagnosticReport({
      version: "1.2.3",
      platform: "Win32",
      desktop: true,
      pageCount: 12,
      annotationCount: 3,
      dirty: true,
      theme: "system",
      viewMode: "fit-page",
      flattenAnnotations: true,
      automaticBackups: false,
      restoreSession: true,
      lastError: 'Could not open “private.pdf”.'
    });
    expect(report).toContain("Version: 1.2.3");
    expect(report).toContain("Page count: 12");
    expect(report).toContain("Unsaved changes: yes");
    expect(report).not.toContain("private.pdf");
    const issue = createIssueReport({
      version: "1.2.3", platform: "Win32", desktop: true,
      pageCount: 12, annotationCount: 3, dirty: true, theme: "system",
      viewMode: "fit-page", flattenAnnotations: true, automaticBackups: false,
      restoreSession: true, lastError: "Access denied: C:/Users/Person/private.pdf"
    });
    expect(issue).toContain("## Steps to reproduce");
    expect(issue).toContain("Version: 1.2.3");
    expect(issue).toContain("Platform: Win32");
    expect(issue).not.toContain("Person");
    expect(issue).not.toContain("private.pdf");
  });
});
