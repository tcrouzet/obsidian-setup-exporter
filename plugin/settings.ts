import type { SettingDefinitionItem } from 'obsidian';
import { publicText } from './privacy.ts';

export interface SettingsPanel {
  id: string;
  name: string;
  containerEl?: HTMLElement;
  settingItems?: SettingDefinitionItem[];
  getSettingDefinitions?: () => SettingDefinitionItem[];
  getControlValue?: (key: string) => unknown;
}

export interface SettingsUI {
  settingTabs?: SettingsPanel[];
  pluginTabs?: SettingsPanel[];
  activeTab?: SettingsPanel;
  containerEl?: HTMLElement;
  titleEl?: HTMLElement;
  open?: () => void;
  close?: () => void;
  openTabById?: (id: string) => void;
  updateModalTitle?: () => void;
  corePluginTabHeaderGroup?: HTMLElement;
  communityPluginTabHeaderGroup?: HTMLElement;
}

const settingsTitles = new WeakMap<SettingsUI, string>();

export function settingsPath(ui: SettingsUI | undefined, name: string): string {
  const title = ui && (settingsTitles.get(ui) ?? ui.titleEl?.textContent?.trim());
  const panelTitle = ui && [...ui.settingTabs ?? [], ...ui.pluginTabs ?? []].some(panel => panel.name === title);
  const root = !title || title === 'Settings' || title === name || title === ui?.activeTab?.name || panelTitle ? 'Preferences'
    : ['Paramètres', 'Réglages'].includes(title) ? 'Préférences' : title;
  return `${root} → ${name}`;
}

export interface SettingsEntry {
  path: string[];
  name: string;
  value: string;
  markdown?: string;
}

export function settingsMarkdown(entries: SettingsEntry[], level = 3): string {
  interface Group { entries: SettingsEntry[]; children: Map<string, Group> }
  const root: Group = { entries: [], children: new Map() };
  for (const entry of entries) {
    let group = root;
    const path = entry.path.filter((name, index) => index === 0 ||
      (name !== entry.path[index - 1] && !entry.path[index - 1].endsWith(` → ${name}`)));
    for (const name of path) {
      if (!group.children.has(name)) group.children.set(name, { entries: [], children: new Map() });
      group = group.children.get(name)!;
    }
    group.entries.push(entry);
  }
  function render(group: Group, depth: number, path: string[] = []): string {
    const entries = [...group.entries];
    const sections: string[] = [];
    for (const [name, child] of group.children) {
      if (depth > level && child.entries.length === 1 && child.children.size === 0) entries.push(child.entries[0]);
      else sections.push(`${'#'.repeat(Math.min(depth, 6))} ${publicText([...path, name].join(' → '))}\n\n${render(child, depth + 1, [...path, name])}`);
    }
    const lines = entries.map(entry => entry.markdown ?? `- ${publicText(entry.name)} : **${entry.value}**`).join('\n');
    return [lines, ...sections].filter(Boolean).join('\n\n');
  }
  return render(root, level);
}

function sensitive(name: string): boolean {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '');
  return /password|passwd|passphrase|secret|credential|apikey|cleapi|token$|authorization|cookie|session|email|motdepasse|prompt|personaldictionary|dictionnairepersonnel|notecontent|filecontent|^(auth|key|content|body|notes|cache)$/i.test(key);
}

export function controlValue(type: string, value: unknown, selectedLabel?: string): string | null {
  if (type === 'secret' || type === 'password' || type === 'textarea' || type === 'hidden' || type === 'file') return null;
  if (type === 'dropdown' || type === 'select') return selectedLabel === undefined ? null : selectedLabel ? publicText(selectedLabel) : '∅';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'string') return value ? publicText(value) : '∅';
  return null;
}

export function panelSettings(panel: SettingsPanel): SettingsEntry[] {
  const entries: SettingsEntry[] = [];
  function walk(items: SettingDefinitionItem[], path: string[]): void {
    for (const item of items) {
      try {
        if (item.visible === false || (typeof item.visible === 'function' && !item.visible())) continue;
        if ('type' in item) {
          const heading = item.type === 'page' ? item.name : item.heading;
          walk(item.items ?? [], heading ? [...path, heading] : path);
        } else if (item.control && panel.getControlValue && !sensitive(item.control.key) && !sensitive(item.name)) {
          const control = item.control;
          if (['secret', 'textarea', 'file'].includes(control.type)) continue;
          if (!Object.prototype.hasOwnProperty.call(control, 'defaultValue') || control.defaultValue === undefined) continue;
          if (typeof control.defaultValue === 'number' && !Number.isFinite(control.defaultValue)) continue;
          const value = panel.getControlValue(control.key) ?? control.defaultValue;
          if (typeof value !== typeof control.defaultValue || Object.is(value, control.defaultValue)) continue;
          const selected = control.type === 'dropdown' && typeof value === 'string' && Object.prototype.hasOwnProperty.call(control.options, value) ? control.options[value] : undefined;
          const formatted = controlValue(control.type, value, selected);
          if (formatted !== null) entries.push({ path, name: item.name, value: formatted });
        }
      } catch { /* A failing control must not discard the other settings. */ }
    }
  }
  try { walk(panel.settingItems?.length ? panel.settingItems : panel.getSettingDefinitions?.() ?? [], [panel.name]); }
  catch { /* Some plugins provide definitions only after their panel opens. */ }
  return entries;
}

