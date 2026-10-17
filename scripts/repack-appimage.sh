#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <path-to-AppImage>" >&2
  exit 2
fi

appimage_path="$(readlink -f "$1")"
if [[ ! -f "$appimage_path" ]]; then
  echo "AppImage not found: $appimage_path" >&2
  exit 1
fi

work_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

input_appimage="$work_dir/input.AppImage"
app_dir="$work_dir/squashfs-root"
runtime_path="$work_dir/runtime-x86_64"
squashfs_path="$work_dir/payload.squashfs"
repaired_path="$work_dir/repaired.AppImage"

cp "$appimage_path" "$input_appimage"
chmod 0755 "$input_appimage"

(
  cd "$work_dir"
  "$input_appimage" --appimage-extract >/dev/null
)

if [[ ! -x "$app_dir/AppRun" ]]; then
  chmod 0755 "$app_dir/AppRun"
fi

wrapped_path="$app_dir/AppRun.wrapped"
if [[ ! -e "$wrapped_path" ]]; then
  echo "The extracted AppImage does not contain AppRun.wrapped." >&2
  exit 1
fi

wrapped_target="$(readlink -f "$wrapped_path")"
if [[ -z "$wrapped_target" || ! -f "$wrapped_target" ]]; then
  echo "Could not resolve the AppRun.wrapped executable." >&2
  exit 1
fi
chmod 0755 "$wrapped_target"

# Keep the exact runtime produced by the bundler. The upstream continuous
# download is mutable and can no longer be paired with a fixed checksum.
runtime_size="$("$input_appimage" --appimage-offset)"
input_size="$(stat -c %s "$input_appimage")"
if [[ ! "$runtime_size" =~ ^[0-9]+$ ]] || (( runtime_size <= 0 || runtime_size >= input_size )); then
  echo "The AppImage did not report a valid embedded payload offset." >&2
  exit 1
fi
head -c "$runtime_size" "$input_appimage" > "$runtime_path"
chmod 0755 "$runtime_path"

mksquashfs "$app_dir" "$squashfs_path" \
  -all-root \
  -noappend \
  -comp zstd \
  -Xcompression-level 19 \
  -quiet

cat "$runtime_path" "$squashfs_path" >"$repaired_path"
chmod 0755 "$repaired_path"

verify_dir="$work_dir/verify"
mkdir "$verify_dir"
(
  cd "$verify_dir"
  "$repaired_path" --appimage-extract >/dev/null
)

verified_app_dir="$verify_dir/squashfs-root"
verified_wrapped_target="$(readlink -f "$verified_app_dir/AppRun.wrapped")"
if [[ ! -x "$verified_app_dir/AppRun" || ! -x "$verified_wrapped_target" ]]; then
  echo "The repaired AppImage entry points are not executable." >&2
  exit 1
fi

mv "$repaired_path" "$appimage_path"
echo "Repacked AppImage with executable entry points: $appimage_path"
