// shell_config.rs — Configuración visual del shell de Ocote
//
// Permite a usuarios SIN conocimientos de shell ajustar su entorno sin abrir
// .zshrc / .bashrc / config.fish a mano. Mismo patrón que aliases.rs:
//
//   Fuente de verdad: app_data_dir/shell-config.json
//   De ahí se generan archivos por-shell que las configs bundleadas sourcean
//   vía la env var OCOTE_RC (ver pty.rs). NUNCA toca la config del usuario.
//
//     ocote-rc.sh   → zsh + bash   (con ramas $ZSH_VERSION / $BASH_VERSION)
//     ocote-rc.fish → fish
//     ocote-rc.ps1  → PowerShell
//
// Qué configura:
//   - Variables de entorno (export NAME=valor)   → universal
//   - Carpetas añadidas al PATH                    → universal
//   - Preferencias curadas (historial, autocd…)    → traducidas por shell
//   - Comandos de inicio "avanzado" (raw, por shell)
//
// La traducción cross-shell es el reto real: una misma preferencia (p. ej.
// "no guardar duplicados en el historial") se expresa distinto en cada shell,
// y algunas NO existen en algunos shells (autocd no existe en fish/PowerShell).
// En esos casos simplemente no se emite nada y la UI lo marca en gris.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ── Esquema de la configuración ────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct EnvVar {
    pub name:  String,
    pub value: String,
}

/// Preferencias curadas que mapean limpio a los 4 shells. `history_size = 0`
/// significa "no tocar" (usar el default del shell). Los bools, false = off.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Prefs {
    /// Tamaño del historial (líneas). 0 = no tocar.
    #[serde(default)]
    pub history_size: u32,
    /// No guardar comandos duplicados consecutivos en el historial.
    #[serde(default)]
    pub no_duplicate_history: bool,
    /// autocd: escribir el nombre de una carpeta entra a ella sin `cd`.
    #[serde(default)]
    pub autocd: bool,
    /// Compartir el historial entre pestañas al instante (cada comando se ve
    /// de inmediato en las demás sesiones).
    #[serde(default)]
    pub share_history: bool,
    /// Guardar fecha/hora de cada comando en el historial (habilita métricas
    /// temporales en el dashboard de Estadísticas).
    #[serde(default)]
    pub timestamps_history: bool,
}

/// Scripts de inicio "avanzados" — comandos crudos del shell, por FAMILIA.
/// Son específicos de cada sintaxis, así que se guardan por separado:
/// `sh` cubre zsh + bash (comparten sintaxis POSIX para lo común).
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct InitScripts {
    #[serde(default)]
    pub sh:   String, // zsh + bash
    #[serde(default)]
    pub fish: String,
    #[serde(default)]
    pub ps1:  String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ShellConfig {
    #[serde(default)]
    pub env_vars:  Vec<EnvVar>,
    #[serde(default)]
    pub path_dirs: Vec<String>,
    #[serde(default)]
    pub prefs:     Prefs,
    #[serde(default)]
    pub init:      InitScripts,
}

// ── Rutas en app_data_dir ──────────────────────────────────────────────────

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("ocote"))
}

fn json_path(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("shell-config.json")
}

// ── Comandos Tauri ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_shell_config(app: tauri::AppHandle) -> ShellConfig {
    std::fs::read_to_string(json_path(&app))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_shell_config(app: tauri::AppHandle, config: ShellConfig) -> Result<(), String> {
    let cleaned = clean(config);

    let dir = data_dir(&app);
    std::fs::create_dir_all(&dir).ok();

    let json = serde_json::to_string_pretty(&cleaned).map_err(|e| e.to_string())?;
    std::fs::write(json_path(&app), json).map_err(|e| e.to_string())?;

    regenerate_files(&dir, &cleaned)
}

/// Resultado de `preview_shell_config`: el contenido EXACTO que se generaría
/// para cada familia de shell, sin escribir nada a disco.
#[derive(Serialize, Clone)]
pub struct GeneratedFiles {
    pub sh:   String,
    pub fish: String,
    pub ps1:  String,
}

/// Genera (sin guardar) el contenido de los archivos por-shell a partir de una
/// config. La UI lo usa para mostrar "el código que se generará" — transparencia
/// total: el usuario ve los comandos reales que su shell cargará.
#[tauri::command]
pub fn preview_shell_config(config: ShellConfig) -> GeneratedFiles {
    let c = clean(config);
    GeneratedFiles {
        sh:   gen_sh(&c),
        fish: gen_fish(&c),
        ps1:  gen_ps1(&c),
    }
}

