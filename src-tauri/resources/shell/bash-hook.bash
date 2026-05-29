# Ocote — bash hook
# ---------------------------------------------------------------------------
# Cargado vía bash --rcfile. Primero sourcea ~/.bashrc del usuario, luego
# instala los hooks de Ocote (OSC 6731 + OSC 133).
#
# Variables inyectadas por Tauri:
#   OCOTE_PROMPT_PRESET  — preset elegido
#   OCOTE_ACCENT         — hex del accent (sin #)
#   _OCOTE_ZDOTDIR       — HOME real del usuario

# ── 1. Cargar config real del usuario ────────────────────────────────────────
[ -f "${_OCOTE_ZDOTDIR:-$HOME}/.bashrc" ] && source "${_OCOTE_ZDOTDIR:-$HOME}/.bashrc"

# ── 2. passthrough: no tocar el prompt ───────────────────────────────────────
[ "${OCOTE_PROMPT_PRESET}" = "passthrough" ] && return 0

# ── 3. Hooks ──────────────────────────────────────────────────────────────────
_ocote_last_ec=0

_ocote_precmd() {
  _ocote_last_ec=$?
  printf '\033]133;D;%d\007' "$_ocote_last_ec"

  local cwd="${PWD/#$HOME/~}"
  local branch="" dirty=0
  if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
    dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  fi

  printf '\033]6731;prompt;{"cwd":"%s","branch":"%s","dirty":%s,"time":"%s","exit":%d}\007' \
    "$cwd" "${branch}" "${dirty:-0}" "$(date +%H:%M)" "$_ocote_last_ec"

  printf '\033]133;A\007'
}

_ocote_preexec() { printf '\033]133;B\007'; }

_OC_A="${OCOTE_ACCENT:-E8843A}"

# ── 4. PS1 según preset ───────────────────────────────────────────────────────
if [ "${OCOTE_PROMPT_PRESET}" = "minimal" ]; then
  # Minimal: PS1 completo con ANSI true-color
  _ocote_git_ps1() {
    local b
    b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return
    printf ' \e[38;2;125;201;122m%s\e[0m' "$b"
  }
  _ocote_arrow() {
    if [ "${_ocote_last_ec:-0}" -eq 0 ]; then
      printf '\e[38;2;%d;%d;%dm❯\e[0m' \
        "$(printf '%d' "0x${_OC_A:0:2}")" \
        "$(printf '%d' "0x${_OC_A:2:2}")" \
        "$(printf '%d' "0x${_OC_A:4:2}")"
    else
      printf '\e[38;2;232;99;90m❯\e[0m'
    fi
  }
  PROMPT_COMMAND='_ocote_precmd'
  PS1='\[\e[38;2;130;166;224m\]\w\[\e[0m\]$(_ocote_git_ps1)\n$(_ocote_arrow) '
else
  # Presets con decoración (Pill/Block/Ribbon/Rail)
  PROMPT_COMMAND='_ocote_precmd'
  PS1='\n$(_ocote_arrow) '
fi
