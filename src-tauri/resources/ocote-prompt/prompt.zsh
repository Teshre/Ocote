# Ocote — prompt nativo para zsh
# ---------------------------------------------------------------------------
# Se sourcea AL FINAL del arranque de zsh (después del .zshrc del usuario).
# Lee la variable de entorno $_OCOTE_PROMPT:
#   minimal | git | full        → preset de Ocote
#   custom:<config>             → prompt personalizado (editor en Settings)
#   mine | (vacío)              → no hace nada (respeta p10k/oh-my-zsh)
#
# Paleta oficial: ember #E8843A · teal #6DD8C8 · green #7DC97A
#                 blue #82A6E0  · muted #9C9480 · red #E8635A
#
# "custom" config string: "custom:pc=teal,gc=green,ac=ember,time=0,user=0,style=2"
#   pc    = path color    (teal|blue|green|ember)
#   gc    = git color     (green|teal|blue|ember)
#   ac    = arrow color   (ember|teal|green|blue)
#   time  = mostrar hora  (0|1)
#   user  = mostrar user@host (0|1)
#   style = 1 línea o 2  (1|2)

# Solo actuar si tenemos un preset de Ocote.
case "${_OCOTE_PROMPT%%:*}" in
  minimal|git|full|custom) ;;
  *) return 0 ;;   # "mine" o vacío → respetar config del usuario
esac

# ── Tomar control del prompt ───────────────────────────────────────────────
# Quitar hooks de p10k/oh-my-zsh que redibujarían el prompt (fantasma).
# Aliases, PATH, funciones del usuario se conservan — solo eliminamos hooks.
precmd_functions=()
preexec_functions=()
RPROMPT=''
setopt PROMPT_SUBST
autoload -Uz add-zsh-hook vcs_info

# ── Paleta de colores (global, no local) ─────────────────────────────────────
# Global para que PROMPT_SUBST y vcs_info puedan resolverlas al renderizar.
C_EMBER='%F{#E8843A}'   # acento principal de Ocote · prompt char por defecto
C_TEAL='%F{#6DD8C8}'    # ruta de directorio
C_GREEN='%F{#7DC97A}'   # rama git
C_BLUE='%F{#82A6E0}'    # alternativa azul para path
C_MUTED='%F{#9C9480}'   # texto secundario · separadores · user@host · hora
C_RED='%F{#E8635A}'     # error · prompt char cuando el comando falla
C_RESET='%f'

# ── Resolver config del preset custom ────────────────────────────────────────
# _OCOTE_PROMPT puede ser "git" o "custom:pc=teal,gc=green,..."
_OCOTE_PRESET="${_OCOTE_PROMPT%%:*}"

# Función auxiliar: extraer valor de "key=val" en la cadena de config.
# $1=clave, $2=default. Solo se llama en custom; no afecta la velocidad normal.
_ocote_cfg() {
  local key="$1" default="$2"
  local cfg="${_OCOTE_PROMPT#*:}"
  local val
  val=$(printf '%s\n' "$cfg" | tr ',' '\n' | grep "^${key}=" | cut -d= -f2-)
  printf '%s' "${val:-$default}"
}

# Función auxiliar: nombre de color → secuencia %F{} de zsh
_ocote_fcolor() {
  case "$1" in
    ember) printf '%s' "${C_EMBER}" ;;
    teal)  printf '%s' "${C_TEAL}"  ;;
    green) printf '%s' "${C_GREEN}" ;;
    blue)  printf '%s' "${C_BLUE}"  ;;
    muted) printf '%s' "${C_MUTED}" ;;
    *)     printf '%s' "${C_TEAL}"  ;;
  esac
}

# Asignar colores según preset (para custom, se leen de la config)
if [[ "$_OCOTE_PRESET" == "custom" ]]; then
  _OC_PC="$(_ocote_fcolor "$(_ocote_cfg pc teal)")"
  _OC_GC="$(_ocote_fcolor "$(_ocote_cfg gc green)")"
  _OC_AC="$(_ocote_fcolor "$(_ocote_cfg ac ember)")"
  _OC_GIT="$(_ocote_cfg git 1)"    # 0 = ocultar rama git
  _OC_TIME="$(_ocote_cfg time 0)"
  _OC_USER="$(_ocote_cfg user 0)"
  _OC_STYLE="$(_ocote_cfg style 2)"
