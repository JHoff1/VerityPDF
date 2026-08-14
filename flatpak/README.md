# Flatpak / Flathub packaging

`com.veritypdf.VerityPDF` is VerityPDF's permanent Flatpak application ID.

The Flatpak deliberately requests no network permission. Local document access
uses the desktop file chooser portal, and Flatpak updates replace VerityPDF's
optional GitHub update check.

## Reproducible dependency sources

`npm-sources.json` and `cargo-sources.json` pin every frontend and Rust build
dependency used by the Flatpak manifest. Regenerate them after changing the
corresponding lock file:

```sh
flatpak-node-generator npm flatpak/node/package-lock.json -o flatpak/npm-sources.json
flatpak-cargo-generator src-tauri/Cargo.lock -o flatpak/cargo-sources.json
```

The source tag in `com.veritypdf.VerityPDF.json` must be updated to the release
tag being submitted to Flathub. Run the Flatpak checks in GitHub Actions before
opening or updating a Flathub pull request.
