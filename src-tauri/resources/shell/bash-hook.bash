# Ocote — bash hook (modelo ANSI-PS1 + OSC para decoraciones)
# ---------------------------------------------------------------------------
# Cargado vía `bash --rcfile`. Primero sourcea ~/.bashrc del usuario, luego
# instala el prompt de Ocote: PS1 con ANSI (SIEMPRE visible) + OSC para la
# capa de decoración del frontend (Ribbon/Rail/Block).
#
# Variables inyectadas por Tauri:
#   OCOTE_PROMPT_PRESET  — pill|block|minimal|ribbon|rail|passthrough
#   OCOTE_ACCENT         — hex del accent del tema SIN # (ej. "E8843A")
#   _OCOTE_ZDOTDIR       — HOME real del usuario

# ── 1. Cargar config real del usuario ────────────────────────────────────────
[ -f "${_OCOTE_ZDOTDIR:-$HOME}/.bashrc" ] && source "${_OCOTE_ZDOTDIR:-$HOME}/.bashrc"

# ── 2. passthrough o vacío: no tocar el prompt del usuario ───────────────────
case "$OCOTE_PROMPT_PRESET" in
  pill|block|minimal|ribbon|rail) ;;
  *) return 0 2>/dev/null || true ;;
esac

# ── Colores true-color (\[ \] envuelven secuencias no imprimibles) ───────────
# Convertir el hex del accent a "R;G;B" para las secuencias 38;2;R;G;B.
_OC_A="${OCOTE_ACCENT:-E8843A}"
_OC_AR=$((16#${_OC_A:0:2})); _OC_AG=$((16#${_OC_A:2:2})); _OC_AB=$((16#${_OC_A:4:2}))
_OC_ACC="\[\e[38;2;${_OC_AR};${_OC_AG};${_OC_AB}m\]"  # accent del tema
_OC_GRN='\[\e[38;2;125;201;122m\]'  # git verde
_OC_WRN='\[\e[38;2;232;192;58m\]'   # modificados
_OC_MUT='\[\e[38;2;156;148;128m\]'  # secundario / hora
_OC_RED='\[\e[38;2;232;99;90m\]'    # error
_OC_R='\[\e[0m\]'

# ── Marcadores de ancho-cero a nivel de byte ─────────────────────────────────
# CRÍTICO en bash: \[ \] solo funciona en la cadena PS1 directa, NO dentro de
# command substitution $(...). Para que las funciones dinámicas (git, arrow)
# emitan color SIN que bash cuente los bytes del escape como columnas visibles
# (lo que desfasaría el cursor → texto fantasma/duplicados), hay que envolver
# cada escape en \001 (SOH = "\[") y \002 (STX = "\]").
_OC_Z=$'\001'   # marca inicio de secuencia no-imprimible (= \[)
_OC_X=$'\002'   # marca fin de secuencia no-imprimible    (= \])

# ── git branch (vacío si no es repo) ─────────────────────────────────────────
_ocote_git() {
  local b
  b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return
  [ -z "$b" ] && return
  local dirty
  dirty=$(git status --porcelain 2>/dev/null | grep -c . | tr -d ' ')
  local grn="${_OC_Z}"$'\e[38;2;125;201;122m'"${_OC_X}"
  local wrn="${_OC_Z}"$'\e[38;2;232;192;58m'"${_OC_X}"
  local rst="${_OC_Z}"$'\e[0m'"${_OC_X}"
  #  = rama (Nerd Font); rama + nombre en verde
  local out=" ${grn} ${b}${rst}"
  [ "${dirty:-0}" -gt 0 ] 2>/dev/null && out+=" ${wrn}+${dirty}${rst}"
  printf '%s' "$out"
}

# ── Exit code + chevron dinámico (rojo si el último comando falló) ───────────
_ocote_last_ec=0
_ocote_arrow() {
  local rst="${_OC_Z}"$'\e[0m'"${_OC_X}" c
  if [ "${_ocote_last_ec:-0}" -eq 0 ]; then
    c="${_OC_Z}"$'\e[38;2;'"${_OC_AR};${_OC_AG};${_OC_AB}m""${_OC_X}"
  else
    c="${_OC_Z}"$'\e[38;2;232;99;90m'"${_OC_X}"
  fi
  printf '%s❯%s' "$c" "$rst"
}

# ── PROMPT_COMMAND: captura exit code + emite OSC ────────────────────────────
# Emite 133 D (fin de comando, cursor al final del output) + 6731 (metadata).
# OSC 133 A NO va aquí — va al FINAL de PS1 (después del ❯), igual que en zsh,
# para que el cursor esté en la fila del ❯ cuando el frontend posiciona el overlay.
_ocote_precmd() {
  _ocote_last_ec=$?
  local cwd="${PWD/#$HOME/~}"
  local branch="" dirty=0
  if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
    dirty=$(git status --porcelain 2>/dev/null | grep -c . | tr -d ' ')
  fi
  printf '\033]133;D;%d\007' "$_ocote_last_ec"
  printf '\033]6731;prompt;{"cwd":"%s","branch":"%s","dirty":%d,"time":"%s","exit":%d}\007' \
    "$cwd" "$branch" "${dirty:-0}" "$(date +%H:%M)" "$_ocote_last_ec"
}
PROMPT_COMMAND='_ocote_precmd'

# ── PS1 por preset (BASE ANSI — SIEMPRE visible; el overlay HTML va encima) ──
# \w = ruta con ~ abreviado, \A = hora HH:MM.
# OSC 133 A al final, envuelto en \[ \] (en la cadena PS1 directa sí funciona),
# para overlays de pill/ribbon/rail/block. minimal NO lleva overlay.
_OC_OSC_A='\[\e]133;A\a\]'
_OC_TIME="${_OC_MUT}· \\A${_OC_R}"

case "$OCOTE_PROMPT_PRESET" in
  minimal)
    PS1="${_OC_MUT}\w${_OC_R}\$(_ocote_git) ${_OC_TIME}\n\$(_ocote_arrow) "
    ;;
  ribbon)
    PS1="\[\e[4m\]${_OC_ACC}\w${_OC_R}\[\e[24m\]\$(_ocote_git) ${_OC_TIME}\n\$(_ocote_arrow) ${_OC_OSC_A}"
    ;;
  rail)
    PS1="${_OC_ACC}│${_OC_R} ${_OC_ACC}\w${_OC_R}\$(_ocote_git) ${_OC_TIME}\n\$(_ocote_arrow) ${_OC_OSC_A}"
    ;;
  block)
    PS1="${_OC_ACC}┌─${_OC_R} ${_OC_ACC}\w${_OC_R}\$(_ocote_git) ${_OC_TIME}\n\$(_ocote_arrow) ${_OC_OSC_A}"
    ;;
  *)
    # pill — base de texto; el overlay de cápsulas va encima
    PS1="${_OC_ACC}\w${_OC_R}\$(_ocote_git) ${_OC_TIME}\n\$(_ocote_arrow) ${_OC_OSC_A}"
    ;;
