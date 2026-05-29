# Ocote — ZDOTDIR wrapper (.zshrc)
# ---------------------------------------------------------------------------
# Cargado en lugar del ~/.zshrc del usuario. Este archivo:
#   1. Restaura ZDOTDIR y sourcea el .zshrc real del usuario.
#   2. Instala los hooks de Ocote (OSC 6731 + OSC 133).
#
# Variables de entorno que Tauri inyecta al arrancar el shell:
#   OCOTE_PROMPT_PRESET  — preset elegido: pill|block|minimal|ribbon|rail|passthrough
#   OCOTE_ACCENT         — hex del accent del tema activo (sin #, p.ej. "E8843A")
#   _OCOTE_ZDOTDIR       — ZDOTDIR real del usuario (o $HOME si no tenía custom)

# ── 1. Cargar la configuración real del usuario ──────────────────────────────
# Restauramos ZDOTDIR primero para que el .zshrc del usuario no vea nuestro dir.
ZDOTDIR="${_OCOTE_ZDOTDIR:-$HOME}"
[[ -f "${_OCOTE_ZDOTDIR}/.zshrc" ]] && source "${_OCOTE_ZDOTDIR}/.zshrc"

# ── 2. passthrough: no tocar el prompt (respeta p10k/oh-my-zsh del usuario) ──
[[ "${OCOTE_PROMPT_PRESET}" == "passthrough" ]] && return 0

# ── 3. Tomar control del prompt ──────────────────────────────────────────────
# Quitar hooks de p10k/oh-my-zsh que redibujarían el prompt.
# Aliases, PATH y funciones del usuario se conservan — solo eliminamos hooks.
precmd_functions=()
preexec_functions=()
RPROMPT=''

setopt PROMPT_SUBST
autoload -Uz add-zsh-hook

# Syntax highlighting (al final para que no interfiera con oh-my-zsh/autosuggestions).
# El path se inyecta como OCOTE_ZSH_HL por Tauri en tiempo de arranque.
ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)
[[ -f "${OCOTE_ZSH_HL}" ]] && source "${OCOTE_ZSH_HL}"

# ── 4. Hook precmd: recopilar contexto + emitir OSC ─────────────────────────
# Se ejecuta antes de cada prompt. Emite:
#   OSC 133 D;exitcode  — fin del comando anterior (para Block preset)
#   OSC 6731            — datos JSON para el renderer de prompt.js
#   OSC 133 A           — inicio de zona prompt (para Block preset)
_ocote_precmd() {
  local ec=$?

  # OSC 133 D — fin de comando con exit code
  printf '\033]133;D;%d\007' "$ec"

  # Recopilar contexto del directorio actual
  local cwd="${PWD/#$HOME/~}"
  local branch="" dirty=0
  if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    branch="$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)"
    # wc -l es más portable que grep -c para contar líneas
    dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  fi

  # OSC 6731 — JSON con datos del prompt para el renderer
  # El renderer (prompt.js) captura esto y pinta la decoración HTML.
  printf '\033]6731;prompt;{"cwd":"%s","branch":"%s","dirty":%s,"time":"%s","exit":%d}\007' \
    "$cwd" \
    "${branch}" \
    "${dirty:-0}" \
    "$(date +%H:%M)" \
    "$ec"

  # OSC 133 A — inicio de zona prompt
  printf '\033]133;A\007'
}

# preexec: se ejecuta cuando el usuario envía un comando (antes de correrlo)
_ocote_preexec() {
  printf '\033]133;B\007'  # fin de zona prompt → inicio de zona output
}

add-zsh-hook precmd  _ocote_precmd
add-zsh-hook preexec _ocote_preexec

# ── 5. PS1 según preset ───────────────────────────────────────────────────────
# Pill / Block / Ribbon / Rail: PS1 mínimo — la info la pinta prompt.js con HTML.
# Minimal: PS1 completo con ANSI + glifos Nerd Font (sin overlay del renderer).
_OC_A="${OCOTE_ACCENT:-E8843A}"  # accent sin #

if [[ "${OCOTE_PROMPT_PRESET}" == "minimal" ]]; then
  # Minimal — PS1 con ANSI: ruta abreviada tipo migajas + rama git + flama ❯
  # %F{#hex} requiere zsh 5.7+. Los Nerd Fonts están bundleados en Ocote.
  autoload -Uz vcs_info
  zstyle ':vcs_info:*' enable git
  zstyle ':vcs_info:git:*' formats " %F{#7DC97A}%b%f"
  _ocote_vcs() { vcs_info }
  add-zsh-hook precmd _ocote_vcs

  # Ruta en migas: carpeta raíz en accent, separadores en muted, carpeta actual en bold
  # %(5~|%-1~/…/%3~|%~) = si hay >4 dirs: "primer/…/últimos3", si no: ruta completa
  PROMPT="%F{#${_OC_A}}%(5~|%-1~/…/%3~|%~)%f\${vcs_info_msg_0_}"$'\n'"%(?:%F{#${_OC_A}}:%F{#E8635A})❯%f "
else
  # Presets con decoración (Pill/Block/Ribbon/Rail):
  # Primera línea vacía → el renderer pinta su decoration ahí via registerMarker(0).
  # Segunda línea → el chevron ❯ (amber en éxito, rojo en error).
  PROMPT=$'\n'"%(?:%F{#${_OC_A}}:%F{#E8635A})❯%f "
fi
