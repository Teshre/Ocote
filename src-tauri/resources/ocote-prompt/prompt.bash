# Ocote — prompt nativo para bash
# ---------------------------------------------------------------------------
# Se sourcea AL FINAL del arranque de bash (después del .bashrc del usuario).
# Lee $_OCOTE_PROMPT: minimal | git | full | custom:<config> → Ocote toma el prompt.
#                     mine | (vacío) → no hace nada.
#
# Paleta: ember #E8843A · teal #6DD8C8 · green #7DC97A · muted #9C9480
#
# "custom" config string: "custom:pc=teal,gc=green,ac=ember,time=0,user=0,style=2"

_oc_preset="${_OCOTE_PROMPT%%:*}"
case "$_oc_preset" in
  minimal|git|full|custom) ;;
  *) return 0 2>/dev/null || true ;;
esac

# \[ \] envuelven secuencias no imprimibles (bash necesita saber el ancho real)
_OC_EMBER='\[\e[38;2;232;132;58m\]'   # #E8843A
_OC_TEAL='\[\e[38;2;109;216;200m\]'   # #6DD8C8  ← default para path
_OC_GREEN='\[\e[38;2;125;201;122m\]'  # #7DC97A  ← default para git
_OC_BLUE='\[\e[38;2;130;166;224m\]'   # #82A6E0
_OC_MUTED='\[\e[38;2;156;148;128m\]'  # #9C9480
_OC_RED='\[\e[38;2;232;99;90m\]'      # #E8635A
_OC_RESET='\[\e[0m\]'

# ── Resolver config del preset custom ────────────────────────────────────────
_ocote_bash_cfg() {
  local key="$1" default="$2"
  local cfg="${_OCOTE_PROMPT#*:}"
  local val
  val=$(printf '%s\n' "$cfg" | tr ',' '\n' | grep "^${key}=" | cut -d= -f2-)
  printf '%s' "${val:-$default}"
}

_ocote_bash_color() {
  case "$1" in
    ember) printf '%s' "${_OC_EMBER}" ;;
    teal)  printf '%s' "${_OC_TEAL}"  ;;
    green) printf '%s' "${_OC_GREEN}" ;;
    blue)  printf '%s' "${_OC_BLUE}"  ;;
    muted) printf '%s' "${_OC_MUTED}" ;;
    *)     printf '%s' "${_OC_TEAL}"  ;;
  esac
}

if [ "$_oc_preset" = "custom" ]; then
  _OC_PC="$(_ocote_bash_color "$(_ocote_bash_cfg pc teal)")"
  _OC_GC="$(_ocote_bash_color "$(_ocote_bash_cfg gc green)")"
  _OC_AC="$(_ocote_bash_color "$(_ocote_bash_cfg ac ember)")"
  _OC_TM="$(_ocote_bash_cfg time 0)"
  _OC_US="$(_ocote_bash_cfg user 0)"
  _OC_ST="$(_ocote_bash_cfg style 2)"
else
  _OC_PC="${_OC_TEAL}"
  _OC_GC="${_OC_GREEN}"
  _OC_AC="${_OC_EMBER}"
  _OC_TM=0
  _OC_US=0
  _OC_ST=2
fi

# Rama git actual. Se evalúa en cada prompt vía \$(...) en PS1.
_ocote_git() {
  local b
  b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return
  [ -z "$b" ] && return
  # Ícono de rama Nerd Font (U+E0A0) + rama en color git configurado
  printf ' \e[38;2;156;148;128m%s\e[0m %s\e[0m' "" "$b"
}

# Flecha dinámica: color normal en éxito, roja en error.
# Se evalúa en cada prompt vía \$(...) en PS1.
_ocote_arrow() {
  if [ $? -eq 0 ]; then
    # Las secuencias de escape aquí son sin \[...\] porque van dentro de $()
    printf '%s❯\e[0m' "$(printf '%b' "${_OC_AC//\[/}" | sed 's/\\]//g')"
  else
    printf '\e[38;2;232;99;90m❯\e[0m'
  fi
}

# Para la flecha con exit code correcto, necesitamos capturar $? ANTES de \$().
# La técnica: guardar $? en _OC_LAST_EC en PROMPT_COMMAND.
_ocote_capture_ec() { _OC_LAST_EC=$?; }
PROMPT_COMMAND='_ocote_capture_ec'

_ocote_arrow_ec() {
  if [ "${_OC_LAST_EC:-0}" -eq 0 ]; then
    printf '\e[38;2;232;132;58m❯\e[0m'   # ember
  else
    printf '\e[38;2;232;99;90m❯\e[0m'   # red
  fi
}

# Colores inline para git (sin \[...\] porque va en \$())
_OC_GC_RAW="${_OC_GC//\\[/}"
_OC_GC_RAW="${_OC_GC_RAW//\\]/}"

_ocote_git_clean() {
  local b
  b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return
  [ -z "$b" ] && return
  printf " \e[38;2;156;148;128m \e[0m${_OC_GC_RAW}%s\e[0m" "$b"
}

case "$_oc_preset" in
  minimal)
    # Una línea: carpeta + ❯ (roja en error)
    # \W = basename del CWD
    PS1="${_OC_PC}\W${_OC_RESET} \$(_ocote_arrow_ec) "
    ;;
  git)
    # Dos líneas: ruta completa + git \n ❯
    PS1="${_OC_PC}\w${_OC_RESET}\$(_ocote_git_clean)\n\$(_ocote_arrow_ec) "
    ;;
  full)
    # Dos líneas: user@host · ruta + git · hora \n ❯
    PS1="${_OC_MUTED}\u@\h ${_OC_PC}\w${_OC_RESET}\$(_ocote_git_clean) ${_OC_MUTED}\t${_OC_RESET}\n\$(_ocote_arrow_ec) "
    ;;
  custom)
    # Construir desde config del editor
    _oc_ln1=""
    [ "$_OC_US" = "1" ] && _oc_ln1+="${_OC_MUTED}\\u@\\h ${_OC_RESET}"
    _oc_ln1+="${_OC_PC}\\w${_OC_RESET}\$(_ocote_git_clean)"
    [ "$_OC_TM" = "1" ] && _oc_ln1+=" ${_OC_MUTED}\\t${_OC_RESET}"

    if [ "$_OC_ST" = "1" ]; then
      PS1="${_oc_ln1} \$(_ocote_arrow_ec) "
    else
      PS1="${_oc_ln1}\n\$(_ocote_arrow_ec) "
    fi
    ;;
esac
