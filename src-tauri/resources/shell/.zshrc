# Ocote · .zshrc — bootstrap de integración de shell.
# ---------------------------------------------------------------------------
# zsh llega aquí porque .zshenv mantuvo ZDOTDIR apuntando a NUESTRO dir.
# Orden: (1) config del usuario → (2) prompt de Ocote → (3) syntax highlighting.
# Al final restauramos ZDOTDIR al del usuario para el resto de la sesión.

_ocote_user_zdotdir="${_OCOTE_ZDOTDIR:-$HOME}"

# ── 1. Cargar la config REAL del usuario (aliases, PATH, plugins, p10k…) ────
# Con SU ZDOTDIR visible para que su .zshrc resuelva rutas relativas a $ZDOTDIR.
if [[ -f "$_ocote_user_zdotdir/.zshrc" ]]; then
  ZDOTDIR="$_ocote_user_zdotdir" source "$_ocote_user_zdotdir/.zshrc"
fi

# ── 2. Instalar el prompt de Ocote (PS1 ANSI + OSC). ────────────────────────
# Va DESPUÉS del .zshrc del usuario para sobrescribir el prompt de p10k/omz.
# El hook respeta passthrough internamente (retorna sin tocar nada).
[[ -n "$OCOTE_PROMPT_HOOK" && -f "$OCOTE_PROMPT_HOOK" ]] && source "$OCOTE_PROMPT_HOOK"

# ── 3. Syntax highlighting (después del prompt y fzf, antes de autosuggestions). ─
ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)
[[ -n "$OCOTE_ZSH_HL" && -f "$OCOTE_ZSH_HL" ]] && source "$OCOTE_ZSH_HL"

# ── 4. zsh-autosuggestions — DEBE cargar AL FINAL (después de syntax-highlighting).
# Orden crítico: si autosuggestions cargara antes que syntax-highlighting, al
# aceptar una sugerencia con → el texto aceptado se quedaría gris (el rehighlight
# no se dispara). Con autosuggestions como wrapper más externo, el accept dispara
# el rehighlight y el texto se ve en color normal.
if [[ -f "$OCOTE_ZSH_AUTOSUGGEST" ]]; then
  source "$OCOTE_ZSH_AUTOSUGGEST"
  ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#6F6552"
  ZSH_AUTOSUGGEST_STRATEGY=(history completion)
  ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=50

  # Widgets que LIMPIAN el texto fantasma al ejecutarse (Tab, fzf, pegar).
  ZSH_AUTOSUGGEST_CLEAR_WIDGETS+=(
    expand-or-complete
    complete-word
    fzf-history-widget
    fzf-cd-widget
    bracketed-paste
  )

  # Flecha → acepta la sugerencia COMPLETA (estilo fish), no carácter por carácter.
  #   - Con sugerencia visible (POSTDISPLAY) → la acepta entera y se vuelve blanca.
  #   - Sin sugerencia → mueve el cursor normalmente (editar a mitad de línea).
  _ocote_accept_or_forward() {
    if [[ -n "$POSTDISPLAY" ]]; then
      zle autosuggest-accept
      # Forzar re-highlight: limpia el region_highlight gris que autosuggestions
      # dejó sobre el texto ahora aceptado, y deja que syntax-highlighting recolore.
      region_highlight=()
      zle redisplay
    else
      zle forward-char
    fi
  }
  zle -N _ocote_accept_or_forward
  # Bind la flecha → con TODAS las variantes posibles del terminal:
  #   terminfo[kcuf1] = secuencia correcta según el terminal actual
  #   ^[[C = CSI C (modo normal), ^[OC = SS3 C (application cursor mode)
  bindkey "${terminfo[kcuf1]}" _ocote_accept_or_forward 2>/dev/null
  bindkey '^[[C' _ocote_accept_or_forward
  bindkey '^[OC' _ocote_accept_or_forward
fi

# ── 5. Aliases del editor de Ocote ──────────────────────────────────────────
# Va DESPUÉS de la config del usuario para que los aliases de Ocote ganen.
[[ -n "$OCOTE_ALIASES" && -f "$OCOTE_ALIASES" ]] && source "$OCOTE_ALIASES"

# ── 6. Restaurar ZDOTDIR del usuario para el resto de la sesión ─────────────
# (subshells, herramientas que leen $ZDOTDIR, etc.).
ZDOTDIR="$_ocote_user_zdotdir"

# ── 7. Historial fuera del bundle ──────────────────────────────────────────
# Por defecto zsh escribe $ZDOTDIR/.zsh_history. Como nuestro ZDOTDIR estaba
# dentro del .app, el historial se creaba ahí y rompía la firma de macOS.
# Redirigir a ~/.zsh_history (o el HISTFILE que el usuario ya tenga).
# Si el usuario configuró HISTFILE en su .zshrc (ya se cargó arriba), respetarlo.
: "${HISTFILE:=$HOME/.zsh_history}"
