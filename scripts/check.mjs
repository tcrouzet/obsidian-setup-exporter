import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeBlock, MASKED, publicText, vaultPath } from '../plugin/privacy.ts';
import { collectSettings, controlValue, panelSettings, renderedSettings, settingsMarkdown } from '../plugin/settings.ts';
import {
  communityThemeDescription, DEFAULT_SETTINGS, generateReport, hotkeysMarkdown, parseSettings,
  replaceReport, reportPath, REPORT_MARKER, saveReport, selectTemplates, templatesMarkdown,
} from '../plugin/report.ts';

function renderedPanel(id, name, fields, section) {
  const container = { querySelectorAll: () => rows, ownerDocument: { defaultView: null } };
  const summary = { textContent: section, querySelector: () => ({ textContent: section }),
    matches: () => true, previousElementSibling: null };
  const details = {
    matches: selector => selector === 'details', querySelector: () => ({ textContent: section }),
    parentElement: container,
  };
  const parent = section ? { matches: () => false, parentElement: details, previousElementSibling: summary } : container;
  const rows = fields.map(field => {
    const row = {
      style: {}, closest: () => null, matches: () => false, previousElementSibling: null, parentElement: parent,
      querySelector: () => ({ textContent: field.name }), querySelectorAll: () => [control],
    };
    const control = {
      id: '', tagName: field.type === 'select' ? 'SELECT' : 'INPUT',
      closest: () => row, getAttribute: name => name === 'type' ? field.type : null,
      selectedOptions: [{ textContent: field.label }], checked: field.checked,
      get value() { return field.value; },
    };
    return row;
  });
  return { id, name, containerEl: container };
}