/// Detecta qué shells están instalados en la máquina. La UI usa esto para
/// ofrecer SOLO los disponibles (no tiene sentido ofrecer fish si no está).
///
/// Probamos rutas absolutas conocidas PRIMERO porque el `.app` lanzado desde
/// Finder corre con un PATH mínimo (no hereda el de la terminal del usuario),
/// así que `which fish` podría fallar aunque fish esté en /opt/homebrew/bin.
#[tauri::command]
pub fn detect_shells() -> Vec<ShellInfo> {
    detect_shells_inner()
}

/// Regenera los archivos por-shell desde el JSON en disco. Se llama en el
/// setup de la app para que la config existente aplique al primer shell tras
/// un reinicio (igual que aliases::regenerate_from_disk).
pub fn regenerate_from_disk(app: &tauri::AppHandle) {
    let dir = data_dir(app);
    let cfg = get_shell_config(app.clone());
    std::fs::create_dir_all(&dir).ok();
    let _ = regenerate_files(&dir, &cfg);
}

// ── Detección de shells ────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct ShellInfo {
    /// Identificador estable: "zsh" | "bash" | "fish" | "pwsh".
    pub id:             String,
    /// Nombre para mostrar en la UI.
    pub name:           String,
    /// Ruta absoluta al binario (vacía si no está disponible).
    pub path:           String,
    /// true si encontramos el binario en disco.
    pub available:      bool,
    /// true si este es el shell de login del sistema ($SHELL). La UI lo usa
    /// para marcar cuál se usa "por defecto" cuando el usuario no eligió otro.
    pub is_login_shell: bool,
}

#[cfg(not(target_os = "windows"))]
fn detect_shells_inner() -> Vec<ShellInfo> {
    // Shell de login del sistema. Comparamos por basename ("/bin/zsh" → "zsh").
    let login = std::env::var("SHELL").unwrap_or_default();
    let login_name = Path::new(&login)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();

    // (id, nombre, rutas candidatas en orden de preferencia)
    let candidates: &[(&str, &str, &[&str])] = &[
        ("zsh",  "Zsh",        &["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh", "/opt/homebrew/bin/zsh"]),
        ("bash", "Bash",       &["/opt/homebrew/bin/bash", "/usr/local/bin/bash", "/bin/bash", "/usr/bin/bash"]),
        ("fish", "Fish",       &["/opt/homebrew/bin/fish", "/usr/local/bin/fish", "/usr/bin/fish"]),
        ("pwsh", "PowerShell", &["/opt/homebrew/bin/pwsh", "/usr/local/bin/pwsh", "/usr/bin/pwsh"]),
    ];

    candidates.iter().map(|(id, name, paths)| {
        let path = find_binary(id, paths);
        ShellInfo {
            id:             id.to_string(),
            name:           name.to_string(),
            is_login_shell: *id == login_name,
            available:      path.is_some(),
            path:           path.unwrap_or_default(),
        }
    }).collect()
}

#[cfg(target_os = "windows")]
fn detect_shells_inner() -> Vec<ShellInfo> {
    // En Windows el shell por defecto es PowerShell. powershell.exe (5.1) viene
    // siempre con el sistema; pwsh.exe (7+) es opcional.
    let mut out = Vec::new();
    let pwsh = which("pwsh.exe").or_else(|| which("pwsh"));
    let pwsh_ok = pwsh.is_some();
    out.push(ShellInfo {
        id: "pwsh".into(), name: "PowerShell 7".into(),
        available: pwsh_ok, path: pwsh.unwrap_or_default(),
        // En Windows el "login shell" efectivo es pwsh si está, si no Windows PowerShell.
        is_login_shell: pwsh_ok,
    });
    let ps = which("powershell.exe").or_else(|| which("powershell"));
    out.push(ShellInfo {
        id: "powershell".into(), name: "Windows PowerShell".into(),
        available: ps.is_some(), path: ps.unwrap_or_default(),
        is_login_shell: !pwsh_ok,
    });
    out
}

