# Ocote · .zshenv — se ejecuta SIEMPRE, primero (antes que .zshrc).
# ---------------------------------------------------------------------------
# CRÍTICO: NO reasignar permanentemente ZDOTDIR aquí. zsh busca .zshrc en
# $ZDOTDIR DESPUÉS de leer este archivo; si lo cambiáramos al dir del usuario,
# zsh leería el .zshrc del usuario y NUNCA el bootstrap de Ocote (= prompt vacío).
#
# Guardamos nuestro propio ZDOTDIR, cargamos el .zshenv del usuario con SU
# ZDOTDIR temporalmente, y restauramos el nuestro para que .zshrc cargue de aquí.

_ocote_self_zdotdir="$ZDOTDIR"
_ocote_user_zdotdir="${_OCOTE_ZDOTDIR:-$HOME}"

# Cargar el .zshenv del usuario (con SU ZDOTDIR visible mientras se sourcea).
if [[ -f "$_ocote_user_zdotdir/.zshenv" ]]; then
  ZDOTDIR="$_ocote_user_zdotdir" source "$_ocote_user_zdotdir/.zshenv"
fi

# Restaurar NUESTRO ZDOTDIR para que zsh lea NUESTRO .zshrc a continuación.
ZDOTDIR="$_ocote_self_zdotdir"

# Desactivar el instant prompt de p10k cuando Ocote controla el prompt
# (evita el flash/fantasma). En passthrough no lo tocamos.
if [[ -n "$OCOTE_PROMPT_PRESET" && "$OCOTE_PROMPT_PRESET" != "passthrough" ]]; then
  export POWERLEVEL9K_INSTANT_PROMPT=off
fi
