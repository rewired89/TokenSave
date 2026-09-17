; save-tokens.ahk — AutoHotkey v1
;
; STATUS: statically reviewed and hardened, NOT executed on a real Windows
; machine — this sandbox is Linux-only with no Windows host to run AutoHotkey
; against, so the clipboard-timing behavior below is reasoned about from
; AutoHotkey v1's documented Send/Clipboard/ClipWait semantics, not measured.
; That gap is real; verify on your own machine before relying on it, and see
; README.md in this directory for exactly what to check.
;
; Usage: type your draft in ANY text box, select it, press Ctrl+Alt+D before
; hitting Enter. It copies the selection, runs it through the same tested
; compress.js logic via Node (cli.js), and pastes the result back in place
; of your draft.
;
; Requires: Node.js on PATH, cli.js and compress.js in the path set below.

#NoEnv
#SingleInstance Force
SendMode Input
SetWorkingDir %A_ScriptDir%

ScriptDir := "C:\Users\rewired89\save-tokens"  ; <-- change to wherever you put cli.js

^!d::
    ; --- 1. Copy the current selection, with retry/backoff. ---
    ; A single ClipWait after one Send,^c assumes the ^c was received and
    ; processed the first time. On a slow machine (focus not settled yet,
    ; a laggy app, clipboard owned by another process momentarily) that copy
    ; can silently no-op, and ClipWait then either times out or — worse —
    ; succeeds immediately because the clipboard already held something else
    ; from before. Clearing the clipboard first and retrying the copy itself
    ; closes that second failure mode, not just the timeout.
    ClipboardOld := ClipboardAll
    gotClip := false
    delays := "100,300,600,1000"
    StringSplit, delayArr, delays, `,
    Loop, 4
    {
        Clipboard := ""
        Send, ^a
        Send, ^c
        ClipWait, 1.5
        if !ErrorLevel
        {
            gotClip := true
            break
        }
        delayVar := delayArr%A_Index%
        Sleep, %delayVar%
    }

    if !gotClip
    {
        MsgBox, 48, Save Tokens, Could not read the selection — clipboard timed out after 4 attempts.`n`nYour original text was left untouched.
        Clipboard := ClipboardOld
        return
    }

    ; --- 2. Run the draft through compress.js via Node. ---
    draft := Clipboard
    tempIn := A_Temp . "\st_draft.txt"
    tempOut := A_Temp . "\st_out.txt"
    FileDelete, %tempIn%
    FileDelete, %tempOut%
    FileAppend, %draft%, %tempIn%, UTF-8

    RunWait, %ComSpec% /c node "%ScriptDir%\cli.js" < "%tempIn%" > "%tempOut%" 2>NUL, , Hide
    nodeExitCode := ErrorLevel

    FileRead, distilled, %tempOut%
    fileReadFailed := ErrorLevel

    if (nodeExitCode or fileReadFailed or distilled = "")
    {
        MsgBox, 48, Save Tokens, Compression failed (node exit code: %nodeExitCode%) — leaving your draft untouched.`n`nCheck that Node.js is on PATH and that cli.js/compress.js exist at:`n%ScriptDir%
        Clipboard := ClipboardOld
        return
    }

    ; --- 3. Paste the distilled draft back in place of the selection. ---
    Clipboard := distilled
    Send, ^v

    ; Give the target app a moment to actually read the pasted clipboard
    ; content before it gets overwritten with the restored original —
    ; pasting is not guaranteed synchronous in every app, and restoring the
    ; clipboard too eagerly is the other classic source of "it worked when I
    ; single-stepped it but not at full speed" clipboard bugs.
    Sleep, 250
    Clipboard := ClipboardOld
return
