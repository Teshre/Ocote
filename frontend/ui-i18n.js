// ui-i18n.js — Traducciones de la interfaz de usuario de Ocote
// Maneja todos los textos visibles del webview (settings, onboarding, breadcrumb).
// Las traducciones de la CKB (tooltip, autocomplete) se manejan por separado
// vía localStorage('ocote_lang') y getLang() en tooltip.js / autocomplete.js.

(function () {
  'use strict';

  const STRINGS = {
    es: {
      // Settings
      'settings.title':         'Configuración',
      'settings.tab.general':   'General',
      'settings.tab.appearance':'Apariencia',
      'settings.close':         '✕',
      'settings.lang.title':    'Idioma',
      'settings.lang.label':    'Idioma',
      'settings.theme.title':   'Tema de color',
      'settings.font.title':    'Tipografía',
      'settings.font.label':    'Fuente del terminal',
      'settings.icons.title':   'Explorador de archivos',
      'settings.icons.label':   'Estilo de íconos',
      'settings.icons.svg':     'SVG Outline',
      'settings.icons.badge':   'Badge',
      'settings.prompt.title':       'Prompt',
      'settings.prompt.label':       'Estilo del prompt',
      'settings.prompt.pill':        'Pill — Cápsulas (firma de Ocote)',
      'settings.prompt.block':       'Block — Modo Pro',
      'settings.prompt.minimal':     'Minimal — Suave',
      'settings.prompt.ribbon':      'Ribbon — Tenue',
      'settings.prompt.rail':        'Rail — Vertical',
      'settings.prompt.passthrough': 'Mi configuración (p10k, oh-my-zsh…)',
      'settings.prompt.hint':        'Se aplica al abrir una nueva pestaña.',

      // Onboarding
      'onboarding.title':       'Bienvenido a Ocote',
      'onboarding.subtitle':      'Terminal offline · sin IA · hecha para humanos',
      'onboarding.feature.files.title':  'Explorador de archivos',
      'onboarding.feature.files.desc':   'El panel izquierdo muestra tu directorio actual. Haz clic en una carpeta para navegar — la terminal se sincroniza automáticamente.',
      'onboarding.feature.ac.title':     'Autocompletado contextual',
      'onboarding.feature.ac.desc':      'Escribe el inicio de un comando y aparecen sugerencias. En un proyecto Rust verás <code>cargo build</code> primero; en uno Node, <code>npm run dev</code>.',
      'onboarding.feature.tooltip.title':'Tooltip educativo',
      'onboarding.feature.tooltip.desc': 'Al ejecutar un comando reconocido aparece una card con su descripción, flags comunes y un ejemplo. Se cierra solo o con <kbd>Esc</kbd>.',
      'onboarding.feature.offline.title':'100% offline',
      'onboarding.feature.offline.desc': 'Toda la ayuda viene de una base de datos local. Ocote nunca hace peticiones de red. Lo que corre en tu máquina, se queda en tu máquina.',
      'onboarding.btn':         'Comenzar →',
      'onboarding.hint':        'Puedes volver a ver esto en cualquier momento con <kbd>Ctrl+Shift+?</kbd>',

      // Breadcrumb
      'breadcrumb.settings.tooltip': 'Configuración',
    },

    en: {
      'settings.title':         'Settings',
      'settings.tab.general':   'General',
      'settings.tab.appearance':'Appearance',
      'settings.close':         '✕',
      'settings.lang.title':    'Language',
      'settings.lang.label':    'Language',
      'settings.theme.title':   'Color theme',
      'settings.font.title':    'Typography',
      'settings.font.label':    'Terminal font',
      'settings.icons.title':   'File explorer',
      'settings.icons.label':   'Icon style',
      'settings.icons.svg':     'SVG Outline',
      'settings.icons.badge':   'Badge',
      'settings.prompt.title':       'Prompt',
      'settings.prompt.label':       'Prompt style',
      'settings.prompt.pill':        'Pill — Capsules (Ocote signature)',
      'settings.prompt.block':       'Block — Pro mode',
      'settings.prompt.minimal':     'Minimal — Subtle',
      'settings.prompt.ribbon':      'Ribbon — Light',
      'settings.prompt.rail':        'Rail — Vertical',
      'settings.prompt.passthrough': 'My config (p10k, oh-my-zsh…)',
      'settings.prompt.hint':        'Applied when opening a new tab.',

      'onboarding.title':       'Welcome to Ocote',
      'onboarding.subtitle':    'Offline terminal · no AI · made for humans',
      'onboarding.feature.files.title':  'File explorer',
      'onboarding.feature.files.desc':   'The left panel shows your current directory. Click a folder to navigate — the terminal syncs automatically.',
      'onboarding.feature.ac.title':     'Contextual autocomplete',
      'onboarding.feature.ac.desc':      'Type the start of a command and suggestions appear. In a Rust project you\'ll see <code>cargo build</code> first; in a Node one, <code>npm run dev</code>.',
      'onboarding.feature.tooltip.title':'Educational tooltip',
      'onboarding.feature.tooltip.desc': 'When you run a recognized command a card appears with its description, common flags, and an example. Closes automatically or with <kbd>Esc</kbd>.',
      'onboarding.feature.offline.title':'100% offline',
      'onboarding.feature.offline.desc': 'All help comes from a local database. Ocote never makes network requests. What runs on your machine stays on your machine.',
      'onboarding.btn':         'Get started →',
      'onboarding.hint':        'You can view this again anytime with <kbd>Ctrl+Shift+?</kbd>',

      'breadcrumb.settings.tooltip': 'Settings',
    },

    pt: {
      'settings.title':         'Configurações',
      'settings.tab.general':   'Geral',
      'settings.tab.appearance':'Aparência',
      'settings.close':         '✕',
      'settings.lang.title':    'Idioma',
      'settings.lang.label':    'Idioma',
      'settings.theme.title':   'Tema de cor',
      'settings.font.title':    'Tipografia',
      'settings.font.label':    'Fonte do terminal',
      'settings.icons.title':   'Explorador de arquivos',
      'settings.icons.label':   'Estilo de ícones',
      'settings.icons.svg':     'SVG Outline',
      'settings.icons.badge':   'Badge',
      'settings.prompt.title':       'Prompt',
      'settings.prompt.label':       'Estilo do prompt',
      'settings.prompt.pill':        'Pill — Cápsulas (marca Ocote)',
      'settings.prompt.block':       'Block — Modo Pro',
      'settings.prompt.minimal':     'Minimal — Suave',
      'settings.prompt.ribbon':      'Ribbon — Tênue',
      'settings.prompt.rail':        'Rail — Vertical',
      'settings.prompt.passthrough': 'Minha configuração (p10k, oh-my-zsh…)',
      'settings.prompt.hint':        'Aplicado ao abrir uma nova aba.',

      'onboarding.title':       'Bem-vindo ao Ocote',
      'onboarding.subtitle':    'Terminal offline · sem IA · feito para humanos',
      'onboarding.feature.files.title':  'Explorador de arquivos',
      'onboarding.feature.files.desc':   'O painel esquerdo mostra seu diretório atual. Clique em uma pasta para navegar — o terminal sincroniza automaticamente.',
      'onboarding.feature.ac.title':     'Autocompletar contextual',
      'onboarding.feature.ac.desc':      'Digite o início de um comando e sugestões aparecem. Em um projeto Rust você verá <code>cargo build</code> primeiro; em um Node, <code>npm run dev</code>.',
      'onboarding.feature.tooltip.title':'Tooltip educativo',
      'onboarding.feature.tooltip.desc': 'Ao executar um comando reconhecido aparece um card com sua descrição, flags comuns e um exemplo. Fecha sozinho ou com <kbd>Esc</kbd>.',
      'onboarding.feature.offline.title':'100% offline',
      'onboarding.feature.offline.desc':  'Toda a ajuda vem de um banco de dados local. O Ocote nunca faz requisições de rede. O que roda na sua máquina, fica na sua máquina.',
      'onboarding.btn':         'Começar →',
      'onboarding.hint':        'Você pode ver isso novamente a qualquer momento com <kbd>Ctrl+Shift+?</kbd>',

      'breadcrumb.settings.tooltip': 'Configurações',
    },

    fr: {
      'settings.title':         'Paramètres',
      'settings.tab.general':   'Général',
      'settings.tab.appearance':'Apparence',
      'settings.close':         '✕',
      'settings.lang.title':    'Langue',
      'settings.lang.label':    'Langue',
      'settings.theme.title':   'Thème de couleur',
      'settings.font.title':    'Typographie',
      'settings.font.label':    'Police du terminal',
      'settings.icons.title':   'Explorateur de fichiers',
      'settings.icons.label':   "Style d'icônes",
      'settings.icons.svg':     'SVG Outline',
      'settings.icons.badge':   'Badge',
      'settings.prompt.title':       'Prompt',
      'settings.prompt.label':       'Style du prompt',
      'settings.prompt.pill':        'Pill — Capsules (signature Ocote)',
      'settings.prompt.block':       'Block — Mode Pro',
      'settings.prompt.minimal':     'Minimal — Discret',
      'settings.prompt.ribbon':      'Ribbon — Subtil',
      'settings.prompt.rail':        'Rail — Vertical',
      'settings.prompt.passthrough': 'Ma configuration (p10k, oh-my-zsh…)',
      'settings.prompt.hint':        "Appliqué à l'ouverture d'un nouvel onglet.",

      'onboarding.title':       'Bienvenue sur Ocote',
      'onboarding.subtitle':    'Terminal offline · sans IA · fait pour les humains',
      'onboarding.feature.files.title':  'Explorateur de fichiers',
      'onboarding.feature.files.desc':   'Le panneau gauche affiche votre répertoire actuel. Cliquez sur un dossier pour naviguer — le terminal se synchronise automatiquement.',
      'onboarding.feature.ac.title':     'Autocomplétion contextuelle',
      'onboarding.feature.ac.desc':      'Tapez le début d\'une commande et des suggestions apparaissent. Dans un projet Rust vous verrez <code>cargo build</code> en premier ; dans un Node, <code>npm run dev</code>.',
      'onboarding.feature.tooltip.title':'Infobulle éducative',
      'onboarding.feature.tooltip.desc': "Lors de l'exécution d'une commande reconnue, une carte apparaît avec sa description, ses flags courants et un exemple. Se ferme seul ou avec <kbd>Esc</kbd>.",
      'onboarding.feature.offline.title':'100% offline',
      'onboarding.feature.offline.desc': "Toute l'aide provient d'une base de données locale. Ocote ne fait jamais de requêtes réseau. Ce qui tourne sur votre machine reste sur votre machine.",
      'onboarding.btn':         'Commencer →',
      'onboarding.hint':        'Vous pouvez revoir ceci à tout moment avec <kbd>Ctrl+Shift+?</kbd>',

      'breadcrumb.settings.tooltip': 'Paramètres',
    },

    de: {
      'settings.title':         'Einstellungen',
      'settings.tab.general':   'Allgemein',
      'settings.tab.appearance':'Erscheinungsbild',
      'settings.close':         '✕',
      'settings.lang.title':    'Sprache',
      'settings.lang.label':    'Sprache',
      'settings.theme.title':   'Farbschema',
      'settings.font.title':    'Typografie',
      'settings.font.label':    'Terminal-Schriftart',
      'settings.icons.title':   'Datei-Explorer',
      'settings.icons.label':   'Icon-Stil',
      'settings.icons.svg':     'SVG Outline',
      'settings.icons.badge':   'Badge',
      'settings.prompt.title':       'Prompt',
      'settings.prompt.label':       'Prompt-Stil',
      'settings.prompt.pill':        'Pill — Kapseln (Ocote-Signatur)',
      'settings.prompt.block':       'Block — Pro-Modus',
      'settings.prompt.minimal':     'Minimal — Dezent',
      'settings.prompt.ribbon':      'Ribbon — Subtil',
      'settings.prompt.rail':        'Rail — Vertikal',
      'settings.prompt.passthrough': 'Meine Konfiguration (p10k, oh-my-zsh…)',
      'settings.prompt.hint':        'Wird beim Öffnen eines neuen Tabs angewendet.',

      'onboarding.title':       'Willkommen bei Ocote',
      'onboarding.subtitle':    'Offline-Terminal · ohne KI · für Menschen gemacht',
      'onboarding.feature.files.title':  'Datei-Explorer',
      'onboarding.feature.files.desc':   'Das linke Panel zeigt Ihr aktuelles Verzeichnis. Klicken Sie auf einen Ordner, um zu navigieren — das Terminal synchronisiert sich automatisch.',
      'onboarding.feature.ac.title':     'Kontextuelle Autovervollständigung',
      'onboarding.feature.ac.desc':      'Geben Sie den Anfang eines Befehls ein und Vorschläge erscheinen. In einem Rust-Projekt sehen Sie <code>cargo build</code> zuerst; in einem Node-Projekt, <code>npm run dev</code>.',
      'onboarding.feature.tooltip.title':'Pädagogischer Tooltip',
      'onboarding.feature.tooltip.desc': 'Bei der Ausführung eines erkannten Befehls erscheint eine Karte mit Beschreibung, häufigen Flags und einem Beispiel. Schließt sich selbst oder mit <kbd>Esc</kbd>.',
      'onboarding.feature.offline.title':'100% offline',
      'onboarding.feature.offline.desc':  'Alle Hilfe kommt aus einer lokalen Datenbank. Ocote macht niemals Netzwerkanfragen. Was auf Ihrem Rechner läuft, bleibt auf Ihrem Rechner.',
      'onboarding.btn':         'Loslegen →',
      'onboarding.hint':        'Sie können dies jederzeit wieder mit <kbd>Ctrl+Shift+?</kbd> ansehen',

      'breadcrumb.settings.tooltip': 'Einstellungen',
    },
  };

  function getLang() {
    return localStorage.getItem('ocote_lang') || 'es';
  }

  function get(key) {
    const lang = getLang();
    const dict = STRINGS[lang] || STRINGS.es;
    return dict[key] !== undefined ? dict[key] : (STRINGS.es[key] || key);
  }

  // Aplicar traducciones a todos los elementos con data-i18n
  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const text = get(key);
      // Si el valor original contiene HTML (code, kbd), usamos innerHTML;
      // de lo contrario textContent para seguridad.
      if (el.querySelector('code, kbd, strong')) {
        // Preservar etiquetas internas: reemplazar solo el texto que no está dentro de tags
        // Solución simple: si el contenido tiene tags, reconstruir desde el string traducido
        el.innerHTML = text;
      } else {
        el.textContent = text;
      }
    });

    // Atributos: data-i18n-attr="title:settings.title"
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      const rules = el.dataset.i18nAttr.split(';');
      for (const rule of rules) {
        const [attr, key] = rule.trim().split(':');
        if (attr && key) {
          el.setAttribute(attr, get(key));
        }
      }
    });
  }

  window.I18N = { get, apply, getLang };
})();
