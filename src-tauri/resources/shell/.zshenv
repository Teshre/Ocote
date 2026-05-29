# Ocote — ZDOTDIR wrapper (.zshenv)
# ---------------------------------------------------------------------------
# Cargado por zsh ANTES que .zshrc. Suprime el instant prompt de p10k cuando
# Ocote controla el prompt, para evitar el "fantasma" de redibujado.

# Sourcear .zshenv real del usuario (si existe) para conservar su PATH/env
[[ -f "${_OCOTE_ZDOTDIR}/.zshenv" ]] && source "${_OCOTE_ZDOTDIR}/.zshenv"

# Desactivar instant prompt de p10k cuando Ocote controla el prompt.
# Con passthrough, el usuario tiene p10k → dejamos que corra normalmente.
if [[ -n "${OCOTE_PROMPT_PRESET}" && "${OCOTE_PROMPT_PRESET}" != "passthrough" ]]; then
  export POWERLEVEL9K_INSTANT_PROMPT=off
fi
