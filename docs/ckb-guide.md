# Guía de la Command Knowledge Base (CKB)

La CKB es el corazón del diferencial de Ocote. Este documento explica cómo está estructurada y cómo agregar o editar comandos.

---

## Estructura de un comando

El archivo fuente es `ckb/commands.json`. Cada comando sigue este esquema:

```json
{
  "name": "nombre-del-comando",
  "category": "filesystem | git | network | process | text | rust | node | python",
  "description_es": "Descripción corta en español (máximo 60 caracteres)",
  "description_en": "Short description in English (max 60 chars)",
  "flags": [
    {
      "flag": "-f o --flag-largo",
      "description": "Qué hace este flag (máximo 80 caracteres)"
    }
  ],
  "examples": [
    {
      "command": "comando con argumentos reales",
      "description": "Qué hace este ejemplo específico"
    }
  ]
}
```

---

## Reglas editoriales

### Descripciones
- **Máximo 60 caracteres** para `description_es` y `description_en` — se muestran en el popup de autocompletado donde el espacio es limitado.
- Usar verbos en infinitivo: "Listar archivos", no "Lista archivos" ni "Para listar archivos".
- No explicar flags en la descripción principal — para eso están los `flags`.

### Flags
- Incluir solo los **3-5 flags más usados**, no todos. La card educativa muestra los top 3.
- Formato: `-r` para flags cortos, `--recursive` para largos, `-r / --recursive` si tienen ambas formas.
- Ordenar de más a menos común.

### Ejemplos
- Mínimo 1, máximo 4 ejemplos por comando.
- Los ejemplos deben ser **reales y funcionales** — alguien los va a copiar y ejecutar.
- El primer ejemplo debe ser el caso más común (el "hello world" del comando).
- Usar rutas genéricas: `~/Documents` o `mi-archivo.txt`, no rutas absolutas específicas.

---

## Categorías disponibles

| Categoría | Comandos típicos |
|---|---|
| `filesystem` | ls, cd, mkdir, rm, cp, mv, find, chmod |
| `git` | git status, git add, git commit, git push |
| `network` | curl, wget, ping, ssh, scp |
| `process` | ps, kill, top, htop, jobs, bg, fg |
| `text` | cat, grep, sed, awk, head, tail, wc |
| `rust` | cargo build, cargo run, cargo test |
| `node` | node, pnpm, npx |
| `python` | python3, pip, venv |

---

## Cómo agregar un comando nuevo

1. Abre `ckb/commands.json`
2. Agrega el nuevo objeto al array, ordenado alfabéticamente por `name`
3. Verifica que el JSON sea válido (puedes usar `python3 -m json.tool ckb/commands.json`)
4. En el futuro (Fase 2), el backend lo cargará automáticamente a SQLite al iniciar

### Ejemplo completo

```json
{
  "name": "touch",
  "category": "filesystem",
  "description_es": "Crea un archivo vacío o actualiza su fecha",
  "description_en": "Create an empty file or update its timestamp",
  "flags": [
    { "flag": "-t", "description": "Establecer fecha/hora específica" }
  ],
  "examples": [
    { "command": "touch archivo.txt", "description": "Crear un archivo vacío" },
    { "command": "touch a.txt b.txt c.txt", "description": "Crear varios archivos a la vez" }
  ]
}
```

---

## Meta de la CKB

| Fase | Meta de comandos |
|---|---|
| Fase 2 (actual) | 80 comandos — los más usados en el día a día |
| Fase 3 | 150 comandos — incluyendo herramientas de desarrollo |
| Fase 4+ | 200+ comandos — contribuciones de la comunidad |

Prioridad de selección: comandos que un principiante va a encontrar en tutoriales de internet en sus primeros 6 meses usando la terminal.
