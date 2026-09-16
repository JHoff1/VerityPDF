; Keep this key aligned with bundle.publisher, not the app identifier.
; GUIINIT is deliberately used instead of PREINSTALL: Tauri's uninstall-first
; page executes BEFORE the installation section and needs the repaired key.
!define MUI_CUSTOMFUNCTION_GUIINIT VerityRestoreUpgradePath
!ifndef VERITY_UNINSTALL_KEY
  !define VERITY_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VerityPDF"
  !define VERITY_CURRENT_KEY "Software\veritypdf\VerityPDF"
  !define VERITY_LEGACY_KEY "Software\sovereignpdf\VerityPDF"
!endif

!macro VerityTryUpgradePath key value
  ReadRegStr $R0 HKCU "${key}" "${value}"
  StrCpy $R1 $R0 1
  StrCpy $R2 $R0 1 -1
  ${If} $R1 == '$\"'
  ${AndIf} $R2 == '$\"'
    StrCpy $R0 $R0 -1 1
  ${EndIf}
  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$R0\uninstall.exe"
    ; Only trust a directory matching the registered NSIS uninstaller.
    ; Never synthesize an uninstall target from the app identifier alone.
    ${If} $R3 == '$\"$R0\uninstall.exe$\"'
    ${OrIf} $R3 == "$R0\uninstall.exe"
      Goto verity_path_found
    ${EndIf}
  ${EndIf}
!macroend

Function VerityRestoreUpgradePath
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  ReadRegStr $R3 HKCU "${VERITY_UNINSTALL_KEY}" "UninstallString"
  ${If} $R3 == ""
    Goto verity_path_done
  ${EndIf}
  ; The registered installation wins over remembered directories from older
  ; installations. Preserve custom folders (including paths with spaces).
  !insertmacro VerityTryUpgradePath "${VERITY_UNINSTALL_KEY}" "InstallLocation"
  !insertmacro VerityTryUpgradePath "${VERITY_CURRENT_KEY}" ""
  !insertmacro VerityTryUpgradePath "${VERITY_LEGACY_KEY}" ""
  MessageBox MB_ICONSTOP "VerityPDF found an existing installation, but could not verify its uninstaller folder. Please uninstall that copy through Windows Settings, then run this installer again. No application files have been changed." /SD IDOK
  SetErrorLevel 2
  Abort

  verity_path_found:
    WriteRegStr HKCU "${VERITY_CURRENT_KEY}" "" $R0
    StrCpy $INSTDIR $R0
  verity_path_done:
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installers skip GUIINIT. Retain their existing /D override behavior,
  ; but resolve the old folder when no custom destination was selected.
  ${If} ${Silent}
  ${AndIf} $INSTDIR == "$LOCALAPPDATA\VerityPDF"
    Call VerityRestoreUpgradePath
  ${EndIf}
!macroend
