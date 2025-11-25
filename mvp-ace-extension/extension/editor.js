// Initialize Ace Editor with SAS Language Server integration

(function() {
  'use strict';

  // Initialize Ace Editor
  const editor = ace.edit("editor");
  editor.setTheme("ace/theme/monokai");
  editor.session.setMode("ace/mode/text"); // Will be enhanced by LSP
  editor.setOptions({
    fontSize: "14px",
    showPrintMargin: false,
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
  });

  // UI Elements
  const lspStatus = document.getElementById('lspStatus');
  const lspText = document.getElementById('lspText');
  const lineCount = document.getElementById('lineCount');
  const formatBtn = document.getElementById('formatBtn');
  const clearBtn = document.getElementById('clearBtn');

  // Update line count
  function updateLineCount() {
    lineCount.textContent = editor.session.getLength();
  }

  editor.session.on('change', updateLineCount);
  updateLineCount();

  // LSP Client using ace-linters
  let lspClient = null;

  // Initialize Language Server
  async function initLanguageServer() {
    try {
      lspText.textContent = 'LSP: Starting...';

      // Create worker for language server
      const workerUrl = chrome.runtime.getURL('sas-language-server.worker.js');
      const worker = new Worker(workerUrl, { type: 'module' });

      // Create LSP service using ace-linters
      const { LanguageProvider } = window.serviceworker;

      if (!LanguageProvider) {
        throw new Error('ace-linters not loaded properly');
      }

      // Create language provider for SAS
      lspClient = LanguageProvider.create(worker, {
        module: () => import(workerUrl),
        modes: "sas",
        type: "webworker",
      });

      // Configure the provider
      lspClient.setSessionOptions(editor.session, {
        functionality: {
          hover: true,
          completion: {
            overwriteCompleters: false
          },
          completionResolve: false,
          format: true,
          documentHighlight: false,
          signatureHelp: false,
        }
      });

      // Register provider with editor
      lspClient.registerEditor(editor);

      lspStatus.classList.add('connected');
      lspText.textContent = 'LSP: Connected';

      console.log('SAS Language Server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Language Server:', error);
      lspText.textContent = 'LSP: Error';

      // Fallback: use basic SAS syntax highlighting
      setupBasicSyntax();
    }
  }

  // Fallback basic syntax highlighting
  function setupBasicSyntax() {
    // Define a simple SAS mode for Ace
    ace.define('ace/mode/sas', function(require, exports, module) {
      const oop = require("ace/lib/oop");
      const TextMode = require("ace/mode/text").Mode;
      const TextHighlightRules = require("ace/mode/text_highlight_rules").TextHighlightRules;

      const SasHighlightRules = function() {
        this.$rules = {
          start: [{
            token: "comment",
            regex: "/\\*",
            next: "comment"
          }, {
            token: "comment.line",
            regex: "\\*.*$"
          }, {
            token: "keyword",
            regex: "\\b(data|proc|run|quit|set|merge|by|if|then|else|do|end|output|keep|drop|where|format|input|put|cards|datalines|infile|file)\\b",
            caseInsensitive: true
          }, {
            token: "keyword",
            regex: "\\b(means|freq|print|sort|transpose|sql|reg|anova|glm|mixed|tabulate)\\b",
            caseInsensitive: true
          }, {
            token: "string",
            regex: '"(?:[^"\\\\]|\\\\.)*?"'
          }, {
            token: "string",
            regex: "'(?:[^'\\\\]|\\\\.)*?'"
          }, {
            token: "constant.numeric",
            regex: "\\b\\d+(?:\\.\\d+)?\\b"
          }],
          comment: [{
            token: "comment",
            regex: "\\*\\/",
            next: "start"
          }, {
            defaultToken: "comment"
          }]
        };
      };

      oop.inherits(SasHighlightRules, TextHighlightRules);

      const Mode = function() {
        this.HighlightRules = SasHighlightRules;
      };
      oop.inherits(Mode, TextMode);

      exports.Mode = Mode;
    });

    editor.session.setMode("ace/mode/sas");
  }

  // Button handlers
  formatBtn.addEventListener('click', async () => {
    if (lspClient) {
      try {
        await lspClient.format(editor.session);
      } catch (error) {
        console.error('Format error:', error);
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    editor.setValue('', -1);
  });

  // Auto-save to chrome.storage
  let saveTimeout;
  editor.session.on('change', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      chrome.storage.local.set({ 'sasCode': editor.getValue() });
    }, 1000);
  });

  // Restore saved content
  chrome.storage.local.get(['sasCode'], (result) => {
    if (result.sasCode) {
      editor.setValue(result.sasCode, -1);
    }
  });

  // Initialize
  if (window.serviceworker) {
    initLanguageServer();
  } else {
    console.warn('ace-linters not available, using basic syntax highlighting');
    setupBasicSyntax();
    lspText.textContent = 'LSP: Not available (using basic syntax)';
  }

  // Keyboard shortcuts
  editor.commands.addCommand({
    name: 'formatDocument',
    bindKey: { win: 'Ctrl-Shift-F', mac: 'Command-Shift-F' },
    exec: function() {
      formatBtn.click();
    }
  });

})();
