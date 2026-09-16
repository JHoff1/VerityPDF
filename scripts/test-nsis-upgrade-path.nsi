Unicode true
RequestExecutionLevel user
SilentInstall silent
!include LogicLib.nsh
!include MUI2.nsh
!define VERITY_UNINSTALL_KEY "Software\VerityPDFInstallerTests\${TEST_ID}\Uninstall"
!define VERITY_CURRENT_KEY "Software\VerityPDFInstallerTests\${TEST_ID}\Current"
!define VERITY_LEGACY_KEY "Software\VerityPDFInstallerTests\${TEST_ID}\Legacy"
!include "${HOOK_FILE}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
OutFile "${TEST_OUTPUT}"

Section
  InitPluginsDir
  StrCpy $9 "$PLUGINSDIR\Custom Folder With Spaces"
  CreateDirectory "$9"
  FileOpen $0 "$9\uninstall.exe" w
  FileWrite $0 "Fixture only; never executed."
  FileClose $0

  ; Legacy fallback with a stale current entry.
  WriteRegStr HKCU "${VERITY_UNINSTALL_KEY}" "UninstallString" '$\"$9\uninstall.exe$\"'
  WriteRegStr HKCU "${VERITY_CURRENT_KEY}" "" "$PLUGINSDIR\Stale"
  WriteRegStr HKCU "${VERITY_LEGACY_KEY}" "" $9
  Call VerityRestoreUpgradePath
  StrCmp $INSTDIR $9 0 failed
  ReadRegStr $0 HKCU "${VERITY_CURRENT_KEY}" ""
  StrCmp $0 $9 0 failed

  ; Newer installs and quoted InstallLocation both resolve correctly.
  DeleteRegKey HKCU "${VERITY_LEGACY_KEY}"
  Call VerityRestoreUpgradePath
  StrCmp $INSTDIR $9 0 failed
  WriteRegStr HKCU "${VERITY_CURRENT_KEY}" "" "$PLUGINSDIR\Stale"
  WriteRegStr HKCU "${VERITY_UNINSTALL_KEY}" "InstallLocation" '$\"$9$\"'
  Call VerityRestoreUpgradePath
  StrCmp $INSTDIR $9 0 failed

  ; Fresh installs do not acquire an unrelated remembered folder.
  DeleteRegKey HKCU "${VERITY_UNINSTALL_KEY}"
  StrCpy $INSTDIR "fresh-install-sentinel"
  Call VerityRestoreUpgradePath
  StrCmp $INSTDIR "fresh-install-sentinel" 0 failed
  DeleteRegKey HKCU "Software\VerityPDFInstallerTests\${TEST_ID}"
  SetErrorLevel 0
  Goto done
  failed:
  DeleteRegKey HKCU "Software\VerityPDFInstallerTests\${TEST_ID}"
  SetErrorLevel 1
  done:
SectionEnd