esac

# ── fzf integration (bash) ────────────────────────────────────────────────────
# OCOTE_FZF_BIN es inyectado por pty.rs con el binario correcto para esta plataforma.
# Keybindings activos:
#   Ctrl+R → historial fuzzy (reemplaza el reverse-search estándar de bash)
#   Alt+C  → cd interactivo con fuzzy search  (requiere macOptionIsMeta en xterm.js)
#   Ctrl+T → DESHABILITADO (conflicto con nueva pestaña de Ocote)
if [[ -n "$OCOTE_FZF_BIN" && -x "$OCOTE_FZF_BIN" ]]; then
  # El binario `fzf` vive en resources/bin/<plataforma>/fzf. Añadir ese dir al
  # PATH lo hace un comando real (sin wrapper). Se reasegura aquí por si el
  # .bashrc del usuario reseteó PATH.
  export PATH="${OCOTE_FZF_BIN%/*}:$PATH"
  eval "$(fzf --bash 2>/dev/null)"
  bind -r '"\C-t"' 2>/dev/null
  export FZF_DEFAULT_OPTS="
    --height=40% --layout=reverse --border=rounded
    --prompt='❯ ' --pointer='▶' --marker='✓'
    --color=fg:#C8C0B0,bg:-1,hl:#E8C03A
    --color=fg+:#E2D6BD,bg+:#1C1611,hl+:#E8843A
    --color=border:#524A42,prompt:#E8843A,pointer:#E8843A
    --color=marker:#7DC97A,spinner:#E8843A,header:#6F6552
  "
fi

# ── zoxide (cd inteligente: comando `z`) + bat (disponible como `bat`) ───────
command -v zoxide >/dev/null 2>&1 && eval "$(zoxide init bash)"

# ── Aliases del editor de Ocote (después de la config del usuario) ───────────
[[ -n "$OCOTE_ALIASES" && -f "$OCOTE_ALIASES" ]] && source "$OCOTE_ALIASES"
