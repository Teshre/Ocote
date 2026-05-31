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

# ── git branch (vacío si no es repo) ─────────────────────────────────────────
_ocote_git() {
  local b
  b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return
  [ -z "$b" ] && return
  local dirty count=''
  dirty=$(git status --porcelain 2>/dev/null | grep -c . | tr -d ' ')
  [ "${dirty:-0}" -gt 0 ] 2>/dev/null && count=$' \e[38;2;232;192;58m+'"${dirty}"$'\e[0m'
  #  = rama Powerline (Nerd Font)
  printf ' \e[38;2;125;201;122m \e[0m\e[38;2;125;201;122m%s\e[0m%b' "$b" "$count"
}

# ── Exit code + chevron dinámico ─────────────────────────────────────────────
_ocote_last_ec=0
_ocote_arrow() {
  if [ "${_ocote_last_ec:-0}" -eq 0 ]; then
    printf '\e[38;2;%d;%d;%dm❯\e[0m' "$_OC_AR" "$_OC_AG" "$_OC_AB"
  else
    printf '\e[38;2;232;99;90m❯\e[0m'
  fi
}

# ── PROMPT_COMMAND: captura exit code + emite OSC ────────────────────────────
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
  printf '\033]133;A\007'
}
PROMPT_COMMAND='_ocote_precmd'

# ── PS1 por preset (BASE ANSI — SIEMPRE visible) ─────────────────────────────
# \w = ruta completa, \W = basename. $(_ocote_git) y $(_ocote_arrow) dinámicos.
case "$OCOTE_PROMPT_PRESET" in
  minimal)
    PS1="${_OC_ACC}\w${_OC_R}\$(_ocote_git)\n\$(_ocote_arrow) "
    ;;
  ribbon)
    PS1="${_OC_ACC}\w${_OC_R}\$(_ocote_git) ${_OC_MUT}· \t${_OC_R}\n\$(_ocote_arrow) "
    ;;
  *)
    # pill / rail / block — base de texto (el chrome lo añade el frontend)
    PS1="${_OC_ACC}\w${_OC_R}\$(_ocote_git)\n\$(_ocote_arrow) "
    ;;
esac

# ── fzf integration (bash) ────────────────────────────────────────────────────
# OCOTE_FZF_BIN es inyectado por pty.rs con el binario correcto para esta plataforma.
# Keybindings activos:
#   Ctrl+R → historial fuzzy (reemplaza el reverse-search estándar de bash)
#   Alt+C  → cd interactivo con fuzzy search  (requiere macOptionIsMeta en xterm.js)
#   Ctrl+T → DESHABILITADO (conflicto con nueva pestaña de Ocote)
if [[ -n "$OCOTE_FZF_BIN" && -x "$OCOTE_FZF_BIN" ]]; then
  # Wrapper 'fzf' → binario real (el binario está nombrado fzf-linux-x64 etc.)
  fzf() { command "$OCOTE_FZF_BIN" "$@"; }
  export -f fzf  # exportar la función a subshells (pipas, subcomandos)
  eval "$("$OCOTE_FZF_BIN" --bash 2>/dev/null)"
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