/// Busca el binario de un shell: primero rutas absolutas conocidas (existen en
/// disco sin depender del PATH), luego `which`/`where` con un PATH ampliado.
#[cfg(not(target_os = "windows"))]
fn find_binary(name: &str, candidates: &[&str]) -> Option<String> {
    for c in candidates {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    which(name)
}

/// Equivalente a `which name` con un PATH ampliado para encontrar binarios de
/// Homebrew aun cuando Ocote corre con el PATH mínimo de un `.app` de Finder.
fn which(name: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    let prog = "where";
    #[cfg(not(target_os = "windows"))]
    let prog = "which";

    let cur = std::env::var("PATH").unwrap_or_default();
    let augmented = format!("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}", cur);

    let out = std::process::Command::new(prog)
        .arg(name)
        .env("PATH", augmented)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
}

// ── Saneamiento ────────────────────────────────────────────────────────────

/// Limita el historial a un máximo sensato para evitar valores absurdos.
const MAX_HISTORY: u32 = 1_000_000;

fn clean(cfg: ShellConfig) -> ShellConfig {
    let env_vars = cfg.env_vars.into_iter()
        .map(|v| EnvVar { name: v.name.trim().to_string(), value: v.value.trim().to_string() })
        .filter(|v| is_valid_env_name(&v.name))
        .collect();

    let path_dirs = cfg.path_dirs.into_iter()
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty())
        .collect();

    let prefs = Prefs {
        history_size: cfg.prefs.history_size.min(MAX_HISTORY),
        ..cfg.prefs
    };

    ShellConfig { env_vars, path_dirs, prefs, init: cfg.init }
}

// ── Generación de los archivos por shell ───────────────────────────────────

fn regenerate_files(dir: &Path, cfg: &ShellConfig) -> Result<(), String> {
    std::fs::write(dir.join("ocote-rc.sh"),   gen_sh(cfg)).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("ocote-rc.fish"), gen_fish(cfg)).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("ocote-rc.ps1"),  gen_ps1(cfg)).map_err(|e| e.to_string())?;
    Ok(())
}

/// zsh + bash. El MISMO archivo lo sourcean ambos, así que las opciones
/// específicas de cada uno van en ramas `$ZSH_VERSION` / `$BASH_VERSION`
/// (si pusiéramos `setopt` a secas, bash fallaría con "command not found").
fn gen_sh(cfg: &ShellConfig) -> String {
    let mut s = String::from("# Generado por Ocote — no editar a mano.\n");

    if !cfg.env_vars.is_empty() {
        s.push_str("\n# Variables de entorno\n");
        for v in &cfg.env_vars {
            s.push_str(&format!("export {}='{}'\n", v.name, sh_escape(&v.value)));
        }
    }

    let dirs = cfg.path_dirs.iter()
        .map(|d| format!("'{}'", sh_escape(d)))
        .collect::<Vec<_>>()
        .join(":");
    if !dirs.is_empty() {
        s.push_str("\n# Carpetas añadidas al PATH\n");
        s.push_str(&format!("export PATH={}:\"$PATH\"\n", dirs));
    }

    let p = &cfg.prefs;
    if p.history_size > 0 || p.no_duplicate_history || p.autocd
        || p.share_history || p.timestamps_history
    {
        s.push_str("\n# Preferencias\n");
        if p.history_size > 0 {
            // HISTSIZE (historial en memoria) aplica a zsh y bash por igual.
            s.push_str(&format!("HISTSIZE={}\n", p.history_size));
        }
        s.push_str("if [ -n \"$ZSH_VERSION\" ]; then\n");
        if p.history_size > 0 {
            s.push_str(&format!("  SAVEHIST={}\n", p.history_size));
        }
        if p.no_duplicate_history { s.push_str("  setopt HIST_IGNORE_ALL_DUPS\n"); }
        if p.autocd               { s.push_str("  setopt AUTO_CD\n"); }
        if p.share_history        { s.push_str("  setopt SHARE_HISTORY\n"); }
        if p.timestamps_history   { s.push_str("  setopt EXTENDED_HISTORY\n"); }
        s.push_str("elif [ -n \"$BASH_VERSION\" ]; then\n");
        if p.history_size > 0 {
            s.push_str(&format!("  HISTFILESIZE={}\n", p.history_size));
        }
        if p.no_duplicate_history { s.push_str("  HISTCONTROL=ignoredups\n"); }
        if p.autocd               { s.push_str("  shopt -s autocd 2>/dev/null\n"); }
        if p.share_history {
            // Compartir historial en bash: append + re-leer en cada prompt.
            // OCOTE_RC se sourcea DESPUÉS de que el hook fijó PROMPT_COMMAND,
            // así que ${PROMPT_COMMAND} preserva el del hook.
            s.push_str("  shopt -s histappend\n");
            s.push_str("  PROMPT_COMMAND=\"history -a; history -n; ${PROMPT_COMMAND}\"\n");
        }
        if p.timestamps_history   { s.push_str("  HISTTIMEFORMAT='%F %T '\n"); }
        s.push_str("fi\n");
    }

    if !cfg.init.sh.trim().is_empty() {
        s.push_str("\n# Comandos de inicio (avanzado)\n");
        s.push_str(cfg.init.sh.trim_end());
        s.push('\n');
    }

    s
}