else
  # Presets fijos usan la paleta Ocote directa
  _OC_PC="${C_TEAL}"
  _OC_GC="${C_GREEN}"
  _OC_AC="${C_EMBER}"
  _OC_GIT=1
  _OC_TIME=0
  _OC_USER=0
  _OC_STYLE=2
fi

# ── vcs_info para rama git ───────────────────────────────────────────────────
zstyle ':vcs_info:*' enable git
# Ícono de rama Nerd Font (U+E0A0 = ) + nombre de rama en color configurado.
# Si la fuente activa no tiene Nerd Fonts, aparece un glyph de sustitución —
# los usuarios de JetBrainsMono NF / MesloLGS NF (defecto de Ocote) lo ven bien.
if [[ "$_OC_GIT" == "0" ]]; then
  # Editor custom: ocultar rama git completamente
  zstyle ':vcs_info:git:*' formats       ""
  zstyle ':vcs_info:git:*' actionformats ""
else
  zstyle ':vcs_info:git:*' formats       " ${C_MUTED}${_OC_GC} %b${C_RESET}"
  zstyle ':vcs_info:git:*' actionformats " ${C_MUTED}${_OC_GC} %b${C_MUTED}|${C_RED}%a${C_RESET}"
fi

_ocote_precmd() { vcs_info }
add-zsh-hook precmd _ocote_precmd

# ── Flecha dinámica: ember en éxito, roja en error ───────────────────────────
# %(?: verdad : error) es el ternario de PROMPT_SUBST que evalúa $? al dibujar.
# Los valores de color ya están embebidos en la cadena literal de PROMPT.
_OC_ARR_OK="${_OC_AC}❯${C_RESET}"
_OC_ARR_ERR="${C_RED}❯${C_RESET}"
_OC_ARR='%(?:'"${_OC_ARR_OK}"':'"${_OC_ARR_ERR}"') '

# ── Definición del PROMPT según preset ───────────────────────────────────────
case "$_OCOTE_PRESET" in

  minimal)
    # Una línea: carpeta actual + flecha (roja si error)
    # Ejemplo: ~/proyecto ❯
    PROMPT="${_OC_PC}%1~${C_RESET} ${_OC_ARR}"
    ;;

  git)
    # Dos líneas: ruta completa [  rama]\n❯ (roja en error)
    # Ejemplo: ~/proyecto/src   main
    #          ❯
    PROMPT="${_OC_PC}%~${C_RESET}\${vcs_info_msg_0_}"$'\n'"${_OC_ARR}"
    ;;

  full)
    # Dos líneas: usuario@host · ruta [  rama] · hora\n❯
    # Ejemplo: acala@MacBook ~/proyecto   main  14:32:01
    #          ❯
    PROMPT="${C_MUTED}%n${C_RESET}${C_MUTED}@%m ${_OC_PC}%~${C_RESET}\${vcs_info_msg_0_} ${C_MUTED}%*${C_RESET}"$'\n'"${_OC_ARR}"
    ;;

  custom)
    # Construir prompt desde la config del editor de Settings.
    # Línea 1: [user@host] path [git] [time]
    local _ln1=""
    [[ "$_OC_USER" == "1" ]] && _ln1+="${C_MUTED}%n@%m ${C_RESET}"
    _ln1+="${_OC_PC}%~${C_RESET}\${vcs_info_msg_0_}"
    [[ "$_OC_TIME" == "1" ]] && _ln1+=" ${C_MUTED}%*${C_RESET}"

    if [[ "$_OC_STYLE" == "1" ]]; then
      # Una línea: info + flecha juntos
      PROMPT="${_ln1} ${_OC_ARR}"
    else
      # Dos líneas (default): info arriba, flecha abajo
      PROMPT="${_ln1}"$'\n'"${_OC_ARR}"
    fi
    ;;

esac
