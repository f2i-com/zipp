; Zipp Custom NSIS Installer Hooks
; Configures the app to use bundled plugins from the install location

; Include word functions for string replacement
!include "WordFunc.nsh"

; ============================================
; Post-Install Hook - Configure Plugins Path
; ============================================

!macro NSIS_HOOK_POSTINSTALL
  ; Create the plugins directory in AppData
  CreateDirectory "$APPDATA\zipp\plugins"
  CreateDirectory "$APPDATA\zipp\tts"

  ; Copy plugins from install location (resources/plugins) to AppData
  ; /r = recursive, /Kw = keep newer files (if user modified them, don't overwrite if older?)
  ; actually straightforward copy is safer for now to ensure fresh install gets the plugins
  
  DetailPrint "Copying bundled plugins to $APPDATA\zipp\plugins..."
  
  ; Check if source exists
  IfFileExists "$INSTDIR\resources\plugins\*" 0 SkipPluginsCopy

    ; Copy all files and directories recursively
    ; Removed /FILESONLY because plugins are directories!
    CopyFiles /SILENT "$INSTDIR\resources\plugins\*" "$APPDATA\zipp\plugins"
    
    DetailPrint "Plugins copied successfully"

  SkipPluginsCopy:

  ; Copy TTS models from install location to AppData
  DetailPrint "Copying TTS models to $APPDATA\zipp\tts..."

  IfFileExists "$INSTDIR\resources\tts\*" 0 SkipTTSCopy
    CopyFiles /SILENT "$INSTDIR\resources\tts\*" "$APPDATA\zipp\tts"
    DetailPrint "TTS models copied successfully"
  SkipTTSCopy:

  ; Copy AI services from install location to AppData
  DetailPrint "Copying AI services to $APPDATA\zipp\services..."
  CreateDirectory "$APPDATA\zipp\services"

  IfFileExists "$INSTDIR\resources\services\*" 0 SkipServicesCopy
    CopyFiles /SILENT "$INSTDIR\resources\services\*" "$APPDATA\zipp\services"
    DetailPrint "AI services copied successfully"
  SkipServicesCopy:

  ; Copy ffmpeg/ffprobe to AppData/zipp/bin with standard names
  ; Tauri externalBin files are in $INSTDIR with platform-specific names
  DetailPrint "Setting up ffmpeg for AI services..."
  CreateDirectory "$APPDATA\zipp\bin"

  ; Copy ffmpeg (Tauri uses platform-specific suffix)
  IfFileExists "$INSTDIR\ffmpeg-x86_64-pc-windows-msvc.exe" 0 SkipFfmpegCopy
    CopyFiles /SILENT "$INSTDIR\ffmpeg-x86_64-pc-windows-msvc.exe" "$APPDATA\zipp\bin\ffmpeg.exe"
    DetailPrint "ffmpeg copied to $APPDATA\zipp\bin"
  SkipFfmpegCopy:

  ; Copy ffprobe
  IfFileExists "$INSTDIR\ffprobe-x86_64-pc-windows-msvc.exe" 0 SkipFfprobeCopy
    CopyFiles /SILENT "$INSTDIR\ffprobe-x86_64-pc-windows-msvc.exe" "$APPDATA\zipp\bin\ffprobe.exe"
    DetailPrint "ffprobe copied to $APPDATA\zipp\bin"
  SkipFfprobeCopy:
!macroend

; ============================================
; Uninstall Hook - Clean Up Config
; ============================================

!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_YESNO "Do you want to remove Zipp configuration and data?$\r$\n$\r$\nNote: This will delete settings, saved flows, and any custom plugins you've added." IDNO SkipConfigRemove
    RMDir /r "$APPDATA\zipp"
    DetailPrint "Removed Zipp configuration directory"
  SkipConfigRemove:
!macroend