/// fish. Maneja historial y deduplicación NATIVAMENTE, y no tiene autocd, así
/// que de las preferencias curadas no se emite ninguna (la UI lo aclara). Lo
/// que sí aplica: variables de entorno, PATH y el script de inicio avanzado.
fn gen_fish(cfg: &ShellConfig) -> String {
    let mut s = String::from("# Generado por Ocote — no editar a mano.\n");

    if !cfg.env_vars.is_empty() {
        s.push_str("\n# Variables de entorno\n");
        for v in &cfg.env_vars {
            s.push_str(&format!("set -gx {} '{}'\n", v.name, fish_escape(&v.value)));
        }
    }

    let dirs = cfg.path_dirs.iter()
        .map(|d| format!("'{}'", fish_escape(d)))
        .collect::<Vec<_>>()
        .join(" ");
    if !dirs.is_empty() {
        // En fish, PATH es una lista; prependerlos les da prioridad.
        s.push_str("\n# Carpetas añadidas al PATH\n");
        s.push_str(&format!("set -gx PATH {} $PATH\n", dirs));
    }

    if !cfg.init.fish.trim().is_empty() {
        s.push_str("\n# Comandos de inicio (avanzado)\n");
        s.push_str(cfg.init.fish.trim_end());
        s.push('\n');
    }

    s
}

/// PowerShell. Variables de entorno y PATH son directas; el historial y la
/// deduplicación se configuran vía PSReadLine (guardado por si no está cargado).
/// autocd no existe en PowerShell.
fn gen_ps1(cfg: &ShellConfig) -> String {
    let mut s = String::from("# Generado por Ocote — no editar a mano.\n");

    if !cfg.env_vars.is_empty() {
        s.push_str("\n# Variables de entorno\n");
        for v in &cfg.env_vars {
            s.push_str(&format!("$env:{} = '{}'\n", v.name, ps_escape(&v.value)));
        }
    }

    let dirs = cfg.path_dirs.iter()
        .map(|d| ps_escape(d))
        .collect::<Vec<_>>()
        .join(";");
    if !dirs.is_empty() {
        s.push_str("\n# Carpetas añadidas al PATH\n");
        s.push_str(&format!("$env:PATH = '{};' + $env:PATH\n", dirs));
    }

    let p = &cfg.prefs;
    if p.history_size > 0 || p.no_duplicate_history || p.share_history {
        s.push_str("\n# Preferencias\n");
        if p.history_size > 0 {
            s.push_str(&format!("$MaximumHistoryCount = {}\n", p.history_size));
        }
        // PSReadLine puede no estar disponible en algún host → comprobar.
        s.push_str("if (Get-Module -ListAvailable PSReadLine) {\n");
        if p.history_size > 0 {
            s.push_str(&format!("  Set-PSReadLineOption -MaximumHistoryCount {}\n", p.history_size));
        }
        if p.no_duplicate_history {
            s.push_str("  Set-PSReadLineOption -HistoryNoDuplicates\n");
        }
        if p.share_history {
            // Guardar cada comando al instante → las sesiones nuevas lo ven.
            s.push_str("  Set-PSReadLineOption -HistorySaveStyle SaveIncrementally\n");
        }
        s.push_str("}\n");
    }
    // timestamps_history: el historial de PSReadLine no guarda fecha/hora → N/A.

    if !cfg.init.ps1.trim().is_empty() {
        s.push_str("\n# Comandos de inicio (avanzado)\n");
        s.push_str(cfg.init.ps1.trim_end());
        s.push('\n');
    }

    s
}

// ── Validación y escape ────────────────────────────────────────────────────

