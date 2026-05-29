# Ocote — prompt nativo para zsh (modelo ANSI-PS1 + OSC para decoraciones)
# ---------------------------------------------------------------------------
# Filosofía: el PS1 con ANSI SIEMPRE pinta un prompt visible (aunque el JS
# falle). Las decoraciones del frontend (Ribbon/Rail/Block) son una capa
# ADITIVA de chrome geométrico encima, no el prompt en sí.
#
# Lee:
#   OCOTE_PROMPT_PRESET = pill|block|minimal|ribbon|rail|passthrough
#   OCOTE_ACCENT        = hex del accent del tema activo SIN # (ej. "E8843A")

# passthrough o vacío → respetar el prompt del usuario (p10k, omz…). No tocar.
case "$OCOTE_PROMPT_PRESET" in
  pill|block|minimal|ribbon|rail) ;;
  *) return 0 ;;
esac

# ── Tomar control del prompt ───────────────────────────────────────────────
# Quitar hooks de p10k/oh-my-zsh que redibujan el prompt (causaban fantasma).
# Aliases, PATH y funciones del usuario se conservan: solo eliminamos hooks.
precmd_functions=()
preexec_functions=()
RPROMPT=''
setopt PROMPT_SUBST
autoload -Uz add-zsh-hook vcs_info

# ── Colores ────────────────────────────────────────────────────────────────
# El accent viene del tema activo; el resto son colores semánticos fijos
# alineados a la paleta de Ocote. _HEX se reutiliza en cápsulas %K{}.
_HEX="${OCOTE_ACCENT:-E8843A}"
_ACC="%F{#${_HEX}}"   # accent del tema (path / chevron / chrome)
_GRN='%F{#7DC97A}'    # git (verde, fijo semánticamente)
_WRN='%F{#E8C03A}'    # archivos modificados
_MUT='%F{#9C9480}'    # secundario / hora / separadores
_RED='%F{#E8635A}'    # error
_R='%f'

# ── git branch vía vcs_info ──────────────────────────────────────────────────
zstyle ':vcs_info:*' enable git
zstyle ':vcs_info:git:*' formats       "%b"
zstyle ':vcs_info:git:*' actionformats "%b|%a"

# ── Estado git renderizado: lo construye precmd en una variable PLANA ────────
# Clave: NO anidamos %F{...} dentro de ${var:+...} en el PS1 (los {} de %F{}
# rompen el conteo de llaves de zsh y dejan un "}" basura). En su lugar, precmd
# arma el segmento completo y PS1 solo lo referencia con ${_OCOTE_GIT}.
typeset -g _OCOTE_GIT=''

_ocote_build_git() {
  _OCOTE_GIT=''
  [[ -z "$vcs_info_msg_0_" ]] && return
  local dirty count=''
  dirty=$(git status --porcelain 2>/dev/null | grep -c . | tr -d ' ')
  [[ "$dirty" -gt 0 ]] 2>/dev/null && count=" ${_WRN}+${dirty}${_R}"

  case "$OCOTE_PROMPT_PRESET" in
    pill)
      #  cap_izq [ rama ] cap_der  con fondo verde, texto charcoal.
      _OCOTE_GIT=" %F{#7DC97A}%K{#7DC97A}%F{#1A1611}  ${vcs_info_msg_0_} %k%F{#7DC97A}${_R}"
      ;;
    ribbon)
      # " · main"  (separador muted + rama verde)
      _OCOTE_GIT=" ${_MUT}·${_R} ${_GRN}${vcs_info_msg_0_}${_R}${count}"
      ;;
    *)
      # minimal / rail / block: "  main"  (ícono rama Powerline + nombre)
      _OCOTE_GIT=" ${_GRN} ${vcs_info_msg_0_}${_R}${count}"
      ;;
  esac
}

# ── OSC: datos estructurados + marcadores de shell-integration ───────────────
# El frontend (prompt.js) los usa para la CAPA de decoración (Ribbon/Rail/Block).
# Si el JS no hace nada con ellos, no pasa nada: el PS1 ANSI ya es visible.
_ocote_emit_osc() {
  local exit_code=$1
  local cwd="${PWD/#$HOME/~}"
  local branch="${vcs_info_msg_0_}"
  local dirty=0
  if [[ -n "$branch" ]]; then
    dirty=$(git status --porcelain 2>/dev/null | grep -c . | tr -d ' ')
  fi
  printf '\033]6731;prompt;{"cwd":"%s","branch":"%s","dirty":%d,"time":"%s","exit":%d}\007' \
    "$cwd" "$branch" "${dirty:-0}" "$(date +%H:%M)" "$exit_code"
  printf '\033]133;A\007'
}

_ocote_precmd() {
  local ec=$?
  vcs_info
  _ocote_build_git
  printf '\033]133;D;%d\007' "$ec"   # fin del comando anterior (preset Block)
  _ocote_emit_osc "$ec"
}
_ocote_preexec() { printf '\033]133;B\007'; }   # comando enviado
add-zsh-hook precmd  _ocote_precmd
add-zsh-hook preexec _ocote_preexec

# ── Chevron dinámico (rojo si el último comando falló) ───────────────────────
_ARR='%(?:'"${_ACC}❯${_R}"':'"${_RED}❯${_R}"') '

# ── PS1 por preset (BASE ANSI — SIEMPRE visible) ─────────────────────────────
# Todos referencian ${_OCOTE_GIT} (variable plana, sin llaves anidadas).
case "$OCOTE_PROMPT_PRESET" in

  minimal)
    # "~/proyecto  main" + "❯"
    PROMPT="${_ACC}%~${_R}\${_OCOTE_GIT}"$'\n'"${_ARR}"
    ;;

  pill)
    # Powerline con caps redondeados Nerd Font — el look "pill" 100% en ANSI.
    #  = cap izquierdo redondo ·  = cap derecho redondo.
    PROMPT="%F{#${_HEX}}%K{#${_HEX}}%F{#1A1611} %~ %k%F{#${_HEX}}${_R}\${_OCOTE_GIT}"$'\n'"${_ARR}"
    ;;

  ribbon)
    # "path · git · hora" + "❯"  (subrayado con gradiente lo añade el JS)
    PROMPT="${_ACC}%~${_R}\${_OCOTE_GIT} ${_MUT}· %*${_R}"$'\n'"${_ARR}"
    ;;

  rail)
    # Dos líneas: info + chevron  (stripe vertical de 3px lo añade el JS)
    PROMPT="${_ACC}%~${_R}\${_OCOTE_GIT}"$'\n'"${_ARR}"
    ;;

  block)
    # "path  git" + "❯"  (borde de tarjeta del output lo añade el JS vía OSC 133)
    PROMPT="${_ACC}%~${_R}\${_OCOTE_GIT}"$'\n'"${_ARR}"
    ;;

esac
