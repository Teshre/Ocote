# Ocote — prompt ANSI para zsh
# ---------------------------------------------------------------------------
# Cada preset tiene su propia línea de info en ANSI true-color.
# NO se usa la Decoration API de xterm.js — todo es texto del shell.
# Los OSC 133 B/D y 6731 se conservan solo para integración futura.
#
# Lee:
#   OCOTE_PROMPT_PRESET = pill|block|minimal|ribbon|rail|passthrough
#   OCOTE_ACCENT        = hex del accent del tema activo SIN # (ej. "E8843A")

case "$OCOTE_PROMPT_PRESET" in
  pill|block|minimal|ribbon|rail) ;;
  *) return 0 ;;
esac

# ── Tomar control del prompt ───────────────────────────────────────────────
precmd_functions=()
preexec_functions=()
RPROMPT=''
setopt PROMPT_SUBST
autoload -Uz add-zsh-hook vcs_info

# ── Colores ANSI ───────────────────────────────────────────────────────────
_HEX="${OCOTE_ACCENT:-E8843A}"
_ACC="%F{#${_HEX}}"
_GRN='%F{#7DC97A}'
_WRN='%F{#E8C03A}'
_MUT='%F{#9C9480}'
_RED='%F{#E8635A}'
_INK='%F{#1A1611}'
_R='%f'

# ── git vía vcs_info ──────────────────────────────────────────────────────
zstyle ':vcs_info:*' enable git
zstyle ':vcs_info:git:*' formats       "%b"
zstyle ':vcs_info:git:*' actionformats "%b|%a"

typeset -g _OCOTE_GIT=''
typeset -g _OCOTE_TIME=''

_ocote_path_short() {
  local p="${PWD/#$HOME/~}"
  [[ "$p" == "~" ]] && print -nr -- "~" || print -nr -- "~/${PWD:t}"
}

_ocote_build_git() {
  _OCOTE_GIT=''
  _OCOTE_TIME="$(date +%H:%M)"
  [[ -z "$vcs_info_msg_0_" ]] && return

  local dirty count=''
  dirty=$(git status --porcelain 2>/dev/null | grep -c . | tr -d ' ')
  [[ "$dirty" -gt 0 ]] 2>/dev/null && count=" ${_WRN}+${dirty}${_R}"

  case "$OCOTE_PROMPT_PRESET" in
    pill)
      # Cápsulas tipográficas ◖◗ en verde para el git
      _OCOTE_GIT=" ${_GRN}◖ ${vcs_info_msg_0_}${count} ${_GRN}◗${_R}"
      ;;
    ribbon)
      _OCOTE_GIT=" ${_MUT}·${_R} ${_GRN}${vcs_info_msg_0_}${_R}${count}"
      ;;
    rail)
      _OCOTE_GIT=" ${_MUT}·${_R} ${_GRN}${vcs_info_msg_0_}${_R}${count}"
      ;;
    block)
      _OCOTE_GIT=" ${_MUT}·${_R} ${_GRN}${vcs_info_msg_0_}${_R}${count}"
      ;;
    *)
      # minimal
      _OCOTE_GIT=" ${_GRN}${vcs_info_msg_0_}${_R}${count}"
      ;;
  esac
}

# ── OSC: integración de shell (para uso futuro, NO renderiza visuals) ─────
# OSC 6731 — metadata del prompt (path, branch, time, exit code)
_ocote_emit_osc() {
  local exit_code=$1
  local cwd="${PWD/#$HOME/~}"
  local branch="${vcs_info_msg_0_}"
  local dirty=0
  [[ -n "$branch" ]] && dirty=$(git status --porcelain 2>/dev/null | grep -c . | tr -d ' ')
  printf '\033]6731;prompt;{"cwd":"%s","branch":"%s","dirty":%d,"time":"%s","exit":%d}\007' \
    "$cwd" "$branch" "${dirty:-0}" "$(date +%H:%M)" "$exit_code"
}

_ocote_precmd() {
  local ec=$?
  vcs_info
  _ocote_build_git
  typeset -g _OCOTE_PATH_SHORT="$(_ocote_path_short)"
  printf '\033]133;D;%d\007' "$ec"   # fin de comando (shell integration)
  _ocote_emit_osc "$ec"
}
_ocote_preexec() { printf '\033]133;B\007'; }
add-zsh-hook precmd  _ocote_precmd
add-zsh-hook preexec _ocote_preexec

# ── Chevron dinámico (rojo si el último comando falló) ───────────────────
_ARR='%(?:'"${_ACC}❯${_R}"':'"${_RED}❯${_R}"') '

# ── PS1 por preset — ANSI true-color, sin Decoration API ─────────────────
#
# Estructura de cada preset (2 líneas):
#   Línea 1 (info): path · git · hora   ← diferente estilo visual por preset
#   Línea 2 (input): ❯ cursor           ← común a todos
#
# PROMPT_SUBST activo: \${VAR} se expande en cada presentación del prompt.
# ${_ACC} etc. se expanden en la asignación (son strings de color, correcto).

