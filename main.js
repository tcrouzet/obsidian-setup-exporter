"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugin/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SetupExporter
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// plugin/privacy.ts
var MASKED = "[masqu\xE9]";
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function privateText(text) {
  if (text === "/" || text === "./") return false;
  return /(?:^|[\s"'(=])(?:\/|~[\\/]|[A-Za-z]:[\\/]|\\\\)/.test(text) || /(?:file:\/\/|(?:api[_ -]?key|token|password|secret|authorization)\s*[:=]|\bBearer\s+\S+|\b(?:sk-|gh[pousr]_|github_pat_)[\w-]+|BEGIN[ A-Z]*PRIVATE KEY|\beyJ[\w-]+\.[\w-]+\.[\w-]+)/i.test(text) || /[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i.test(text) || /https?:\/\/[^\s/]+:[^\s/]+@/i.test(text) || /^[a-z0-9_+/=-]{40,}$/i.test(text) && /[0-9]/.test(text);
}
function vaultPath(value, allowRoot = false) {
  if (typeof value !== "string") return null;
  const path = value.trim().replace(/\/$/, "");
  if (!path) return allowRoot && value.trim() === "" ? "" : null;
  if (/[\\:\x00-\x1f\x7f#\[\]|?*<>"~]/.test(path) || path.startsWith("/")) return null;
  if (path.split("/").some((part) => !part || part.startsWith(".") || part.trim() !== part)) return null;
  return path;
}
function publicText(value) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "Indisponible";
  const text = String(value);
  if (privateText(text)) return MASKED;
  return text.replace(/[\\<>`\[\]*_{}|~$]/g, "\\$&").replace(/[\r\n\t]/g, " ");
}
function codeBlock(text, language) {
  let length = 3;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  const fence = "`".repeat(length);
  return `${fence}${language}
${text}
${fence}`;
}

// plugin/settings.ts
var settingsTitles = /* @__PURE__ */ new WeakMap();
function settingsPath(ui, name) {
  const title = ui && (settingsTitles.get(ui) ?? ui.titleEl?.textContent?.trim());
  const panelTitle = ui && [...ui.settingTabs ?? [], ...ui.pluginTabs ?? []].some((panel) => panel.name === title);
  const root = !title || title === "Settings" || title === name || title === ui?.activeTab?.name || panelTitle ? "Preferences" : ["Param\xE8tres", "R\xE9glages"].includes(title) ? "Pr\xE9f\xE9rences" : title;
  return `${root} \u2192 ${name}`;
}
function settingsMarkdown(entries, level = 3) {
  const root = { entries: [], children: /* @__PURE__ */ new Map() };
  for (const entry of entries) {
    let group = root;
    const path = entry.path.filter((name, index) => index === 0 || name !== entry.path[index - 1] && !entry.path[index - 1].endsWith(` \u2192 ${name}`));
    for (const name of path) {
      if (!group.children.has(name)) group.children.set(name, { entries: [], children: /* @__PURE__ */ new Map() });
      group = group.children.get(name);
    }
    group.entries.push(entry);
  }
  function render(group, depth, path = []) {
    const entries2 = [...group.entries];
    const sections = [];
    for (const [name, child] of group.children) {
      if (depth > level && child.entries.length === 1 && child.children.size === 0) entries2.push(child.entries[0]);
      else sections.push(`${"#".repeat(Math.min(depth, 6))} ${publicText([...path, name].join(" \u2192 "))}

${render(child, depth + 1, [...path, name])}`);
    }
    const lines = entries2.map((entry) => entry.markdown ?? `- ${publicText(entry.name)} : **${entry.value}**`).join("\n");
    return [lines, ...sections].filter(Boolean).join("\n\n");
  }
  return render(root, level);
}
function sensitive(name) {
  const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "");
  return /password|passwd|passphrase|secret|credential|apikey|cleapi|token$|authorization|cookie|session|email|motdepasse|prompt|personaldictionary|dictionnairepersonnel|notecontent|filecontent|^(auth|key|content|body|notes|cache)$/i.test(key);
}
function controlValue(type, value, selectedLabel) {
  if (type === "secret" || type === "password" || type === "textarea" || type === "hidden" || type === "file") return null;
  if (type === "dropdown" || type === "select") return selectedLabel === void 0 ? null : selectedLabel ? publicText(selectedLabel) : "\u2205";
  if (typeof value === "boolean") return value ? "\u2713" : "\u2717";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") return value ? publicText(value) : "\u2205";
  return null;
}
function panelSettings(panel) {
  const entries = [];
  function walk(items, path) {
    for (const item of items) {
      try {
        if (item.visible === false || typeof item.visible === "function" && !item.visible()) continue;
        if ("type" in item) {
          const heading = item.type === "page" ? item.name : item.heading;
          walk(item.items ?? [], heading ? [...path, heading] : path);
        } else if (item.control && panel.getControlValue && !sensitive(item.control.key) && !sensitive(item.name)) {
          const control = item.control;
          if (["secret", "textarea", "file"].includes(control.type)) continue;
          if (!Object.prototype.hasOwnProperty.call(control, "defaultValue") || control.defaultValue === void 0) continue;
          if (typeof control.defaultValue === "number" && !Number.isFinite(control.defaultValue)) continue;
          const value = panel.getControlValue(control.key) ?? control.defaultValue;
          if (typeof value !== typeof control.defaultValue || Object.is(value, control.defaultValue)) continue;
          const selected = control.type === "dropdown" && typeof value === "string" && Object.prototype.hasOwnProperty.call(control.options, value) ? control.options[value] : void 0;
          const formatted = controlValue(control.type, value, selected);
          if (formatted !== null) entries.push({ path, name: item.name, value: formatted });
        }
      } catch {
      }
    }
  }
  try {
    walk(panel.settingItems?.length ? panel.settingItems : panel.getSettingDefinitions?.() ?? [], [panel.name]);
  } catch {
  }
  return entries;
}
function sectionPath(row, container) {
  const sections = [];
  for (let element = row; element && element !== container; element = element.parentElement) {
    if (element.matches("details")) {
      const name = element.querySelector(":scope > summary")?.textContent?.trim();
      if (name && sections[0] !== name) sections.unshift(name);
      continue;
    }
    for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (!sibling.matches('h1,h2,h3,h4,h5,h6,[role="heading"],.setting-item-heading,.setting-group-heading,.setting-group-title')) continue;
      const name = (sibling.querySelector(".setting-item-name") ?? sibling).textContent?.trim();
      if (name && sections[0] !== name) sections.unshift(name);
      break;
    }
  }
  return sections;
}
function renderedSettings(panel, title = "", changed) {
  const container = panel.containerEl;
  if (!container) return [];
  const entries = [];
  for (const row of container.querySelectorAll(".setting-item")) {
    if (row.closest('[hidden],[aria-hidden="true"]') || row.style.display === "none") continue;
    const name = row.querySelector(".setting-item-name")?.textContent?.trim();
    if (!name || sensitive(name)) continue;
    if (changed && !changed.some((entry) => entry.name === name)) continue;
    const values = [];
    for (const control of row.querySelectorAll('input,select,[role="checkbox"],[role="switch"],.checkbox-container')) {
      if (control.closest(".setting-item") !== row || sensitive(`${control.id} ${control.getAttribute("name") ?? ""}`)) continue;
      const type = control.getAttribute("type") ?? "";
      if (["password", "hidden", "file", "button", "submit", "radio"].includes(type)) continue;
      const role = control.getAttribute("role");
      const checked = control.getAttribute("aria-checked");
      const toggle = control.classList?.contains("checkbox-container");
      const value = control.tagName === "SELECT" ? controlValue("select", void 0, control.selectedOptions[0]?.textContent?.trim()) : type === "checkbox" ? controlValue("toggle", control.checked) : role === "checkbox" || role === "switch" || toggle ? controlValue("toggle", checked === "true" ? true : checked === "false" ? false : toggle ? control.classList.contains("is-enabled") : void 0) : controlValue(type, control.value);
      if (value !== null) values.push(value);
    }
    if (!values.length) continue;
    const sections = sectionPath(row, container).filter((section) => section !== panel.name);
    entries.push({ path: [title && title !== panel.name ? `${title} \u2192 ${panel.name}` : panel.name, ...sections], name, value: values.join(" \xB7 ") });
  }
  return entries;
}
async function collectSettings(app) {
  const ui = app.setting;
  const captured = /* @__PURE__ */ Object.create(null);
  if (!ui?.open || !ui.openTabById) return captured;
  const panels = [...ui.settingTabs ?? [], ...ui.pluginTabs ?? []].filter((panel) => {
    if (panel.id === "obsidian-setup-exporter") return false;
    if (app.plugins?.manifests?.[panel.id]) return false;
    if (app.internalPlugins?.plugins?.[panel.id]) return false;
    if (ui.pluginTabs?.includes(panel)) return false;
    return !["hotkeys", "plugins", "community-plugins"].includes(panel.id);
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
        if (view) await new Promise((resolve) => view.requestAnimationFrame(() => resolve()));
        const options = panelSettings(panel);
        const root = settingsPath(ui, panel.name);
        const rendered = renderedSettings(panel, "", options);
        const key = (entry) => [...entry.path.slice(1), entry.name].join("\0");
        const displayed = new Map(rendered.map((entry) => [key(entry), entry]));
        captured[panel.id] = options.map((entry) => ({
          ...entry,
          path: [root, ...displayed.get(key(entry))?.path.slice(1) ?? entry.path.slice(1)]
        }));
      } catch {
      }
    }
  } finally {
    try {
      if (previous) ui.openTabById(previous);
    } catch {
    } finally {
      if (!wasOpen) ui.close?.();
    }
  }
  return captured;
}

// plugin/report.ts
var DEFAULT_SETTINGS = {
  outputFolder: "",
  includeDisabled: false,
  includeTemplateContent: false,
  includeHotkeys: true
};
function parseSettings(value) {
  const settings = record(value);
  return {
    outputFolder: vaultPath(settings.outputFolder, true) ?? DEFAULT_SETTINGS.outputFolder,
    includeDisabled: settings.includeDisabled === true,
    includeTemplateContent: settings.includeTemplateContent === true,
    includeHotkeys: typeof settings.includeHotkeys === "boolean" ? settings.includeHotkeys : DEFAULT_SETTINGS.includeHotkeys
  };
}
function reportPath(folder, configDir) {
  const path = vaultPath(folder, true);
  if (path === null || configDir && isWithinFolder(path, configDir)) {
    throw new Error("Invalid output folder.");
  }
  return `${path ? `${path}/` : ""}Setup-Export.md`;
}
function isWithinFolder(path, folder) {
  const candidate = path.toLowerCase();
  const parent = folder.toLowerCase();
  return candidate === parent || candidate.startsWith(`${parent}/`);
}
function runtimeApp(app) {
  return app;
}
function pluginOptions(plugin) {
  return plugin?.settings ?? plugin?.options;
}
function coreEnabled(app, id) {
  const manager = app.internalPlugins;
  return manager?.getEnabledPluginById ? Boolean(manager.getEnabledPluginById(id)) : manager?.plugins?.[id]?.enabled === true;
}
function linkedItem(name, description, url, installUrl) {
  return `- **[${publicText(name)}](${url})**${typeof description === "string" && description ? ` ${publicText(description)}` : ""} [Install](${installUrl})`;
}
function communityThemeDescription(html) {
  const about = html.match(/>\s*About\s*<\/div>\s*([^<]+)<\/div>/i)?.[1];
  const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return about?.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()];
    const hex = entity[1]?.toLowerCase() === "x";
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 1114111 && (code < 55296 || code > 57343) ? String.fromCodePoint(code) : "\uFFFD";
  }).replace(/\s+/g, " ").trim() || void 0;
}
function templateFolders(app) {
  const templates = app.internalPlugins?.plugins?.templates;
  const templaterEnabled = app.plugins?.enabledPlugins?.has("templater-obsidian");
  const templater = app.plugins?.plugins?.["templater-obsidian"];
  return [...new Set([
    coreEnabled(app, "templates") ? record(pluginOptions(templates?.instance)).folder : void 0,
    templaterEnabled ? record(pluginOptions(templater)).templates_folder : void 0
  ].map((path) => vaultPath(path)).filter((path) => path !== null))];
}
function selectTemplates(files, folders, outputPath, configDir) {
  return files.filter((file) => vaultPath(file.path) !== null && file.path.toLowerCase() !== outputPath.toLowerCase() && !isWithinFolder(file.path, configDir) && folders.some((folder) => file.path.startsWith(`${folder}/`))).sort((a, b) => a.path.localeCompare(b.path));
}
async function templatesMarkdown(files, includeContent, read) {
  const lines = [files.map((file) => `- ${publicText(file.path)}`).join("\n")];
  if (includeContent && files.length) {
    for (const file of files) lines.push(`### ${publicText(file.path)}`, codeBlock(await read(file), "markdown"));
  }
  return lines.join("\n\n");
}
function hotkeysMarkdown(value) {
  if (value === void 0 || value === null) return "";
  const rows = [];
  for (const [command, bindings] of Object.entries(record(value)).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/i.test(command) || !Array.isArray(bindings)) continue;
    if (!bindings.length) {
      rows.push(`| ${publicText(command)} | Disabled |`);
      continue;
    }
    const shortcuts = [];
    for (const binding of bindings) {
      const { modifiers, key } = record(binding);
      if (!Array.isArray(modifiers) || !modifiers.every((mod) => ["Mod", "Ctrl", "Meta", "Alt", "Shift"].includes(mod))) continue;
      if (typeof key !== "string" || !/^(?:[^\s]{1}|F(?:[1-9]|1[0-9]|2[0-4])|Enter|Tab|Space|Backspace|Delete|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/u.test(key)) continue;
      shortcuts.push(publicText([...modifiers, key].join("+")));
    }
    if (shortcuts.length) rows.push(`| ${publicText(command)} | ${shortcuts.join(", ")} |`);
  }
  return rows.length ? [`| Command | Custom hotkey |`, "| --- | --- |", ...rows].join("\n") : "";
}
async function generateReport(app, settings, captured = {}, loadThemeDescription) {
  const outputPath = reportPath(settings.outputFolder, app.vault.configDir);
  const panels = [...app.setting?.settingTabs ?? [], ...app.setting?.pluginTabs ?? []].filter((panel) => panel.id !== "obsidian-setup-exporter");
  const generalPanels = panels.filter((panel) => !app.setting?.pluginTabs?.includes(panel) && !["plugins", "community-plugins", "hotkeys"].includes(panel.id) && !app.internalPlugins?.plugins?.[panel.id] && !app.plugins?.manifests?.[panel.id]);
  const sections = [`# Obsidian setup`];
  const addSection = (title, content) => {
    if (content.trim()) sections.push(`## ${title}`, content);
  };
  const entries = (panel) => (captured[panel.id] ?? panelSettings(panel)).map((entry) => ({ ...entry, path: [settingsPath(app.setting, panel.name), ...entry.path.slice(1)] }));
  const general = generalPanels.flatMap(entries);
  const appearance = generalPanels.find((panel) => panel.id === "appearance");
  const appearancePath = (appearance && entries(appearance)[0]?.path[0]) ?? settingsPath(app.setting, appearance?.name ?? "Appearance");
  const theme = app.customCss?.theme || (appearance ? app.vault.getConfig?.("cssTheme") : void 0);
  if (typeof theme === "string" && theme) {
    const slug = theme.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || theme;
    const url = `https://community.obsidian.md/themes/${encodeURIComponent(slug)}`;
    let description = app.customCss?.themes?.[theme]?.description;
    if (!description?.trim() && loadThemeDescription) {
      try {
        description = await loadThemeDescription(url);
      } catch {
      }
    }
    const markdown = linkedItem(theme, description, url, `obsidian://show-theme?name=${encodeURIComponent(theme)}`);
    const existing = general.find((entry) => entry.path[0] === appearancePath && entry.name === "Theme" && entry.value === publicText(theme));
    if (existing) existing.markdown = markdown;
    else general.push({ path: [appearancePath], name: "Theme", value: publicText(theme), markdown });
  }
  const snippets = Array.from(app.customCss?.enabledSnippets ?? []).sort();
  if (snippets.length) general.push({ path: [appearancePath], name: "CSS snippets", value: snippets.map(publicText).join(", ") });
  sections.push(settingsMarkdown(general, 2));
  const core = Object.entries(app.internalPlugins?.plugins ?? {}).filter(([id]) => coreEnabled(app, id)).sort(([a], [b]) => a.localeCompare(b));
  const coreSections = [];
  for (const [id, plugin] of core) {
    const panel = panels.find((panel2) => panel2.id === id);
    const name = panel?.name ?? plugin.name ?? plugin.instance?.name ?? id;
    coreSections.push(`- **${publicText(name)}**`);
  }
  const coreTitle = app.setting?.corePluginTabHeaderGroup?.textContent?.trim() ?? panels.find((panel) => panel.id === "plugins")?.name ?? "Core plugins";
  addSection(settingsPath(app.setting, coreTitle), coreSections.join("\n"));
  const manifests = Object.values(app.plugins?.manifests ?? {}).filter((manifest) => manifest.id !== "obsidian-setup-exporter" && (settings.includeDisabled || app.plugins?.enabledPlugins?.has(manifest.id))).sort((a, b) => a.id.localeCompare(b.id));
  const communitySections = [];
  for (const manifest of manifests) {
    communitySections.push(
      linkedItem(manifest.name, manifest.description, `https://community.obsidian.md/plugins/${encodeURIComponent(manifest.id)}`, `obsidian://show-plugin?id=${encodeURIComponent(manifest.id)}`)
    );
  }
  const communityTitle = app.setting?.communityPluginTabHeaderGroup?.textContent?.trim() ?? panels.find((panel) => panel.id === "community-plugins")?.name ?? "Community plugins";
  addSection(settingsPath(app.setting, communityTitle), communitySections.join("\n"));
  const folders = templateFolders(app);
  if (folders.length) {
    const files = selectTemplates(app.vault.getMarkdownFiles(), folders, outputPath, app.vault.configDir);
    const name = panels.find((panel) => panel.id === "templates")?.name ?? "Templates";
    addSection(settingsPath(app.setting, `${coreTitle} \u2192 ${name}`), [`Folders : ${folders.map(publicText).join(", ")}`, await templatesMarkdown(files, settings.includeTemplateContent, (file) => app.vault.read(file))].filter(Boolean).join("\n\n"));
  }
  if (settings.includeHotkeys) addSection(settingsPath(app.setting, panels.find((panel) => panel.id === "hotkeys")?.name ?? "Hotkeys"), hotkeysMarkdown(app.hotkeyManager?.customKeys));
  return `${sections.filter(Boolean).join("\n\n")}
`;
}
var REPORT_MARKER = "<!-- setup-exporter:report -->";
function replaceReport(previous, content, previousReport) {
  if (previous !== previousReport && !previous.startsWith(`${REPORT_MARKER}
`)) throw new Error("Setup-Export.md already exists and was not generated by Setup Exporter, or has been edited. Move it or choose another folder.");
  return content;
}
async function ensureFolder(vault, folder) {
  let parent = "";
  for (const part of folder.split("/").filter(Boolean)) {
    parent += `${parent ? "/" : ""}${part}`;
    const existing = vault.getAbstractFileByPath(parent);
    if (existing && !("children" in existing)) throw new Error("An existing file occupies the output folder path.");
    if (!existing) await vault.createFolder(parent);
  }
}
async function saveReport(vault, folder, report, previousReport) {
  const path = reportPath(folder, vault.configDir);
  await ensureFolder(vault, path.split("/").slice(0, -1).join("/"));
  const existing = vault.getAbstractFileByPath(path);
  if (!existing) return vault.create(path, report);
  if (!("extension" in existing)) throw new Error("An existing folder occupies the report path.");
  const file = existing;
  await vault.process(file, (previous) => replaceReport(previous, report, previousReport));
  return file;
}