test('native labels: English controls and selected captions are copied verbatim', () => {
  const panel = renderedPanel('editor', 'Editor', [
    { name: 'Line numbers', type: 'checkbox', checked: true },
    { name: 'Default editing mode', type: 'select', value: 'internal-value', label: 'Live Preview' },
  ], 'Display');
  const report = settingsMarkdown(renderedSettings(panel, 'Settings'));
  assert.match(report, /### Settings → Editor\n\n#### Settings → Editor → Display\n/);
  assert.match(report, /- Line numbers : \*\*✓\*\*/);
  assert.match(report, /- Default editing mode : \*\*Live Preview\*\*/);
  assert.doesNotMatch(report, /internal-value|Paramètres|Réglages|Éditeur|Activé/);
});

test('native labels: French and arbitrary plugin labels require no locale detection', () => {
  for (const [name, section, option, label] of [
    ['Finition', 'Cadence', 'Moteur de cadence', 'Syntaxique'],
    ['Éditeur', 'Affichage', 'Mode de lecture', 'Aperçu en direct'],
    ['Unbekannt', 'Darstellung', 'Neuer Name', 'Eigene Auswahl'],
  ]) {
    const entries = renderedSettings(renderedPanel('custom', name, [
      { name: option, type: 'select', value: 'machine-code', label },
    ], section));
    assert.deepEqual(entries[0].path, [name, section]);
    const report = settingsMarkdown(entries);
    assert.ok(report.includes(`### ${name}\n`));
    assert.ok(!report.includes(`#### ${section}\n`));
    assert.ok(report.includes(`- ${option} : **${label}**`));
    assert.doesNotMatch(report, /machine-code/);
  }
});

test('native controls: skip sensitive fields before reading their contents', () => {
  const fields = [
    { name: 'Clé API Anthropic', type: 'text' },
    { name: 'API token', type: 'text' },
    { name: 'Password', type: 'password' },
    { name: 'Prompt de révision', type: 'text' },
  ];
  for (const field of fields) Object.defineProperty(field, 'value', { get() { assert.fail('Sensitive field was read'); } });
  assert.deepEqual(renderedSettings(renderedPanel('safe', 'Safe', fields)), []);
  assert.equal(controlValue('secret', 'PRIVATE_SENTINEL'), null);
  assert.equal(controlValue('textarea', 'PRIVATE_SENTINEL'), null);
  assert.equal(controlValue('dropdown', 'PRIVATE_SENTINEL'), null);
  assert.equal(controlValue('text', '/Users/PRIVATE_SENTINEL'), MASKED);
  assert.equal(controlValue('number', Infinity), null);
});

test('declarative settings: retain native groups, subpages, defaults and selected captions', () => {
  const reads = [];
  const panel = { id: 'example', name: 'Example', getSettingDefinitions: () => [
    { type: 'group', heading: 'Affichage', items: [
      { name: 'Style', control: { type: 'dropdown', key: 'style', defaultValue: 'wide', options: { compact: 'Compact', wide: 'Large' } } },
      { type: 'page', name: 'Avancé', items: [
        { name: 'Largeur', control: { type: 'number', key: 'width', defaultValue: 80 } },
        { name: 'Activer', control: { type: 'toggle', key: 'enabled', defaultValue: true } },
      ] },
      { name: 'Masqué', visible: false, control: { type: 'text', key: 'hidden' } },
      { name: 'Secret', control: { type: 'secret', key: 'secret' } },
      { name: 'Texte privé', control: { type: 'textarea', key: 'multiline' } },
      { name: 'Erreur', control: { type: 'text', key: 'broken', defaultValue: '' } },
      { name: 'Fin', control: { type: 'toggle', key: 'last', defaultValue: false } },
    ] },
  ], getControlValue: key => {
    reads.push(key);
    if (key === 'broken') throw new Error('PRIVATE_SENTINEL');
    return { style: 'compact', enabled: false, last: true }[key];
  } };
  const entries = panelSettings(panel);
  assert.deepEqual(entries.find(entry => entry.name === 'Activer').path, ['Example', 'Affichage', 'Avancé']);
  const report = settingsMarkdown(entries);
  for (const key of ['hidden', 'secret', 'multiline']) assert.ok(!reads.includes(key), key);
  assert.match(report, /### Example\n\n#### Example → Affichage\n/);
  assert.match(report, /- Style : \*\*Compact\*\*/);
  assert.doesNotMatch(report, /##### Avancé\n/);
  assert.doesNotMatch(report, /Largeur/);
  assert.match(report, /- Activer : \*\*✗\*\*/);
  assert.match(report, /- Fin : \*\*✓\*\*/);
  assert.doesNotMatch(report, /PRIVATE_SENTINEL|Masqué|Secret|Texte privé|Erreur/);
});

test('defaults: export only verified differences, including false, zero and cleared text', () => {
  const values = { sameToggle: false, sameNumber: 0, sameText: '', enabled: false, count: 0, cleared: '', mode: 'compact' };
  const panel = { id: 'editor', name: 'Editor', getSettingDefinitions: () => [
    { name: 'Same toggle', control: { type: 'toggle', key: 'sameToggle', defaultValue: false } },
    { name: 'Same number', control: { type: 'number', key: 'sameNumber', defaultValue: 0 } },
    { name: 'Same text', control: { type: 'text', key: 'sameText', defaultValue: '' } },
    { name: 'Changed toggle', control: { type: 'toggle', key: 'enabled', defaultValue: true } },
    { name: 'Changed number', control: { type: 'number', key: 'count', defaultValue: 10 } },
    { name: 'Cleared text', control: { type: 'text', key: 'cleared', defaultValue: 'Folder' } },
    { name: 'Selected mode', control: { type: 'dropdown', key: 'mode', defaultValue: 'wide', options: { compact: 'Compact display', wide: 'Wide display' } } },
  ], getControlValue: key => values[key] };
  assert.deepEqual(panelSettings(panel).map(({ name, value }) => ({ name, value })), [
    { name: 'Changed toggle', value: '✗' }, { name: 'Changed number', value: '0' },
    { name: 'Cleared text', value: '∅' }, { name: 'Selected mode', value: 'Compact display' },
  ]);
});

test('defaults: missing or undefined defaults are not evidence of a user modification', () => {
  const panel = { id: 'unknown', name: 'Unknown', getSettingDefinitions: () => [
    { name: 'Missing', control: { type: 'toggle', key: 'missing' } },
    { name: 'Undefined', control: { type: 'number', key: 'undefined', defaultValue: undefined } },
    { name: 'Invalid', control: { type: 'number', key: 'invalid', defaultValue: NaN } },
    { name: 'No override', control: { type: 'number', key: 'absent', defaultValue: 4 } },
  ], getControlValue: key => {
    assert.equal(key, 'absent');
    return undefined;
  } };
  assert.deepEqual(panelSettings(panel), []);
});

test('defaults: language affects labels but never which options are modified', () => {
  for (const [name, label] of [['Editor', 'Line numbers'], ['Éditeur', 'Numéros de ligne'], ['Editor', 'Zeilennummern']]) {
    let current = true;
    const panel = { id: 'editor', name, getSettingDefinitions: () => [
      { name: label, control: { type: 'toggle', key: 'lines', defaultValue: false } },
    ], getControlValue: () => current };
    assert.deepEqual(panelSettings(panel), [{ path: [name], name: label, value: '✓' }]);
    current = false;
    assert.deepEqual(panelSettings(panel), []);
  }
});

test('collector: DOM values cannot bypass default comparison', async () => {
  const panel = renderedPanel('editor', 'Editor', [
    { name: 'Unchanged', type: 'checkbox', checked: true },
    { name: 'Unknown default', type: 'text', get value() { assert.fail('Unknown-default field was read'); } },
    { name: 'Changed', type: 'checkbox', checked: true },
  ]);
  panel.getSettingDefinitions = () => [
    { name: 'Unchanged', control: { type: 'toggle', key: 'same', defaultValue: true } },
    { name: 'Unknown default', control: { type: 'text', key: 'unknown' } },
    { name: 'Changed', control: { type: 'toggle', key: 'changed', defaultValue: false } },
  ];
  panel.getControlValue = key => {
    assert.notEqual(key, 'unknown');
    return true;
  };
  const captured = await collectSettings({ setting: { settingTabs: [panel], open() {}, close() {}, openTabById() {} } });
  assert.deepEqual(captured.editor, [{ path: ['Preferences → Editor'], name: 'Changed', value: '✓' }]);
});

test('settings: group each panel once and escape active Markdown', () => {
  const entries = [
    { path: ['Appearance', 'Font'], name: 'Font size', value: '18' },
    { path: ['Editor'], name: 'Mode', value: 'Live Preview' },
    { path: ['Appearance', 'Interface'], name: '![[private]]', value: '✓' },
  ];
  const report = settingsMarkdown(entries);
  assert.equal(report.match(/### Appearance\n/g).length, 1);
  assert.match(report, /### Appearance\n\n- Font size : \*\*18\*\*/);
  assert.match(report, /### Editor\n\n- Mode : \*\*Live Preview\*\*/);
  assert.doesNotMatch(report, /#### Font|#### Interface/);
  assert.doesNotMatch(report, /!\[\[/);
  assert.equal(settingsMarkdown([]), '');
});

test('readability: keep multi-option groups and remove single-option subheadings', () => {
  const report = settingsMarkdown([
    { path: ['Settings → Appearance', 'Font'], name: 'Font size', value: '23' },
    { path: ['Settings → Appearance', 'Interface'], name: 'Inline title', value: '✓' },
    { path: ['Settings → Appearance', 'Interface'], name: 'Ribbon', value: '✗' },
  ]);
  assert.match(report, /### Settings → Appearance\n\n- Font size : \*\*23\*\*/);
  assert.doesNotMatch(report, /#### Font/);
  assert.match(report, /#### Settings → Appearance → Interface\n\n- Inline title : \*\*✓\*\*\n- Ribbon : \*\*✗\*\*/);
  assert.equal(controlValue('toggle', true), '✓');
  assert.equal(controlValue('toggle', false), '✗');
});

test('plugin options: never collect or export core or community options', async () => {
  const name = 'Antidote Grammar Checker Integration';
  const reads = [];
  const panel = renderedPanel('antidote', name, [
    { name: 'Add dictionary button', type: 'checkbox', checked: false },
    { name: 'Add guide button', type: 'checkbox', checked: true },
  ]);
  panel.getSettingDefinitions = () => { reads.push('definitions'); assert.fail('Community definitions must not be read'); };
  panel.getControlValue = () => { reads.push('options'); assert.fail('Community options must not be read'); };
  const core = { id: 'canvas', name: 'Canvas', getSettingDefinitions() { reads.push('core'); assert.fail('Core options must not be read'); } };
  const app = { vault: { configDir: '.obsidian' },
    setting: { settingTabs: [core], pluginTabs: [panel], titleEl: { textContent: name }, open() {}, close() {}, openTabById() {} },
    internalPlugins: { plugins: { canvas: { enabled: true, name: 'Canvas' } } },
    plugins: { manifests: { antidote: { id: 'antidote', name, version: '1', author: 'Author', description: 'Description' } }, enabledPlugins: new Set(['antidote']) },
  };
  const captured = await collectSettings(app);
  const report = await generateReport(app, DEFAULT_SETTINGS, captured);
  assert.match(report, /## Preferences → Community plugins\n\n- \*\*\[Antidote Grammar Checker Integration\]\(https:\/\/community.obsidian.md\/plugins\/antidote\)\*\* Description \[Install\]\(obsidian:\/\/show-plugin\?id=antidote\)/);
  assert.doesNotMatch(report, /Integration → Antidote|Add dictionary|Add guide|☑|☐/);
  assert.deepEqual(Object.keys(captured), []);
  panel.containerEl = undefined;
  assert.deepEqual(Object.keys(await collectSettings(app)), []);
  assert.deepEqual(reads, []);
});

test('application options: omit unchanged and unknown-default options before reading their controls', async () => {
  const panel = renderedPanel('example', 'Example', [
    { name: 'Unchanged', type: 'checkbox', checked: false },
    { name: 'Unknown default', type: 'select', label: 'Compact' },
    { name: 'API token', type: 'text', get value() { assert.fail('Secret field was read'); } },
  ]);
  panel.getSettingDefinitions = () => [
    { name: 'Unchanged', control: { type: 'toggle', key: 'same', defaultValue: false } },
    { name: 'Unknown default', control: { type: 'dropdown', key: 'unknown', options: { compact: 'Compact' } } },
    { name: 'Not rendered', control: { type: 'number', key: 'count' } },
    { name: 'Changed', control: { type: 'number', key: 'changed', defaultValue: 1 } },
    { name: 'Secret', control: { type: 'secret', key: 'secret' } },
  ];
  panel.getControlValue = key => {
    assert.ok(['same', 'changed'].includes(key));
    return { same: false, changed: 0 }[key];
  };
  assert.deepEqual(panelSettings(panel).map(entry => entry.value), ['0']);
  const captured = await collectSettings({ setting: { settingTabs: [panel], open() {}, close() {}, openTabById() {} } });
  assert.deepEqual(captured.example.map(({ name, value }) => ({ name, value })), [
    { name: 'Changed', value: '0' },
  ]);
});

test('native controls: read Obsidian toggles without an input', () => {
  const panel = renderedPanel('custom', 'Custom', [{ name: 'Enabled' }]);
  const control = panel.containerEl.querySelectorAll()[0].querySelectorAll()[0];
  control.tagName = 'DIV';
  control.getAttribute = () => null;
  let enabled = true;
  control.classList = { contains: name => name === 'checkbox-container' || (name === 'is-enabled' && enabled) };
  assert.deepEqual(renderedSettings(panel).map(entry => entry.value), ['✓']);
  enabled = false;
  assert.deepEqual(renderedSettings(panel).map(entry => entry.value), ['✗']);
});

test('report layout: navigation paths once, plain description and installation links', async () => {
  const app = { vault: { configDir: '.obsidian' },
    setting: { settingTabs: [{ id: 'appearance', name: 'Appearance' }, { id: 'canvas', name: 'Canvas' }],
      pluginTabs: [{ id: 'remember-cursor-position', name: 'Remember cursor position' }] },
    internalPlugins: { plugins: { canvas: { enabled: true } } },
    plugins: { manifests: { 'remember-cursor-position': { id: 'remember-cursor-position', name: 'Remember cursor position', version: '1.0.16', author: 'Author', description: 'Remember the cursor position.' } }, enabledPlugins: new Set(['remember-cursor-position']) },
  };
  const report = await generateReport(app, DEFAULT_SETTINGS, {
    appearance: [{ path: ['Preferences → Appearance'], name: 'Font size', value: '23' }],
    canvas: [
      { path: ['Preferences → Canvas', 'Canvas'], name: 'Zoom', value: '2' },
      { path: ['Preferences → Canvas', 'Canvas'], name: 'Snap', value: '✓' },
    ],
    'remember-cursor-position': [{ path: ['Preferences → Remember cursor position'], name: 'Remember selection', value: '✓' }],
  });
  assert.match(report, /## Preferences → Appearance\n\n- Font size : \*\*23\*\*/);
  assert.equal(report.match(/Canvas/g)?.length, 1);
  assert.match(report, /## Preferences → Core plugins\n\n- \*\*Canvas\*\*\n/);
  assert.match(report, /## Preferences → Community plugins\n\n- \*\*\[Remember cursor position\]\(https:\/\/community.obsidian.md\/plugins\/remember-cursor-position\)\*\* Remember the cursor position\. \[Install\]\(obsidian:\/\/show-plugin\?id=remember-cursor-position\)/);
  assert.doesNotMatch(report, /^## \d+\.|General|Remember selection|Zoom|Snap|^- (?:ID|Version|Author|Status|Description) :/m);
});

test('core plugins: prefer the enabled-plugin API and reject nonboolean fallback flags', async () => {
  const manager = { plugins: {
    active: { enabled: false, name: 'Active' },
    inactive: { enabled: true, name: 'Inactive' },
    ambiguous: { enabled: 'false', name: 'Ambiguous' },
    templates: { enabled: true, name: 'Templates', instance: { get settings() { assert.fail('Disabled template settings must not be read'); } } },
  }, getEnabledPluginById: id => id === 'active' ? {} : null };
  const app = { vault: { configDir: '.obsidian' }, internalPlugins: manager };
  assert.equal(await generateReport(app, { ...DEFAULT_SETTINGS, includeDisabled: true }), '# Obsidian setup\n\n## Preferences → Core plugins\n\n- **Active**\n');
  delete manager.getEnabledPluginById;
  manager.plugins.active.enabled = true;
  manager.plugins.inactive.enabled = false;
  manager.plugins.templates.enabled = false;
  assert.equal(await generateReport(app, DEFAULT_SETTINGS), '# Obsidian setup\n\n## Preferences → Core plugins\n\n- **Active**\n');
});

test('navigation categories: English and French headings include core, community plugins and custom hotkeys', async () => {
  for (const [title, root, core, community, hotkeys] of [
    ['Settings', 'Preferences', 'Core plugins', 'Community plugins', 'Hotkeys'],
    ['Paramètres', 'Préférences', 'Modules principaux', 'Extensions communautaires', 'Raccourcis clavier'],
  ]) {
    const app = { vault: { configDir: '.obsidian' },
      setting: { titleEl: { textContent: title },
        corePluginTabHeaderGroup: { textContent: core }, communityPluginTabHeaderGroup: { textContent: community },
        settingTabs: [{ id: 'hotkeys', name: hotkeys }],
        pluginTabs: [{ id: 'linter', name: 'Linter', getSettingDefinitions() { assert.fail('Plugin options must be ignored'); } }],
      },
      internalPlugins: { plugins: { canvas: { enabled: true, name: 'Canvas' } } },
      plugins: { manifests: { linter: { id: 'linter', name: 'Linter', description: 'Format notes.' } }, enabledPlugins: new Set(['linter']) },
      hotkeyManager: { customKeys: { 'editor:toggle-bold': [{ modifiers: ['Mod', 'Shift'], key: 'B' }] } },
    };
    const report = await generateReport(app, DEFAULT_SETTINGS, {
      linter: [{ path: ['Linter', 'Rules'], name: 'PRIVATE_RULE', value: '1' }],
    });
    assert.ok(report.includes(`## ${root} → ${core}\n\n- **Canvas**\n`));
    assert.ok(report.includes(`## ${root} → ${community}\n\n- **[Linter](https://community.obsidian.md/plugins/linter)** Format notes. [Install](obsidian://show-plugin?id=linter)\n`));
    assert.ok(report.includes(`## ${root} → ${hotkeys}\n`));
    assert.ok(report.includes('Mod+Shift+B'));
    assert.doesNotMatch(report, /Rules|PRIVATE_RULE|### .*→ Linter|## Settings →/);
    const disabled = await generateReport(app, { ...DEFAULT_SETTINGS, includeHotkeys: false });
    assert.ok(!disabled.includes(`## ${root} → ${hotkeys}\n`));
    app.hotkeyManager.customKeys = {};
    assert.ok(!(await generateReport(app, DEFAULT_SETTINGS)).includes(`## ${root} → ${hotkeys}\n`));
  }
});

test('self exclusion: never inspect or list Setup Exporter', async () => {
  const id = 'obsidian-setup-exporter';
  const visited = [];
  const app = { vault: { configDir: '.obsidian' },
    setting: { pluginTabs: [{ id, name: 'Setup Exporter' }], open() {}, close() {}, openTabById(tab) { visited.push(tab); } },
    plugins: { manifests: { [id]: { id, name: 'Setup Exporter', version: '1', author: 'Author', description: 'Description' } }, enabledPlugins: new Set([id]) },
  };
  const captured = { [id]: [{ path: ['Setup Exporter'], name: 'Report folder', value: 'Reports' }] };
  assert.deepEqual(Object.keys(await collectSettings(app)), []);
  assert.deepEqual(visited, []);
  assert.equal(await generateReport(app, DEFAULT_SETTINGS, captured), '# Obsidian setup\n');
  app.plugins.enabledPlugins.clear();
  assert.equal(await generateReport(app, { ...DEFAULT_SETTINGS, includeDisabled: true }, captured), '# Obsidian setup\n');
  delete app.plugins.manifests[id];
  assert.equal(await generateReport(app, DEFAULT_SETTINGS, captured), '# Obsidian setup\n');
});

test('collector: visit enabled panels in the existing app and restore the initial panel', async () => {
  const editor = renderedPanel('editor', 'Editor', [{ name: 'Line numbers', type: 'checkbox', checked: true }]);
  editor.getSettingDefinitions = () => [
    { name: 'Line numbers', control: { type: 'toggle', key: 'lines', defaultValue: false } },
    { type: 'page', name: 'Advanced', items: [{ name: 'Tab width', control: { type: 'number', key: 'width', defaultValue: 8 } }] },
  ];
  editor.getControlValue = key => key === 'lines' ? true : 4;
  const finition = renderedPanel('finition', 'Finition', [{ name: 'Moteur de cadence', type: 'select', label: 'Rapide' }], 'Cadence');
  const calls = [];
  const ui = {
    settingTabs: [editor], pluginTabs: [finition, { id: 'disabled', name: 'Disabled' }],
    activeTab: { id: 'previous', name: 'Previous' },
    containerEl: { isConnected: false }, titleEl: { textContent: 'Settings' },
    open: () => calls.push('open'), openTabById: id => calls.push(id), close: () => calls.push('close'),
  };
  const captured = await collectSettings({ setting: ui, plugins: {
    manifests: { finition: {}, disabled: {} }, enabledPlugins: new Set(['finition']),
  } });
  assert.deepEqual(calls, ['open', 'editor', 'previous', 'close']);
  assert.match(settingsMarkdown(captured.editor), /Preferences → Editor/);
  assert.equal(captured.editor.filter(entry => entry.name === 'Line numbers').length, 1);
  assert.deepEqual(captured.editor.find(entry => entry.name === 'Tab width').path, ['Preferences → Editor', 'Advanced']);
  assert.match(settingsMarkdown(captured.editor), /- Tab width : \*\*4\*\*/);
  assert.equal(captured.finition, undefined);
  ui.containerEl = { isConnected: true, getClientRects: () => [1] };
  calls.length = 0;
  await collectSettings({ setting: ui });
  assert.equal(calls.at(-1), 'previous');
  assert.ok(!calls.includes('close'));
});

test('collector: isolate a failing plugin and still close newly opened settings', async () => {
  const calls = [];
  const ui = { settingTabs: [{ id: 'broken', name: 'Broken' }],
    activeTab: { id: 'previous' }, open() {},
    openTabById(id) { calls.push(id); throw new Error('BROKEN'); }, close() { calls.push('close'); },
  };
  assert.deepEqual(Object.keys(await collectSettings({ setting: ui })), []);
  assert.deepEqual(calls, ['broken', 'previous', 'close']);
});

test('navigation: retain the native settings title while Obsidian replaces it with each panel name', async () => {
  for (const [title, root] of [['Settings', 'Preferences'], ['Réglages', 'Préférences'], ['Préférences', 'Préférences'], ['Einstellungen', 'Einstellungen']]) {
    const panel = renderedPanel('appearance', 'Appearance', [{ name: 'Font size', type: 'number', value: '23' }]);
    panel.getSettingDefinitions = () => [{ name: 'Font size', control: { type: 'number', key: 'fontSize', defaultValue: 16 } }];
    panel.getControlValue = () => 23;
    const plugin = { id: 'example', name: 'Example' };
    const previous = { id: 'previous', name: 'Previous' };
    const panels = [panel, plugin, previous];
    const ui = {
      settingTabs: [panel], pluginTabs: [plugin], activeTab: previous, titleEl: { textContent: 'Previous' },
      containerEl: { isConnected: true, getClientRects: () => [1] }, open() {},
      updateModalTitle() { this.titleEl.textContent = title; },
      openTabById(id) { this.activeTab = panels.find(panel => panel.id === id); this.titleEl.textContent = this.activeTab.name; },
    };
    const app = { vault: { configDir: '.obsidian' }, setting: ui,
      plugins: { manifests: { example: { id: 'example', name: 'Example', description: 'Description' } }, enabledPlugins: new Set(['example']) },
    };
    const captured = await collectSettings(app);
    assert.deepEqual(captured.appearance[0].path, [`${root} → Appearance`]);
    assert.equal(ui.activeTab, previous);
    assert.equal(ui.titleEl.textContent, 'Previous');
    const report = await generateReport(app, DEFAULT_SETTINGS, captured);
    assert.ok(report.includes(`## ${root} → Appearance\n`));
    assert.ok(report.includes(`## ${root} → Community plugins\n`));
    assert.ok(report.includes('- **[Example](https://community.obsidian.md/plugins/example)**'));
    const groups = settingsMarkdown([
      { path: [`${title} → Example`, 'Group'], name: 'A', value: '1' },
      { path: [`${title} → Example`, 'Group'], name: 'B', value: '2' },
    ]);
    assert.ok(groups.includes(`#### ${title} → Example → Group\n`));
  }
});

test('report: use captured verified differences without reading config or notes', async () => {
  const app = { vault: {
    configDir: '.obsidian', getConfig: () => assert.fail('No configuration catalogue'),
    getMarkdownFiles: () => [], read: () => assert.fail('No vault content'),
  }, setting: { settingTabs: [{ id: 'editor', name: 'Editor' }], pluginTabs: [{ id: 'finition', name: 'Finition' }] },
  plugins: { manifests: { finition: { id: 'finition', name: 'Finition', author: 'Author', version: '1', description: 'Description' } }, enabledPlugins: new Set(['finition']) } };
  const captured = {
    editor: [{ path: ['Settings → Editor', 'Display'], name: 'Line numbers', value: '✓' }],
    finition: [{ path: ['Settings → Finition', 'Répétitions'], name: 'Empan de répétition (caractères)', value: '800' }],
  };
  const report = await generateReport(app, DEFAULT_SETTINGS, captured);
  assert.match(report, /## Preferences → Editor\n\n- Line numbers : \*\*✓\*\*/);
  assert.match(report, /## Preferences → Community plugins\n\n- \*\*\[Finition\]\(https:\/\/community.obsidian.md\/plugins\/finition\)\*\* Description \[Install\]/);
  assert.doesNotMatch(report, /Empan de répétition|800|Répétitions/);
  app.plugins.enabledPlugins.clear();
  const disabled = await generateReport(app, { ...DEFAULT_SETTINGS, includeDisabled: true }, captured);
  assert.doesNotMatch(disabled, /Settings → Finition/);
});

test('report: omit empty sections and use unnumbered navigation headings', async () => {
  const app = { vault: { configDir: '.obsidian', getMarkdownFiles: () => [], read: () => assert.fail('No content') } };
  assert.equal(await generateReport(app, DEFAULT_SETTINGS), '# Obsidian setup\n');
  app.customCss = { theme: '', enabledSnippets: [] };
  assert.equal(await generateReport(app, DEFAULT_SETTINGS), '# Obsidian setup\n');
  app.customCss.theme = 'My theme';
  const report = await generateReport(app, { ...DEFAULT_SETTINGS, includeHotkeys: true });
  assert.ok(report.includes('## Preferences → Appearance\n\n- **[My theme](https://community.obsidian.md/themes/my-theme)** [Install](obsidian://show-theme?name=My%20theme)'));
  assert.doesNotMatch(report, /^## \d+\./m);
  assert.doesNotMatch(report, /Core plugins|Community plugins|CSS snippets|Templates|Hotkeys/);
  assert.equal(await templatesMarkdown([], true, () => assert.fail('No templates')), '');
});

test('report: keep the configured theme and snippets inside the native Appearance group', async () => {
  const app = {
    vault: { configDir: '.obsidian', getConfig(key) { assert.equal(key, 'cssTheme'); return 'Minimal'; } },
    setting: { settingTabs: [{ id: 'appearance', name: 'Appearance' }], titleEl: { textContent: 'Settings' } },
    customCss: { enabledSnippets: new Set(['Wide headings', 'Custom font']) },
    plugins: { manifests: { example: { id: 'example', name: 'Example', author: 'Author', version: '1', description: 'Description' } }, enabledPlugins: new Set(['example']) },
  };
  const captured = { appearance: [{ path: ['Settings → Appearance', 'Font'], name: 'Font size', value: '18' }] };
  const report = await generateReport(app, DEFAULT_SETTINGS, captured);
  assert.equal(report.match(/## Preferences → Appearance\n/g)?.length, 1);
  assert.ok(report.includes('## Preferences → Appearance\n\n- **[Minimal](https://community.obsidian.md/themes/minimal)** [Install](obsidian://show-theme?name=Minimal)\n- CSS snippets : **Custom font, Wide headings**\n- Font size : **18**'));
  assert.doesNotMatch(report, /#### Font/);
  assert.ok(report.indexOf('Minimal') < report.indexOf('## Preferences → Community plugins'));
  assert.doesNotMatch(report, /## \d+\. Appearance/);
  const withoutOptions = await generateReport(app, DEFAULT_SETTINGS);
  assert.ok(withoutOptions.includes('## Preferences → Appearance\n\n- **[Minimal](https://community.obsidian.md/themes/minimal)** [Install](obsidian://show-theme?name=Minimal)'));
  captured.appearance.push({ path: ['Settings → Appearance'], name: 'Theme', value: 'Minimal' });
  const deduplicated = await generateReport(app, DEFAULT_SETTINGS, captured);
  assert.equal(deduplicated.match(/- \*\*\[Minimal\]/g)?.length, 1);
  assert.doesNotMatch(deduplicated, /- Theme :/);
});

test('active theme: match plugin presentation using runtime description and installation link', async () => {
  const app = { vault: { configDir: '.obsidian' }, customCss: {
    theme: 'CrouzetTheme', themes: {
      CrouzetTheme: { description: 'Un thème clair et sombre.', get dir() { assert.fail('Theme paths must not be read'); } },
      Inactive: { get description() { assert.fail('Inactive theme must not be read'); } },
    },
  } };
  const report = await generateReport(app, DEFAULT_SETTINGS);
  assert.equal(report, '# Obsidian setup\n\n## Preferences → Appearance\n\n- **[CrouzetTheme](https://community.obsidian.md/themes/crouzettheme)** Un thème clair et sombre. [Install](obsidian://show-theme?name=CrouzetTheme)\n');
  assert.doesNotMatch(report, / — |Inactive|Theme :|&#/);
  delete app.customCss.themes.CrouzetTheme.description;
  assert.ok((await generateReport(app, DEFAULT_SETTINGS)).includes('** [Install](obsidian://show-theme?name=CrouzetTheme)'));
  app.customCss.theme = 'Mon thème';
  app.customCss.themes['Mon thème'] = { description: 'Avec des accents.' };
  assert.ok((await generateReport(app, DEFAULT_SETTINGS)).includes('[Mon thème](https://community.obsidian.md/themes/mon-theme)** Avec des accents. [Install](obsidian://show-theme?name=Mon%20th%C3%A8me)'));
});

test('theme description: extract the public About text and decode HTML entities', () => {
  const html = '<meta name="description" content="A theme for Obsidian"><div><div class="heading">About</div> Apply &quot;Solarized&quot; &amp; light&#x2F;dark. L&#39;accent &#233; &#x1f31e; &nbsp; &lt;markup&gt;.</div><div>Details</div>';
  assert.equal(communityThemeDescription(html), 'Apply "Solarized" & light/dark. L\'accent é 🌞 <markup>.');
  assert.equal(communityThemeDescription('<meta name="description" content="Generic description">'), undefined);
  assert.equal(communityThemeDescription('<div>About</div>  </div>'), undefined);
  assert.equal(communityThemeDescription('<div>About</div>&#99999999; &#xD800;</div>'), '� �');
});

test('theme description: fetch only when missing and keep exporting if metadata is unavailable', async () => {
  const app = { vault: { configDir: '.obsidian' }, customCss: { theme: 'CrouzetTheme', themes: {} } };
  const requests = [];
  const load = async url => { requests.push(url); return communityThemeDescription('<div><div>About</div>Theme &amp; colors.</div>'); };
  const report = await generateReport(app, DEFAULT_SETTINGS, {}, load);
  assert.deepEqual(requests, ['https://community.obsidian.md/themes/crouzettheme']);
  assert.ok(report.includes('** Theme & colors. [Install](obsidian://show-theme?name=CrouzetTheme)'));
  app.customCss.themes.CrouzetTheme = { description: 'Native description.' };
  assert.ok((await generateReport(app, DEFAULT_SETTINGS, {}, load)).includes('** Native description. [Install]'));
  assert.equal(requests.length, 1);
  delete app.customCss.themes.CrouzetTheme.description;
  const offline = await generateReport(app, DEFAULT_SETTINGS, {}, async () => { throw new Error('Offline'); });
  assert.ok(offline.includes('** [Install](obsidian://show-theme?name=CrouzetTheme)'));
  app.customCss.theme = '';
  await generateReport(app, DEFAULT_SETTINGS, {}, load);
  assert.equal(requests.length, 1);
});

test('settings: private opt-ins default off, hotkeys default on and explicit opt-outs persist', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({
    outputFolder: '../../elsewhere', includeDisabled: 'false',
    includeTemplateContent: 'true', includeHotkeys: 1,
  }), DEFAULT_SETTINGS);
  assert.equal(parseSettings({ outputFolder: 'Partage', includeTemplateContent: true }).includeTemplateContent, true);
  assert.equal(DEFAULT_SETTINGS.includeHotkeys, true);
  assert.equal(parseSettings({ includeHotkeys: false }).includeHotkeys, false);
  assert.equal(DEFAULT_SETTINGS.outputFolder, '');
  assert.equal(parseSettings({ outputFolder: '' }).outputFolder, '');
  assert.equal(parseSettings({ outputFolder: 'Partage' }).outputFolder, 'Partage');
  assert.equal(reportPath(DEFAULT_SETTINGS.outputFolder, '.obsidian'), 'Setup-Export.md');
});

test('paths: accept vault-relative folders and reject absolute, hidden and traversal paths', () => {
  assert.equal(vaultPath('', true), '');
  assert.equal(vaultPath('Partage/Configuration/'), 'Partage/Configuration');
  assert.equal(vaultPath('Modèles français'), 'Modèles français');
  for (const path of [
    '', '/', '/tmp/notes', 'C:\\Users\\Someone', 'C:/notes', '\\\\server\\share',
    '~/notes', '../notes', 'notes/../outside', './notes', '.obsidian',
    'notes/.private', 'notes//templates', 'notes/ bad', 'notes\nsecret',
    'notes/#heading', 'https://example.com', 'notes/[[linked]]',
  ]) assert.equal(vaultPath(path), null, JSON.stringify(path));
});

test('metadata: escape active Markdown, HTML and Obsidian embeds', () => {
  const rendered = publicText('![remote](https://example.com/image) <img src=x> ![[Note]] $code$ `code`');
  assert.doesNotMatch(rendered, /(?<!\\)!\[|(?<!\\)<img|(?<!\\)\[\[|(?<!\\)`|(?<!\\)\$/);
  assert.doesNotMatch(rendered, /&#\d+;/);
  assert.equal(publicText("Antidote! L'auteur & ses options"), "Antidote! L'auteur & ses options");
  assert.equal(publicText(false), 'false');
});

test('report paths: reject the configuration folder, including custom nonhidden directories', () => {
  assert.equal(reportPath('', '.obsidian'), 'Setup-Export.md');
  assert.equal(reportPath('Partage', '.obsidian'), 'Partage/Setup-Export.md');
  for (const folder of ['Config', 'Config/Reports', 'CONFIG', 'config/Reports', '../outside', '/tmp', '.obsidian']) {
    assert.throws(() => reportPath(folder, 'Config'), /Invalid output folder/);
  }
});

test('metadata: mask absolute paths and recognizable credentials', () => {
  for (const value of [
    '/opt/private/file', 'Located in /Users/person/vault', 'C:\\Users\\Person',
    '\\\\server\\private', '//server/private', '~/private', 'file:///private/key',
    'apiKey=PRIVATE_SENTINEL', 'token: PRIVATE_SENTINEL', 'sk-PRIVATE_SENTINEL',
  ]) assert.equal(publicText(value), MASKED, value);
});

test('plugin list: one bold community link, description and trailing install link per bullet', async () => {
  const app = { vault: { configDir: '.obsidian' }, plugins: {
    manifests: {
      finition: { id: 'finition', name: 'Finition', description: 'Améliore la rédaction.' },
      encoded: { id: 'plugin/id?x=y', name: 'Other', description: '' },
    }, enabledPlugins: new Set(['finition', 'plugin/id?x=y']),
  } };
  const report = await generateReport(app, DEFAULT_SETTINGS);
  assert.deepEqual(report.split('\n').filter(line => line.startsWith('- ')), [
    '- **[Finition](https://community.obsidian.md/plugins/finition)** Améliore la rédaction. [Install](obsidian://show-plugin?id=finition)',
    '- **[Other](https://community.obsidian.md/plugins/plugin%2Fid%3Fx%3Dy)** [Install](obsidian://show-plugin?id=plugin%2Fid%3Fx%3Dy)',
  ]);
  assert.ok(report.startsWith('# Obsidian setup\n'));
  assert.doesNotMatch(report, /setup-exporter:report|^### |GitHub|github.com|^- (?:ID|Version|Author|Status|Description) :/m);
});

test('templates: restrict selection to configured folders, excluding report and config', () => {
  const files = [
    'Templates/one.md', 'Templates/Sub/two.md', 'Templates-other/private.md',
    'Templates/Setup-Export.md', 'Templates/setup-export.md', 'Templates/.private/secret.md',
    'Templates/Config/private.md', 'Templates/config/private.md', 'Notes/private.md',
  ].map(path => ({ path }));
  const selected = selectTemplates(files, ['Templates', 'Templates/Sub'], 'Templates/Setup-Export.md', 'Templates/Config');
  assert.deepEqual(selected.map(file => file.path), ['Templates/one.md', 'Templates/Sub/two.md']);
  assert.deepEqual(selectTemplates(files, [], 'Setup-Export.md', '.obsidian'), []);
});

test('templates: content is never read without explicit opt-in', async () => {
  const report = await templatesMarkdown([{ path: 'Templates/example.md' }], false, () => {
    assert.fail('Template content was read without consent');
  });
  assert.match(report, /Templates\/example.md/);
  assert.doesNotMatch(report, /PRIVATE_SENTINEL/);
});

test('templates: explicit content is fenced safely and read errors propagate', async () => {
  const content = '```markdown\n![[Private]]\n```\n````\nPRIVATE_SENTINEL';
  const report = await templatesMarkdown([{ path: 'Templates/example.md' }], true, async () => content);
  assert.match(report, /`````markdown/);
  assert.ok(report.includes(content));
  await assert.rejects(templatesMarkdown([{ path: 'Templates/example.md' }], true, async () => {
    throw new Error('READ_FAILED');
  }), /READ_FAILED/);
  assert.equal(codeBlock('ordinary text', 'markdown'), '```markdown\nordinary text\n```');
  assert.ok(codeBlock('` '.repeat(200_000), 'markdown').startsWith('```markdown\n'));
});

test('hotkeys: retain customized bindings and explicit removal, reject private identifiers', () => {
  const report = hotkeysMarkdown({
    'editor:toggle-source': [{ modifiers: ['Mod', 'Shift'], key: 'E' }],
    'editor:toggle-bold': [],
    'templater-obsidian:Templates/PRIVATE_SENTINEL.md': [{ modifiers: [], key: 'E' }],
    'unsafe:binding': [{ modifiers: ['PRIVATE_SENTINEL'], key: 'E' }],
    'unsafe:key': [{ modifiers: [], key: 'PRIVATE_SENTINEL' }],
  });
  assert.match(report, /Mod\+Shift\+E/);
  assert.match(report, /Disabled/);
  assert.doesNotMatch(report, /PRIVATE_SENTINEL|unsafe/);
  assert.equal(hotkeysMarkdown({}), '');
  assert.equal(hotkeysMarkdown(undefined), '');
});

test('report updates: recognize legacy markers and locally owned reports without emitting a marker', async () => {
  const replacement = '# Obsidian setup\n';
  assert.equal(replaceReport(`${REPORT_MARKER}\nold report`, replacement), replacement);
  assert.equal(replaceReport('# Obsidian setup\nPrevious', replacement, '# Obsidian setup\nPrevious'), replacement);
  assert.throws(() => replaceReport('# Personal note', replacement, '# Obsidian setup\nPrevious'), /has been edited/);
  for (const previous of ['', '# Personal note', `# Note\n${REPORT_MARKER}\n`]) {
    assert.throws(() => replaceReport(previous, replacement), /was not generated by Setup Exporter/);
  }
  let content;
  const file = { path: 'Setup-Export.md', extension: 'md' };
  const vault = { configDir: '.obsidian', getAbstractFileByPath: () => null,
    create: async (_path, value) => { content = value; return file; },
  };
  await saveReport(vault, '', replacement);
  assert.equal(content, replacement);
  vault.getAbstractFileByPath = () => file;
  vault.process = async (_file, callback) => { content = callback(content); };
  await assert.rejects(saveReport(vault, '', replacement), /was not generated/);
  await saveReport(vault, '', replacement, replacement);
  assert.equal(content, replacement);
  content = `${REPORT_MARKER}\nOld report`;
  await saveReport(vault, '', replacement);
  assert.equal(content, replacement);
});

test('report ownership: keep generated paths across plugin reloads and settings saves', async () => {
  const { build } = await import('esbuild');
  const bundle = await build({ entryPoints: ['plugin/main.ts'], bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'obsidian-fixture', setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export class Plugin {
          constructor(app) { this.app = app; }
          async loadData() { return this.app.stored; }
          async saveData(value) { this.app.stored = structuredClone(value); }
          addCommand() {} addSettingTab() {}
        }
        export class PluginSettingTab { constructor(app) { this.app = app; } }
        export class Notice {} export class Setting {}
        export async function requestUrl({ url }) {
          if (url !== 'https://community.obsidian.md/themes/crouzettheme') throw new Error('Network unavailable');
          return { status: 200, text: '<div><div>About</div>Theme description from community.</div>' };
        }
      ` }));
    } }],
  });
  const { default: Exporter } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  let content;
  let updates = 0;
  const file = { path: 'Setup-Export.md', extension: 'md' };
  const app = { stored: null, vault: { configDir: '.obsidian',
    getAbstractFileByPath: () => content === undefined ? null : file,
    create: async (_path, value) => { content = value; return file; },
    process: async (_file, callback) => { content = callback(content); updates++; },
  }, workspace: { getLeaf: () => ({ openFile: async () => {} }) } };
  const first = new Exporter(app);
  await first.onload();
  await first.exportReport();
  assert.equal(content, '# Obsidian setup\n');
  assert.deepEqual(app.stored.generatedReports, { 'Setup-Export.md': content });
  const second = new Exporter(app);
  await second.onload();
  second.settings.includeHotkeys = true;
  await second.saveSettings();
  assert.deepEqual(app.stored.generatedReports, { 'Setup-Export.md': content });
  await second.exportReport();
  assert.equal(updates, 1);
  assert.equal(content, '# Obsidian setup\n');
  content = '# Personal note';
  await second.exportReport();
  assert.equal(content, '# Personal note');
  assert.equal(updates, 1);
  content = app.stored.generatedReports['Setup-Export.md'];
  app.customCss = { theme: 'CrouzetTheme' };
  await second.exportReport();
  assert.ok(content.includes('** Theme description from community. [Install](obsidian://show-theme?name=CrouzetTheme)'));
  assert.equal(updates, 2);
  app.customCss.theme = 'Offline';
  await second.exportReport();
  assert.ok(content.includes('** [Install](obsidian://show-theme?name=Offline)'));
  assert.equal(updates, 3);
});