case "$OCOTE_PROMPT_PRESET" in

  minimal)
    # ANSI puro — sin overlay HTML.
    PROMPT="${_MUT}%~${_R}\${_OCOTE_GIT} ${_MUT}· \${_OCOTE_TIME}${_R}"$'\n'"${_ARR}"
    ;;

  pill)
    # OSC 133 A al FINAL (después de ❯).
    # Con requestAnimationFrame en terminal.js, cuando el rAF corre el write()
    # completó y buf.cursorY apunta a la fila ❯ → infoAbsRow = fila❯ - 1. ✓
    PROMPT="%K{#3D1A06}${_ACC} \${_OCOTE_PATH_SHORT} %k\${_OCOTE_GIT} ${_MUT}· \${_OCOTE_TIME}${_R}"$'\n'"${_ARR}"$'%{\033]133;A\007%}'
    ;;

  ribbon)
    # %{$'\e[4m'%} y ${_ACC} separados — NO mezclar %{%} con %F{} adentro.
    PROMPT="%{$'\e[4m'%}${_ACC}\${_OCOTE_PATH_SHORT}%{$'\e[24m'%}${_R}\${_OCOTE_GIT} ${_MUT}· \${_OCOTE_TIME}${_R}"$'\n'"${_ARR}"$'%{\033]133;A\007%}'
    ;;

  rail)
    PROMPT="${_ACC}│${_R} ${_ACC}\${_OCOTE_PATH_SHORT}${_R}\${_OCOTE_GIT} ${_MUT}· \${_OCOTE_TIME}${_R}"$'\n'"${_ARR}"$'%{\033]133;A\007%}'
    ;;

  block)
    PROMPT="${_ACC}┌─${_R} ${_ACC}\${_OCOTE_PATH_SHORT}${_R}\${_OCOTE_GIT} ${_MUT}· \${_OCOTE_TIME}${_R}"$'\n'"${_ARR}"$'%{\033]133;A\007%}'
    ;;

esac

# ── Plugins bundleados ────────────────────────────────────────────────────────
# fzf se carga aquí. zsh-autosuggestions se carga en .zshrc AL FINAL (después de
# syntax-highlighting) — ese orden es CRÍTICO: si autosuggestions cargara antes
# que syntax-highlighting, al aceptar una sugerencia con → el texto se quedaría
# gris (syntax-highlighting no lo re-colorea). Ver .zshrc para el detalle.

# fzf — fuzzy finder
# OCOTE_FZF_BIN es inyectado por pty.rs con el binario correcto para esta plataforma.
# Keybindings activos:
#   Ctrl+R  → búsqueda fuzzy en historial  (más potente que la búsqueda estándar)
#   Alt+C   → cd interactivo con fuzzy search de directorios
#   Ctrl+T  → DESHABILITADO (conflicto con Ctrl+T = nueva pestaña en Ocote)
if [[ -n "$OCOTE_FZF_BIN" && -x "$OCOTE_FZF_BIN" ]]; then
  # El binario `fzf` vive en un subdir por plataforma (resources/bin/<plat>/fzf).
  # Añadir ese dir al PATH lo hace un comando real (sin función wrapper) — así
  # `fzf` funciona en pipas, subshells y la integración de cada shell.
  # Se hace en el hook (no solo en pty.rs) por si el config del usuario reseteó PATH.
  export PATH="${OCOTE_FZF_BIN%/*}:$PATH"

  # fzf --zsh genera el código de integración para zsh (keybindings + completion)
  eval "$(fzf --zsh 2>/dev/null)"

  # Tab (^I): fzf lo reasigna a fzf-completion, lo restauramos al completado
  # normal de zsh. Así Tab completa normalmente y no entra en conflicto con
  # las sugerencias de autosuggestions.
  # Usamos fzf solo para Ctrl+R (historial) y Alt+C (cd fuzzy).
  bindkey "^I" expand-or-complete

  # Ctrl+T: quitar — conflicto con nueva pestaña de Ocote
  bindkey -r "^T" 2>/dev/null

  # Alt+C: comando de búsqueda de directorios para el cd fuzzy.
  # find -L incluye symlinks; -mindepth 1 excluye el directorio actual;
  # -maxdepth 5 evita búsquedas infinitas en repos grandes.
  export FZF_ALT_C_COMMAND="find -L . -mindepth 1 -maxdepth 5 -type d -not -path '*/.*' 2>/dev/null"

  # Colores de fzf: paleta Ocote (funciona en todos los temas de color)
  export FZF_DEFAULT_OPTS="
    --height=40% --layout=reverse --border=rounded
    --prompt='❯ ' --pointer='▶' --marker='✓'
    --color=fg:#C8C0B0,bg:-1,hl:#E8C03A
    --color=fg+:#E2D6BD,bg+:#1C1611,hl+:#E8843A
    --color=border:#524A42,prompt:#E8843A,pointer:#E8843A
    --color=marker:#7DC97A,spinner:#E8843A,header:#6F6552
  "
fi

# ── zoxide (cd inteligente: comando `z`) + bat (cat mejorado) ─────────────────
# Ambos viven en el mismo dir que fzf (ya en PATH). bat queda disponible como
# comando `bat` sin aliasear cat (preserva la enseñanza del CKB). zoxide aporta
# `z <dir>` para saltar a directorios frecuentes.
command -v zoxide >/dev/null 2>&1 && eval "$(zoxide init zsh)"
