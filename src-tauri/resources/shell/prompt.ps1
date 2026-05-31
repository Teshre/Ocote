# Ocote — PowerShell prompt hook
# ---------------------------------------------------------------------------
# Cargado vía:  pwsh -NoExit -Command ". '<ruta>\prompt.ps1'"
# El -Command corre DESPUÉS de los perfiles ($PROFILE) del usuario, así que
# nuestra función prompt y los keybindings sobrescriben los suyos.
#
# PowerShell 7 trae PSReadLine con autosuggestions (PredictionSource) y syntax
# highlighting NATIVOS — como fish, no se bundlean plugins.
#
# Variables inyectadas por Tauri (pty.rs):
#   OCOTE_PROMPT_PRESET — pill|block|minimal|ribbon|rail|passthrough
#   OCOTE_ACCENT        — hex del accent del tema SIN # (ej. E8843A)
#   OCOTE_BIN_DIR       — dir con fzf/zoxide/bat de la plataforma (ya en PATH)

# passthrough o preset desconocido → no tocar el prompt del usuario.
$_ocotePreset = $env:OCOTE_PROMPT_PRESET
if ($_ocotePreset -notin @('pill','block','minimal','ribbon','rail')) { return }

# ── Accent del tema → RGB ─────────────────────────────────────────────────────
$_ocoteAccentHex = if ($env:OCOTE_ACCENT) { $env:OCOTE_ACCENT } else { 'E8843A' }
$script:_ocoteAR = [Convert]::ToInt32($_ocoteAccentHex.Substring(0,2),16)
$script:_ocoteAG = [Convert]::ToInt32($_ocoteAccentHex.Substring(2,2),16)
$script:_ocoteAB = [Convert]::ToInt32($_ocoteAccentHex.Substring(4,2),16)
$script:_ocoteE  = [char]27   # ESC
$script:_ocoteBEL = [char]7   # BEL

# ── PSReadLine: autosuggestions + colores (nativos) ──────────────────────────
if (Get-Module -ListAvailable -Name PSReadLine) {
    Import-Module PSReadLine -ErrorAction SilentlyContinue
    # Texto fantasma gris basado en historial (como fish / zsh-autosuggestions)
    Set-PSReadLineOption -PredictionSource History -ErrorAction SilentlyContinue
    Set-PSReadLineOption -PredictionViewStyle InlineView -ErrorAction SilentlyContinue
    # Color del texto fantasma: muted del tema Ocote
    Set-PSReadLineOption -Colors @{ InlinePrediction = "$($script:_ocoteE)[38;2;111;101;82m" } -ErrorAction SilentlyContinue
}

