export type DiagnosticSnapshot = {
  version: string;
  platform: string;
  desktop: boolean;
  pageCount: number;
  annotationCount: number;
  dirty: boolean;
  theme: string;
  viewMode: string;
  flattenAnnotations: boolean;
  automaticBackups: boolean;
  restoreSession: boolean;
  lastError?: string | null;
};

export function scrubDiagnosticText(value: string) {
  return value
    .replace(/[“"][^”"\r\n]*\.pdf[”"]/gi, '“[REDACTED_FILE]”')
    .replace(/[A-Z]:[\\/][^\r\n]+/gi, "[REDACTED_WINDOWS_PATH]")
    .replace(/\\\\[^\r\n]+/g, "[REDACTED_NETWORK_PATH]")
    .replace(/\/(?:Users|home|tmp|mnt|media|Volumes|var)\/[^\r\n]+/gi, "[REDACTED_LOCAL_PATH]")
    .replace(/(?:^|\s)[^\\/:*?"<>|\r\n]*\.pdf\b/gi, " [REDACTED_FILE]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}

export function createDiagnosticReport(snapshot: DiagnosticSnapshot) {
  const lines = [
    "VerityPDF local diagnostic report",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${snapshot.version}`,
    `Platform: ${snapshot.platform || "unknown"}`,
    `Desktop runtime: ${snapshot.desktop ? "yes" : "no"}`,
    `Document loaded: ${snapshot.pageCount > 0 ? "yes" : "no"}`,
    `Page count: ${snapshot.pageCount}`,
    `Annotation count: ${snapshot.annotationCount}`,
    `Unsaved changes: ${snapshot.dirty ? "yes" : "no"}`,
    `Theme: ${snapshot.theme}`,
    `View mode: ${snapshot.viewMode}`,
    `Flatten annotations: ${snapshot.flattenAnnotations ? "yes" : "no"}`,
    `Automatic backups: ${snapshot.automaticBackups ? "yes" : "no"}`,
    `Restore interrupted sessions: ${snapshot.restoreSession ? "yes" : "no"}`,
    `Last error: ${snapshot.lastError ? scrubDiagnosticText(snapshot.lastError) : "none"}`,
    "",
    "Privacy note: document contents, file names, recent-file paths, save folders,",
    "recovery contents, and annotation contents are intentionally excluded."
  ];
  return `${lines.join("\n")}\n`;
}

export function createIssueReport(snapshot: DiagnosticSnapshot) {
  return [
    "## What happened?", "Describe the problem here.", "",
    "## Steps to reproduce", "1. ", "2. ", "",
    "## Expected behavior", "What did you expect to happen?", "",
    "## Diagnostics (review before sharing)",
    createDiagnosticReport({ ...snapshot, lastError: snapshot.lastError ? scrubDiagnosticText(snapshot.lastError).slice(0, 2000) : null }),
    "Please do not attach private PDFs or screenshots containing personal information."
  ].join("\n");
}

export function errorGuidance(error: string, platform = "") {
  const windows = /^Win/i.test(platform);
  if (/access (?:is )?denied|permission denied/i.test(error)
    || (windows && /os error 5\b/i.test(error))
    || (!windows && /os error 13\b/i.test(error))) {
    return "Access was denied. If this happened while saving, try Save As with a new filename in a folder you can write to. Check whether the PDF is read-only or open in another app. Keep this window open until your edits are saved.";
  }
  if (/sharing violation|used by another process/i.test(error)
    || (windows && /os error (?:32|33)\b/i.test(error))) {
    return "Another app may be locking the file. Close that app or use Save As with a new filename. Keep this window open until your edits are saved.";
  }
  return null;
}
