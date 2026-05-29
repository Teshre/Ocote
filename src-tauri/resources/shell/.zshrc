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

# ── 3. Syntax highlighting al FINAL (después de todo lo demás). ─────────────
ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)
[[ -n "$OCOTE_ZSH_HL" && -f "$OCOTE_ZSH_HL" ]] && source "$OCOTE_ZSH_HL"

# ── 4. Restaurar ZDOTDIR del usuario para el resto de la sesión ─────────────
# (subshells, herramientas que leen $ZDOTDIR, etc.).
ZDOTDIR="$_ocote_user_zdotdir"