# ── Prompt ───────────────────────────────────────────────────────────────────
function prompt {
    # Capturar estado del comando anterior ANTES de cualquier otro comando.
    $ok  = $?
    $lec = $LASTEXITCODE
    $ec  = if ($ok) { 0 } elseif ($lec) { $lec } else { 1 }

    $e   = $script:_ocoteE
    $bel = $script:_ocoteBEL
    $ar  = $script:_ocoteAR; $ag = $script:_ocoteAG; $ab = $script:_ocoteAB

    # cwd con ~ abreviado
    $cwd = $PWD.Path
    if ($HOME -and $cwd.StartsWith($HOME)) {
        $cwd = '~' + $cwd.Substring($HOME.Length)
    }
    $cwd = $cwd -replace '\\','/'   # normalizar separadores para mostrar

    # git (silencioso si no es repo)
    $branch = (git symbolic-ref --short HEAD 2>$null)
    if (-not $branch) { $branch = (git rev-parse --short HEAD 2>$null) }
    $dirty = 0
    if ($branch) {
        $dirty = @(git status --porcelain 2>$null).Count
    }
    $now = Get-Date -Format 'HH:mm'

    # ── OSC: fin de comando (133 D) + metadata (6731) ────────────────────────
    # Se emiten como side-effect (Write-Host), NO forman parte del string del
    # prompt → no afectan el cálculo de ancho de PSReadLine.
    $osc = "$e]133;D;$ec$bel"
    $branchJson = if ($branch) { $branch } else { '' }
    $osc += "$e]6731;prompt;{`"cwd`":`"$cwd`",`"branch`":`"$branchJson`",`"dirty`":$dirty,`"time`":`"$now`",`"exit`":$ec}$bel"
    Write-Host -NoNewline $osc

    # ── Línea info (ANSI fallback; el overlay HTML va encima en pill/etc) ────
    $acc = "$e[38;2;$ar;$ag;${ab}m"
    $grn = "$e[38;2;125;201;122m"
    $wrn = "$e[38;2;232;192;58m"
    $mut = "$e[38;2;156;148;128m"
    $red = "$e[38;2;232;99;90m"
    $rst = "$e[0m"

    $line = ''
    switch ($_ocotePreset) {
        'rail'  { $line += "$acc$([char]0x2502) $rst" }      # │
        'block' { $line += "$acc$([char]0x250C)$([char]0x2500) $rst" }  # ┌─
    }
    $line += "$acc$cwd$rst"
    if ($branch) {
        $line += " $grn$([char]0xE0A0) $branch$rst"          #  rama
        if ($dirty -gt 0) { $line += " $wrn+$dirty$rst" }
    }
    $line += " $mut$([char]0x00B7) $now$rst`n"               # ·

    # ── Chevron (rojo si falló) + OSC 133 A al final ─────────────────────────
    $chev = if ($ec -eq 0) { $acc } else { $red }
    $line += "$chev$([char]0x276F)$rst "                      # ❯
    # OSC 133 A: posiciona el overlay. minimal no lleva overlay.
    if ($_ocotePreset -ne 'minimal') {
        $line += "$e]133;A$bel"
    }
    return $line
}

# ── fzf integration (PowerShell) ─────────────────────────────────────────────
# fzf NO tiene integración nativa de PowerShell (no hay `fzf --powershell`).
# Definimos handlers manuales de PSReadLine.
#   Ctrl+R → búsqueda fuzzy en historial
#   Alt+C  → cd fuzzy de directorios
#   Ctrl+T → NO se mapea (Ocote lo usa para nueva pestaña)
if ((Get-Command fzf -ErrorAction SilentlyContinue) -and (Get-Command Set-PSReadLineKeyHandler -ErrorAction SilentlyContinue)) {
    $env:FZF_DEFAULT_OPTS = "--height=40% --layout=reverse --border=rounded --prompt='$([char]0x276F) ' --color=fg:#C8C0B0,bg:-1,hl:#E8C03A --color=fg+:#E2D6BD,bg+:#1C1611,hl+:#E8843A --color=border:#524A42,prompt:#E8843A,pointer:#E8843A --color=marker:#7DC97A,spinner:#E8843A,header:#6F6552"

    # Ctrl+R — historial fuzzy (más reciente primero, sin duplicados)
    Set-PSReadLineKeyHandler -Key Ctrl+r -ScriptBlock {
        $histPath = (Get-PSReadLineOption).HistorySavePath
        if (-not (Test-Path $histPath)) { return }
        $lines = [System.IO.File]::ReadAllLines($histPath)
        [array]::Reverse($lines)
        $sel = $lines | Where-Object { $_ -and $_ -notmatch '^\s*$' } |
            Select-Object -Unique | fzf --no-sort
        if ($sel) {
            [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
            [Microsoft.PowerShell.PSConsoleReadLine]::Insert($sel)
        }
    }

    # Alt+C — cd fuzzy de subdirectorios
    Set-PSReadLineKeyHandler -Key Alt+c -ScriptBlock {
        $dir = Get-ChildItem -Directory -Recurse -Depth 4 -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '[\\/]\.' } |
            ForEach-Object { Resolve-Path -Relative $_.FullName } |
            fzf
        if ($dir) {
            Set-Location $dir
            [Microsoft.PowerShell.PSConsoleReadLine]::InvokePrompt()
        }
    }
}

# ── zoxide (cd inteligente: comando `z`) ─────────────────────────────────────
if (Get-Command zoxide -ErrorAction SilentlyContinue) {
    Invoke-Expression (& { (zoxide init powershell | Out-String) })
}