function sectionPath(row: HTMLElement, container: HTMLElement): string[] {
  const sections: string[] = [];
  for (let element: HTMLElement | null = row; element && element !== container; element = element.parentElement) {
    if (element.matches('details')) {
      const name = element.querySelector(':scope > summary')?.textContent?.trim();
      if (name && sections[0] !== name) sections.unshift(name);
      continue;
    }
    for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (!sibling.matches('h1,h2,h3,h4,h5,h6,[role="heading"],.setting-item-heading,.setting-group-heading,.setting-group-title')) continue;
      const name = (sibling.querySelector('.setting-item-name') ?? sibling).textContent?.trim();
      if (name && sections[0] !== name) sections.unshift(name);
      break;
    }
  }
  return sections;
}

export function renderedSettings(panel: SettingsPanel, title = '', changed?: SettingsEntry[]): SettingsEntry[] {
  const container = panel.containerEl;
  if (!container) return [];
  const entries: SettingsEntry[] = [];
  for (const row of container.querySelectorAll<HTMLElement>('.setting-item')) {
    if (row.closest('[hidden],[aria-hidden="true"]') || row.style.display === 'none') continue;
    const name = row.querySelector('.setting-item-name')?.textContent?.trim();
    if (!name || sensitive(name)) continue;
    if (changed && !changed.some(entry => entry.name === name)) continue;
    const values: string[] = [];
    for (const control of row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select,[role="checkbox"],[role="switch"],.checkbox-container')) {
      if (control.closest('.setting-item') !== row || sensitive(`${control.id} ${control.getAttribute('name') ?? ''}`)) continue;
      const type = control.getAttribute('type') ?? '';
      if (['password', 'hidden', 'file', 'button', 'submit', 'radio'].includes(type)) continue;
      const role = control.getAttribute('role');
      const checked = control.getAttribute('aria-checked');
      const toggle = control.classList?.contains('checkbox-container');
      const value = control.tagName === 'SELECT'
        ? controlValue('select', undefined, (control as HTMLSelectElement).selectedOptions[0]?.textContent?.trim())
        : type === 'checkbox' ? controlValue('toggle', (control as HTMLInputElement).checked)
        : role === 'checkbox' || role === 'switch' || toggle ? controlValue('toggle', checked === 'true' ? true : checked === 'false' ? false : toggle ? control.classList.contains('is-enabled') : undefined)
        : controlValue(type, control.value);
      if (value !== null) values.push(value);
    }
    if (!values.length) continue;
    const sections = sectionPath(row, container).filter(section => section !== panel.name);
    entries.push({ path: [title && title !== panel.name ? `${title} → ${panel.name}` : panel.name, ...sections], name, value: values.join(' · ') });
  }
  return entries;
}

export async function collectSettings(app: {
  setting?: SettingsUI;
  internalPlugins?: { plugins?: Record<string, { enabled?: boolean }> };
  plugins?: { manifests?: Record<string, unknown>; enabledPlugins?: Set<string> };
}): Promise<Record<string, SettingsEntry[]>> {
  const ui = app.setting;
  const captured: Record<string, SettingsEntry[]> = Object.create(null);
  if (!ui?.open || !ui.openTabById) return captured;
  const panels = [...ui.settingTabs ?? [], ...ui.pluginTabs ?? []].filter(panel => {
    if (panel.id === 'obsidian-setup-exporter') return false;
    if (app.plugins?.manifests?.[panel.id]) return false;
    if (app.internalPlugins?.plugins?.[panel.id]) return false;
    if (ui.pluginTabs?.includes(panel)) return false;
    return !['hotkeys', 'plugins', 'community-plugins'].includes(panel.id);
  });
  if (!panels.length) return captured;
  const previous = ui.activeTab?.id;
  const wasOpen = Boolean(ui.containerEl?.isConnected && ui.containerEl.getClientRects().length);
  try {
    ui.open();
    ui.updateModalTitle?.();
    const title = ui.titleEl?.textContent?.trim();
    if (title && (ui.updateModalTitle || title !== ui.activeTab?.name)) settingsTitles.set(ui, title);
    for (const panel of panels) {
      try {
        ui.openTabById(panel.id);
        const view = panel.containerEl?.ownerDocument.defaultView;
        if (view) await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()));
        const options = panelSettings(panel);
        const root = settingsPath(ui, panel.name);
        const rendered = renderedSettings(panel, '', options);
        const key = (entry: SettingsEntry): string => [...entry.path.slice(1), entry.name].join('\0');
        const displayed = new Map(rendered.map(entry => [key(entry), entry]));
        captured[panel.id] = options.map(entry => ({ ...entry,
          path: [root, ...(displayed.get(key(entry))?.path.slice(1) ?? entry.path.slice(1))],
        }));
      } catch { /* A broken plugin panel must not discard the rest of the report. */ }
    }
  } finally {
    try { if (previous) ui.openTabById(previous); }
    catch { /* Preserve the report even if the previous plugin panel cannot reopen. */ }
    finally { if (!wasOpen) ui.close?.(); }
  }
  return captured;
}
