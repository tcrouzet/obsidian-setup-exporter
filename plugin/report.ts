import type { App, TFile, Vault } from 'obsidian';
import { codeBlock, publicText, record, vaultPath } from './privacy.ts';
import { panelSettings, settingsMarkdown, settingsPath } from './settings.ts';
import type { SettingsEntry, SettingsPanel, SettingsUI } from './settings.ts';

export interface ExportSettings {
  outputFolder: string;
  includeDisabled: boolean;
  includeTemplateContent: boolean;
  includeHotkeys: boolean;
}

export const DEFAULT_SETTINGS: ExportSettings = {
  outputFolder: '',
  includeDisabled: false,
  includeTemplateContent: false,
  includeHotkeys: true,
};

export function parseSettings(value: unknown): ExportSettings {
  const settings = record(value);
  return {
    outputFolder: vaultPath(settings.outputFolder, true) ?? DEFAULT_SETTINGS.outputFolder,
    includeDisabled: settings.includeDisabled === true,
    includeTemplateContent: settings.includeTemplateContent === true,
    includeHotkeys: typeof settings.includeHotkeys === 'boolean' ? settings.includeHotkeys : DEFAULT_SETTINGS.includeHotkeys,
  };
}

export function reportPath(folder: string, configDir: string): string {
  const path = vaultPath(folder, true);
  if (path === null || (configDir && isWithinFolder(path, configDir))) {
    throw new Error('Invalid output folder.');
  }
  return `${path ? `${path}/` : ''}Setup-Export.md`;
}

function isWithinFolder(path: string, folder: string): boolean {
  const candidate = path.toLowerCase();
  const parent = folder.toLowerCase();
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

interface LoadedPlugin {
  settings?: unknown;
  options?: unknown;
}

interface InternalPlugin {
  enabled?: boolean;
  name?: string;
  instance?: LoadedPlugin & { name?: string };
}

interface Manifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
}

// Obsidian does not declare these requested runtime interfaces in its public types.
export interface RuntimeApp {
  vault: Pick<Vault, 'getMarkdownFiles' | 'read' | 'configDir'> & { getConfig?: (key: string) => unknown };
  setting?: SettingsUI;
  internalPlugins?: { plugins?: Record<string, InternalPlugin>; getEnabledPluginById?: (id: string) => unknown };
  plugins?: {
    manifests?: Record<string, Manifest>;
    enabledPlugins?: Set<string>;
    plugins?: Record<string, LoadedPlugin>;
  };
  customCss?: { theme?: string; themes?: Record<string, { description?: string }>; enabledSnippets?: Set<string> | string[] };
  hotkeyManager?: { customKeys?: unknown };
}

export function runtimeApp(app: App): RuntimeApp {
  return app as unknown as RuntimeApp;
}

export function pluginOptions(plugin: LoadedPlugin | undefined): unknown {
  return plugin?.settings ?? plugin?.options;
}

function coreEnabled(app: RuntimeApp, id: string): boolean {
  const manager = app.internalPlugins;
  return manager?.getEnabledPluginById ? Boolean(manager.getEnabledPluginById(id)) : manager?.plugins?.[id]?.enabled === true;
}

function linkedItem(name: string, description: unknown, url: string, installUrl: string): string {
  return `- **[${publicText(name)}](${url})**${typeof description === 'string' && description ? ` ${publicText(description)}` : ''} [Install](${installUrl})`;
}

export function communityThemeDescription(html: string): string | undefined {
  const about = html.match(/>\s*About\s*<\/div>\s*([^<]+)<\/div>/i)?.[1];
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return about?.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()]!;
    const hex = entity[1]?.toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '�';
  }).replace(/\s+/g, ' ').trim() || undefined;
}

export function templateFolders(app: RuntimeApp): string[] {
  const templates = app.internalPlugins?.plugins?.templates;
  const templaterEnabled = app.plugins?.enabledPlugins?.has('templater-obsidian');
  const templater = app.plugins?.plugins?.['templater-obsidian'];
  return [...new Set([
    coreEnabled(app, 'templates') ? record(pluginOptions(templates?.instance)).folder : undefined,
    templaterEnabled ? record(pluginOptions(templater)).templates_folder : undefined,
  ].map(path => vaultPath(path)).filter((path): path is string => path !== null))];
}

