# Ocote — prompt nativo para bash
# ---------------------------------------------------------------------------
# Se sourcea AL FINAL del arranque de bash (después del .bashrc del usuario).
# Lee $_OCOTE_PROMPT: minimal | git | full → Ocote toma el prompt.
#                     mine | (vacío)       → no hace nada.
#
# Colores true-color alineados a la paleta oficial de Ocote.

case "${_OCOTE_PROMPT}" in
  minimal|git|full) ;;
  *) return 0 2>/dev/null || true ;;
esac

# \[ \] envuelven secuencias no imprimibles (para que bash calcule bien el ancho)
_OC_EMBER='\[\e[38;2;232;132;58m\]'   # #E8843A
_OC_BLUE='\[\e[38;2;130;166;224m\]'   # #82A6E0
_OC_GREEN='\[\e[38;2;125;201;122m\]'  # #7DC97A
_OC_MUTED='\[\e[38;2;156;148;128m\]'  # #9C9480
_OC_RESET='\[\e[0m\]'

# Rama git actual (vacío si no es repo). Se evalúa en cada prompt vía \$(...).
_ocote_git() {
  local b
  b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return
  [ -n "$b" ] && printf ' %s(%s%s%s)%s' \
    $'\e[38;2;156;148;128m' $'\e[38;2;125;201;122m' "$b" $'\e[38;2;156;148;128m' $'\e[0m'
}

case "${_OCOTE_PROMPT}" in
  minimal)
    # Una línea: flecha ember + carpeta actual (\W = basename)
    PS1="${_OC_EMBER}➜ ${_OC_BLUE}\W${_OC_RESET} "
    ;;
  git)
    # Dos líneas: ruta + rama git arriba, flecha abajo (\w = ruta completa)
    PS1="${_OC_BLUE}\w${_OC_RESET}\$(_ocote_git)\n${_OC_EMBER}❯${_OC_RESET} "
    ;;
  full)
    # Dos líneas: usuario@host + ruta + git + hora, flecha abajo
    PS1="${_OC_MUTED}\u@\h ${_OC_BLUE}\w${_OC_RESET}\$(_ocote_git) ${_OC_MUTED}\t${_OC_RESET}\n${_OC_EMBER}❯${_OC_RESET} "
    ;;
esac

# bash usa PROMPT_COMMAND para prompts dinámicos; lo limpiamos para que no
# interfiera con el nuestro (p.ej. configs previas del usuario).
PROMPT_COMMAND=''
