# Future release follow-ups

## TypeScript 7 migration — PR #13

https://github.com/JHoff1/VerityPDF/pull/13

Migration authorized by the maintainer on 2026-10-17. Include it with the
error-reporting improvements in the next planned release; do not publish a
separate release just for this compiler update.

PR #13 updates TypeScript to 7.0.2 and makes normal builds type-check both the
application and the Vite/Playwright configuration files. Validate browser,
native, packaging, and Store workflows before merging. No PDF-engine or
document-format migration is intended.