export function selectTemplates<T extends { path: string }>(files: T[], folders: string[], outputPath: string, configDir: string): T[] {
  return files.filter(file => vaultPath(file.path) !== null && file.path.toLowerCase() !== outputPath.toLowerCase() &&
    !isWithinFolder(file.path, configDir) &&
    folders.some(folder => file.path.startsWith(`${folder}/`)))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function templatesMarkdown<T extends { path: string }>(files: T[], includeContent: boolean, read: (file: T) => Promise<string>): Promise<string> {
  const lines = [files.map(file => `- ${publicText(file.path)}`).join('\n')];
  if (includeContent && files.length) {
    for (const file of files) lines.push(`### ${publicText(file.path)}`, codeBlock(await read(file), 'markdown'));
  }
  return lines.join('\n\n');
}

export function hotkeysMarkdown(value: unknown): string {
  if (value === undefined || value === null) return '';
  const rows: string[] = [];
  for (const [command, bindings] of Object.entries(record(value)).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/i.test(command) || !Array.isArray(bindings)) continue;
    if (!bindings.length) {
      rows.push(`| ${publicText(command)} | Disabled |`);
      continue;
    }
    const shortcuts: string[] = [];
    for (const binding of bindings) {
      const { modifiers, key } = record(binding);
      if (!Array.isArray(modifiers) || !modifiers.every(mod => ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'].includes(mod))) continue;
      if (typeof key !== 'string' || !/^(?:[^\s]{1}|F(?:[1-9]|1[0-9]|2[0-4])|Enter|Tab|Space|Backspace|Delete|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/u.test(key)) continue;
      shortcuts.push(publicText([...modifiers, key].join('+')));
    }
    if (shortcuts.length) rows.push(`| ${publicText(command)} | ${shortcuts.join(', ')} |`);
  }
  return rows.length ? [`| Command | Custom hotkey |`, '| --- | --- |', ...rows].join('\n') : '';
}

export async function generateReport(
  app: RuntimeApp,
  settings: ExportSettings,
  captured: Record<string, SettingsEntry[]> = {},
  loadThemeDescription?: (url: string) => Promise<string | undefined>,
): Promise<string> {
  const outputPath = reportPath(settings.outputFolder, app.vault.configDir);
  const panels = [...app.setting?.settingTabs ?? [], ...app.setting?.pluginTabs ?? []].filter(panel => panel.id !== 'obsidian-setup-exporter');
  const generalPanels = panels.filter(panel => !app.setting?.pluginTabs?.includes(panel) && !['plugins', 'community-plugins', 'hotkeys'].includes(panel.id) && !app.internalPlugins?.plugins?.[panel.id] && !app.plugins?.manifests?.[panel.id]);
  const sections = [`# Obsidian setup`];
  const addSection = (title: string, content: string): void => {
    if (content.trim()) sections.push(`## ${title}`, content);
  };
  const entries = (panel: SettingsPanel): SettingsEntry[] => (captured[panel.id] ?? panelSettings(panel))
    .map(entry => ({ ...entry, path: [settingsPath(app.setting, panel.name), ...entry.path.slice(1)] }));
  const general = generalPanels.flatMap(entries);
  const appearance = generalPanels.find(panel => panel.id === 'appearance');
  const appearancePath = (appearance && entries(appearance)[0]?.path[0]) ??
    settingsPath(app.setting, appearance?.name ?? 'Appearance');
  const theme = app.customCss?.theme || (appearance ? app.vault.getConfig?.('cssTheme') : undefined);
  if (typeof theme === 'string' && theme) {
    const slug = theme.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || theme;
    const url = `https://community.obsidian.md/themes/${encodeURIComponent(slug)}`;
    let description = app.customCss?.themes?.[theme]?.description;
    if (!description?.trim() && loadThemeDescription) {
      try { description = await loadThemeDescription(url); }
      catch { /* Optional metadata must not prevent report generation. */ }
    }
    const markdown = linkedItem(theme, description, url, `obsidian://show-theme?name=${encodeURIComponent(theme)}`);
    const existing = general.find(entry => entry.path[0] === appearancePath && entry.name === 'Theme' && entry.value === publicText(theme));
    if (existing) existing.markdown = markdown;
    else general.push({ path: [appearancePath], name: 'Theme', value: publicText(theme), markdown });
  }
  const snippets = Array.from(app.customCss?.enabledSnippets ?? []).sort();
  if (snippets.length) general.push({ path: [appearancePath], name: 'CSS snippets', value: snippets.map(publicText).join(', ') });
  sections.push(settingsMarkdown(general, 2));
  const core = Object.entries(app.internalPlugins?.plugins ?? {}).filter(([id]) => coreEnabled(app, id)).sort(([a], [b]) => a.localeCompare(b));
  const coreSections: string[] = [];
  for (const [id, plugin] of core) {
    const panel = panels.find(panel => panel.id === id);
    const name = panel?.name ?? plugin.name ?? plugin.instance?.name ?? id;
    coreSections.push(`- **${publicText(name)}**`);
  }
  const coreTitle = app.setting?.corePluginTabHeaderGroup?.textContent?.trim() ?? panels.find(panel => panel.id === 'plugins')?.name ?? 'Core plugins';
  addSection(settingsPath(app.setting, coreTitle), coreSections.join('\n'));
  const manifests = Object.values(app.plugins?.manifests ?? {})
    .filter(manifest => manifest.id !== 'obsidian-setup-exporter' && (settings.includeDisabled || app.plugins?.enabledPlugins?.has(manifest.id)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const communitySections: string[] = [];
  for (const manifest of manifests) {
    communitySections.push(
      linkedItem(manifest.name, manifest.description, `https://community.obsidian.md/plugins/${encodeURIComponent(manifest.id)}`, `obsidian://show-plugin?id=${encodeURIComponent(manifest.id)}`),
    );
  }
  const communityTitle = app.setting?.communityPluginTabHeaderGroup?.textContent?.trim() ?? panels.find(panel => panel.id === 'community-plugins')?.name ?? 'Community plugins';
  addSection(settingsPath(app.setting, communityTitle), communitySections.join('\n'));
  const folders = templateFolders(app);
  if (folders.length) {
    const files = selectTemplates(app.vault.getMarkdownFiles(), folders, outputPath, app.vault.configDir);
    const name = panels.find(panel => panel.id === 'templates')?.name ?? 'Templates';
    addSection(settingsPath(app.setting, `${coreTitle} → ${name}`), [`Folders : ${folders.map(publicText).join(', ')}`, await templatesMarkdown(files, settings.includeTemplateContent, file => app.vault.read(file))].filter(Boolean).join('\n\n'));
  }
  if (settings.includeHotkeys) addSection(settingsPath(app.setting, panels.find(panel => panel.id === 'hotkeys')?.name ?? 'Hotkeys'), hotkeysMarkdown(app.hotkeyManager?.customKeys));
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}

export const REPORT_MARKER = '<!-- setup-exporter:report -->';

export function replaceReport(previous: string, content: string, previousReport?: string): string {
  if (previous !== previousReport && !previous.startsWith(`${REPORT_MARKER}\n`)) throw new Error('Setup-Export.md already exists and was not generated by Setup Exporter, or has been edited. Move it or choose another folder.');
  return content;
}

export async function ensureFolder(vault: Pick<Vault, 'getAbstractFileByPath' | 'createFolder'>, folder: string): Promise<void> {
  let parent = '';
  for (const part of folder.split('/').filter(Boolean)) {
    parent += `${parent ? '/' : ''}${part}`;
    const existing = vault.getAbstractFileByPath(parent);
    if (existing && !('children' in existing)) throw new Error('An existing file occupies the output folder path.');
    if (!existing) await vault.createFolder(parent);
  }
}

export async function saveReport(
  vault: Pick<Vault, 'getAbstractFileByPath' | 'createFolder' | 'create' | 'process' | 'configDir'>,
  folder: string,
  report: string,
  previousReport?: string,
): Promise<TFile> {
  const path = reportPath(folder, vault.configDir);
  await ensureFolder(vault, path.split('/').slice(0, -1).join('/'));
  const existing = vault.getAbstractFileByPath(path);
  if (!existing) return vault.create(path, report);
  if (!('extension' in existing)) throw new Error('An existing folder occupies the report path.');
  const file = existing as TFile;
  await vault.process(file, previous => replaceReport(previous, report, previousReport));
  return file;
}