// plugin/main.ts
var SetupExporter = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.generating = false;
    this.generatedReports = /* @__PURE__ */ Object.create(null);
  }
  async onload() {
    const data = record(await this.loadData());
    this.settings = parseSettings(data);
    for (const [path, report] of Object.entries(record(data.generatedReports))) {
      if (vaultPath(path) === path && typeof report === "string") this.generatedReports[path] = report;
    }
    this.addCommand({ id: "rapport", name: "Report", callback: () => {
      void this.exportReport();
    } });
    this.addSettingTab(new SetupExporterSettings(this));
  }
  async saveSettings() {
    await this.saveData({ ...this.settings, generatedReports: this.generatedReports });
  }
  async loadThemeDescription(url) {
    let timeout;
    try {
      const response = await Promise.race([
        (0, import_obsidian.requestUrl)({ url, throw: false }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Theme metadata unavailable.")), 8e3);
        })
      ]);
      return response.status === 200 ? communityThemeDescription(response.text) : void 0;
    } finally {
      clearTimeout(timeout);
    }
  }
  async exportReport() {
    if (this.generating) {
      new import_obsidian.Notice("A report is already being generated.");
      return;
    }
    this.generating = true;
    const settings = { ...this.settings };
    try {
      const source = runtimeApp(this.app);
      const captured = await collectSettings(source);
      const report = await generateReport(source, settings, captured, (url) => this.loadThemeDescription(url));
      const path = reportPath(settings.outputFolder, this.app.vault.configDir);
      const file = await saveReport(this.app.vault, settings.outputFolder, report, this.generatedReports[path]);
      this.generatedReports[file.path] = report;
      await this.saveSettings();
      await this.app.workspace.getLeaf(false).openFile(file);
      new import_obsidian.Notice("Setup Exporter report generated.");
    } catch (error) {
      const message = error instanceof Error && /^(?:Invalid output folder\.|An existing (?:file|folder) occupies|Setup-Export\.md already exists)/.test(error.message) ? error.message : "Cannot generate or open the report. Check the output folder and vault permissions.";
      new import_obsidian.Notice(message, 1e4);
    } finally {
      this.generating = false;
    }
  }
};
var SetupExporterSettings = class extends import_obsidian.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.exporter = plugin;
  }
  display() {
    this.containerEl.empty();
    new import_obsidian.Setting(this.containerEl).setName("Report").setDesc("Generate and open Setup-Export.md with customized Obsidian settings, plugin lists and custom hotkeys. Plugin options are excluded.").addButton((button) => button.setButtonText(`Setup Exporter: Report`).setCta().onClick(async () => {
      button.setDisabled(true);
      try {
        await this.exporter.exportReport();
      } finally {
        button.setDisabled(false);
      }
    }));
    new import_obsidian.Setting(this.containerEl).setName("Report folder").setDesc("Contains Setup-Export.md. Leave empty for the vault root.").addText((text) => text.setPlaceholder("Vault folder").setValue(this.exporter.settings.outputFolder).onChange(async (value) => {
      const folder = value.trim() === "" ? DEFAULT_SETTINGS.outputFolder : vaultPath(value);
      let valid = folder !== null;
      if (folder !== null) {
        try {
          reportPath(folder, this.app.vault.configDir);
        } catch {
          valid = false;
        }
      }
      text.inputEl.setCustomValidity(valid ? "" : "Invalid relative path or reserved configuration folder.");
      text.inputEl.reportValidity();
      if (!valid || folder === null) return;
      this.exporter.settings.outputFolder = folder;
      await this.exporter.saveSettings();
    }));
    const toggles = [
      ["includeDisabled", "Include disabled plugins", "Include their metadata without enabling them."],
      ["includeTemplateContent", "Include template content", "Allow reading and copying Markdown templates."],
      ["includeHotkeys", "Include custom hotkeys", "Export only user overrides, including removed hotkeys."]
    ];
    for (const [key, name, description] of toggles) {
      new import_obsidian.Setting(this.containerEl).setName(name).setDesc(description).addToggle((toggle) => toggle.setValue(this.exporter.settings[key]).onChange(async (value) => {
        this.exporter.settings[key] = value;
        await this.exporter.saveSettings();
      }));
    }
  }
};
