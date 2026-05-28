# Ocote — prompt nativo para zsh
# ---------------------------------------------------------------------------
# Se sourcea AL FINAL del arranque de zsh (después del .zshrc del usuario).
# Lee la variable de entorno $_OCOTE_PROMPT con el preset elegido:
#   minimal | git | full   → Ocote toma control del prompt
#   mine | (vacío)         → no hace nada (respeta p10k/oh-my-zsh del usuario)
#
# Diseño: estático (sin redibujado asíncrono) → sin "fantasma" del prompt.
# Colores alineados a la paleta oficial de Ocote (ember/blue/green).

case "${_OCOTE_PROMPT}" in
  minimal|git|full) ;;
  *) return 0 ;;   # "mine" o vacío → no tocar el prompt del usuario
esac

# ── Tomar control del prompt ───────────────────────────────────────────────
# Quitar hooks de prompt previos (p10k registra precmd/preexec que redibujan).
# Esto detiene el redibujado que causaba el fantasma. Conservamos aliases,
# PATH, funciones y variables del usuario (no son hooks).
precmd_functions=()
preexec_functions=()
RPROMPT=''            # p10k suele poner un prompt derecho; lo limpiamos

setopt PROMPT_SUBST
autoload -Uz add-zsh-hook vcs_info

# ── Paleta (hex, soportado por zsh ≥ 5.7) ──────────────────────────────────
local C_EMBER='%F{#E8843A}'   # acento de marca
local C_BLUE='%F{#82A6E0}'    # ruta
local C_GREEN='%F{#7DC97A}'   # rama git
local C_MUTED='%F{#9C9480}'   # secundario
local C_RED='%F{#E8635A}'     # error
local C_RESET='%f'

# ── Git via vcs_info ───────────────────────────────────────────────────────
zstyle ':vcs_info:*' enable git
zstyle ':vcs_info:git:*' formats       " ${C_MUTED}(${C_GREEN}%b${C_MUTED})${C_RESET}"
zstyle ':vcs_info:git:*' actionformats " ${C_MUTED}(${C_GREEN}%b${C_MUTED}|${C_RED}%a${C_MUTED})${C_RESET}"

_ocote_precmd() { vcs_info }
add-zsh-hook precmd _ocote_precmd

# ── Definición del prompt según preset ─────────────────────────────────────
case "${_OCOTE_PROMPT}" in
  minimal)
    # Una línea: flecha ember + carpeta actual
    PROMPT="${C_EMBER}➜ ${C_BLUE}%1~${C_RESET} "
    ;;
  git)
    # Dos líneas: ruta + rama git arriba, flecha abajo
    PROMPT="${C_BLUE}%~${C_RESET}\${vcs_info_msg_0_}"$'\n'"${C_EMBER}❯${C_RESET} "
    ;;
  full)
    # Dos líneas: usuario@host + ruta + git + hora, flecha abajo
    PROMPT="${C_MUTED}%n@%m ${C_BLUE}%~${C_RESET}\${vcs_info_msg_0_} ${C_MUTED}%*${C_RESET}"$'\n'"${C_EMBER}❯${C_RESET} "
    ;;
esac