/// Nombre de variable de entorno válido: letra o `_` al inicio, luego
/// letras/dígitos/`_`. (No se permite `-`, a diferencia de los aliases.)
fn is_valid_env_name(n: &str) -> bool {
    if n.is_empty() {
        return false;
    }
    let mut chars = n.chars();
    let first = chars.next().unwrap();
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Escape para comillas simples en sh: ' → '\''
fn sh_escape(s: &str) -> String {
    s.replace('\'', "'\\''")
}

/// Escape para comillas simples en fish: \ → \\, ' → \'
fn fish_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

/// Escape para comillas simples en PowerShell: ' → '' (duplicar)
fn ps_escape(s: &str) -> String {
    s.replace('\'', "''")
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_with_env(name: &str, value: &str) -> ShellConfig {
        ShellConfig {
            env_vars: vec![EnvVar { name: name.into(), value: value.into() }],
            ..Default::default()
        }
    }

    #[test]
    fn env_name_validation() {
        assert!(is_valid_env_name("PATH"));
        assert!(is_valid_env_name("_FOO"));
        assert!(is_valid_env_name("MY_VAR2"));
        assert!(!is_valid_env_name("2BAD"));      // empieza con dígito
        assert!(!is_valid_env_name("my-var"));    // guion no permitido
        assert!(!is_valid_env_name(""));          // vacío
        assert!(!is_valid_env_name("a b"));       // espacio
    }

    #[test]
    fn sh_escapes_single_quotes() {
        // Un valor con comilla simple no debe poder romper el `export NAME='...'`.
        let out = gen_sh(&cfg_with_env("MSG", "it's"));
        assert!(out.contains("export MSG='it'\\''s'\n"));
    }

    #[test]
    fn sh_path_and_prefs_branch_per_shell() {
        let cfg = ShellConfig {
            path_dirs: vec!["/opt/tools".into()],
            prefs: Prefs {
                history_size: 5000, no_duplicate_history: true, autocd: true,
                share_history: true, timestamps_history: true,
            },
            ..Default::default()
        };
        let out = gen_sh(&cfg);
        assert!(out.contains("export PATH='/opt/tools':\"$PATH\""));
        assert!(out.contains("HISTSIZE=5000"));
        assert!(out.contains("setopt AUTO_CD"));            // rama zsh
        assert!(out.contains("setopt SHARE_HISTORY"));      // compartir (zsh)
        assert!(out.contains("setopt EXTENDED_HISTORY"));   // timestamps (zsh)
        assert!(out.contains("shopt -s autocd"));           // rama bash
        assert!(out.contains("shopt -s histappend"));       // compartir (bash)
        assert!(out.contains("HISTTIMEFORMAT="));           // timestamps (bash)
        assert!(out.contains("HISTCONTROL=ignoredups"));
    }

    #[test]
    fn fish_omits_unsupported_prefs() {
        let cfg = ShellConfig {
            prefs: Prefs {
                history_size: 5000, no_duplicate_history: true, autocd: true,
                share_history: true, timestamps_history: true,
            },
            ..Default::default()
        };
        let out = gen_fish(&cfg);
        // fish maneja esto nativamente → no debe emitir setopt/HISTSIZE.
        assert!(!out.contains("HISTSIZE"));
        assert!(!out.contains("setopt"));
        assert!(!out.contains("autocd"));
    }

    #[test]
    fn ps1_env_and_history() {
        let cfg = ShellConfig {
            env_vars: vec![EnvVar { name: "FOO".into(), value: "ba'r".into() }],
            prefs: Prefs {
                history_size: 3000, no_duplicate_history: true, autocd: false,
                share_history: true, timestamps_history: false,
            },
            ..Default::default()
        };
        let out = gen_ps1(&cfg);
        assert!(out.contains("$env:FOO = 'ba''r'"));   // comilla duplicada
        assert!(out.contains("$MaximumHistoryCount = 3000"));
        assert!(out.contains("Set-PSReadLineOption -HistoryNoDuplicates"));
        assert!(out.contains("SaveIncrementally"));     // compartir (pwsh)
    }

    #[test]
    fn clean_clamps_and_filters() {
        let cfg = ShellConfig {
            env_vars: vec![
                EnvVar { name: "OK".into(), value: " val ".into() },
                EnvVar { name: "bad-name".into(), value: "x".into() }, // se descarta
            ],
            path_dirs: vec!["  ".into(), "/real".into()],              // vacío se descarta
            prefs: Prefs { history_size: 9_999_999, ..Default::default() },
            ..Default::default()
        };
        let c = clean(cfg);
        assert_eq!(c.env_vars.len(), 1);
        assert_eq!(c.env_vars[0].value, "val");        // trim aplicado
        assert_eq!(c.path_dirs, vec!["/real".to_string()]);
        assert_eq!(c.prefs.history_size, MAX_HISTORY); // clamp
    }
}
