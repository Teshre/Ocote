# Ocote — fish prompt hook
# ---------------------------------------------------------------------------
# Cargado vía:  fish -C "source <ruta>/prompt.fish"
# El flag -C corre DESPUÉS de config.fish del usuario, así que nuestro
# fish_prompt sobrescribe el suyo (igual que el .zshrc bootstrap en zsh).
#
# fish trae syntax highlighting y autosuggestions NATIVOS — no hay que
# bundlear plugins. Solo definimos el prompt y emitimos los OSC.
#
# Variables inyectadas por Tauri (pty.rs):
#   OCOTE_PROMPT_PRESET — pill|block|minimal|ribbon|rail|passthrough
#   OCOTE_ACCENT        — hex del accent del tema SIN # (ej. E8843A)
#   OCOTE_FZF_BIN       — ruta al binario de fzf de la plataforma
#
# NOTA: fish calcula el ancho del prompt interpretando las secuencias de
# escape él mismo — NO necesita marcadores tipo %{ %} (zsh) o \[ \] (bash).

# passthrough o preset desconocido → no tocar el prompt del usuario.
if contains -- "$OCOTE_PROMPT_PRESET" pill block minimal ribbon rail

    function fish_prompt
        # Capturar el exit code del comando anterior ANTES de cualquier cosa.
        set -l ec $status

        set -l accent E8843A
        test -n "$OCOTE_ACCENT"; and set accent "$OCOTE_ACCENT"

        # cwd con ~ abreviado (prefijo $HOME → ~)
        set -l cwd "$PWD"
        if string match -q -- "$HOME*" "$PWD"
            set cwd (string replace -- "$HOME" "~" "$PWD")
        end

        # git: rama + nº de archivos modificados
        set -l branch (command git symbolic-ref --short HEAD 2>/dev/null; or command git rev-parse --short HEAD 2>/dev/null)
        set -l dirty 0
        test -n "$branch"; and set dirty (command git status --porcelain 2>/dev/null | count)

        set -l now (date +%H:%M)

        # ── OSC: fin de comando (133 D) + metadata del prompt (6731) ──────────
        # Para los body-overlays de block/rail y el sync del explorador.
        printf '\e]133;D;%d\a' $ec
        printf '\e]6731;prompt;{"cwd":"%s","branch":"%s","dirty":%d,"time":"%s","exit":%d}\a' \
            "$cwd" "$branch" $dirty "$now" $ec

        # ── Línea info (ANSI fallback; el overlay HTML va encima en pill/etc) ─
        switch "$OCOTE_PROMPT_PRESET"
            case rail
                set_color $accent; printf '│ '
            case block
                set_color $accent; printf '┌─ '
        end

        set_color $accent; printf '%s' "$cwd"; set_color normal

        if test -n "$branch"
            set_color 7DC97A; printf '  %s' "$branch"
            if test "$dirty" -gt 0
                set_color E8C03A; printf ' +%s' "$dirty"
            end
            set_color normal
        end

        set_color 9C9480; printf ' · %s' "$now"; set_color normal

        # ── Segunda línea: chevron (rojo si el último comando falló) ─────────
        printf '\n'
        if test $ec -eq 0
            set_color $accent
        else
            set_color E8635A
        end
        printf '❯ '
        set_color normal

        # ── OSC 133 A al FINAL (cursor en la fila del ❯) ────────────────────
        # Posiciona los overlays. minimal NO lleva overlay → sin 133 A.
        if test "$OCOTE_PROMPT_PRESET" != minimal
            printf '\e]133;A\a'
        end
    end

    # fish redibuja el prompt en cada tecla; un fish_right_prompt vacío evita
    # que quede basura de un prompt previo del usuario.
    function fish_right_prompt
    end
end

# ── fzf integration (fish) ────────────────────────────────────────────────────
# fish ya tiene búsqueda de historial nativa (↑) y autosuggestions, pero fzf
# añade búsqueda fuzzy. Keybindings: Ctrl+R (historial), Alt+C (cd fuzzy).
# Ctrl+T se desactiva (conflicto con nueva pestaña de Ocote).
if test -n "$OCOTE_FZF_BIN"; and test -x "$OCOTE_FZF_BIN"
    # El binario `fzf` vive en resources/bin/<plataforma>/fzf. Añadir ese dir al
    # PATH lo hace un comando real — necesario para fish, cuya integración valida
    # `command -q fzf` (que NO encuentra funciones, solo ejecutables en PATH).
    fish_add_path --path (path dirname $OCOTE_FZF_BIN)

    # fzf --fish DEFINE la función fzf_key_bindings pero NO la ejecuta.
    # Hay que sourcear y luego llamarla para instalar Ctrl+R / Alt+C / Ctrl+T.
    fzf --fish | source
    functions -q fzf_key_bindings; and fzf_key_bindings

    # Quitar Ctrl+T (lo usa Ocote para nueva pestaña).
    bind -e \ct 2>/dev/null
    bind -M insert -e \ct 2>/dev/null

    set -gx FZF_DEFAULT_OPTS "--height=40% --layout=reverse --border=rounded --prompt='❯ ' --pointer='▶' --marker='✓' --color=fg:#C8C0B0,bg:-1,hl:#E8C03A --color=fg+:#E2D6BD,bg+:#1C1611,hl+:#E8843A --color=border:#524A42,prompt:#E8843A,pointer:#E8843A --color=marker:#7DC97A,spinner:#E8843A,header:#6F6552"
    set -gx FZF_ALT_C_COMMAND "find -L . -mindepth 1 -maxdepth 5 -type d -not -path '*/.*' 2>/dev/null"
end

# ── zoxide (cd inteligente: comando `z`) + bat (disponible como `bat`) ───────
if type -q zoxide
    zoxide init fish | source
end
