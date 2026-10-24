import { Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import { record, vaultPath } from './privacy.ts';
import { communityThemeDescription, DEFAULT_SETTINGS, generateReport, parseSettings, reportPath, runtimeApp, saveReport } from './report.ts';
import type { ExportSettings } from './report.ts';
import { collectSettings } from './settings.ts';

export default class SetupExporter extends Plugin {
  settings: ExportSettings = { ...DEFAULT_SETTINGS };
  private generating = false;
  private generatedReports: Record<string, string> = Object.create(null);

  async onload(): Promise<void> {
    const data = record(await this.loadData());
    this.settings = parseSettings(data);
    for (const [path, report] of Object.entries(record(data.generatedReports))) {
      if (vaultPath(path) === path && typeof report === 'string') this.generatedReports[path] = report;
    }
    this.addCommand({ id: 'rapport', name: 'Report', callback: () => { void this.exportReport(); } });
    this.addSettingTab(new SetupExporterSettings(this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, generatedReports: this.generatedReports });
  }

  private async loadThemeDescription(url: string): Promise<string | undefined> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        requestUrl({ url, throw: false }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Theme metadata unavailable.')), 8000); }),
      ]);
      return response.status === 200 ? communityThemeDescription(response.text) : undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  async exportReport(): Promise<void> {
    if (this.generating) {
      new Notice('A report is already being generated.');
      return;
    }
    this.generating = true;
    const settings = { ...this.settings };
    try {
      const source = runtimeApp(this.app);
      const captured = await collectSettings(source);
      const report = await generateReport(source, settings, captured, url => this.loadThemeDescription(url));
      const path = reportPath(settings.outputFolder, this.app.vault.configDir);
      const file = await saveReport(this.app.vault, settings.outputFolder, report, this.generatedReports[path]);
      this.generatedReports[file.path] = report;
      await this.saveSettings();
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice('Setup Exporter report generated.');
    } catch (error) {
      const message = error instanceof Error && /^(?:Invalid output folder\.|An existing (?:file|folder) occupies|Setup-Export\.md already exists)/.test(error.message)
        ? error.message : 'Cannot generate or open the report. Check the output folder and vault permissions.';
      new Notice(message, 10_000);
    } finally {
      this.generating = false;
    }
  }
}

class SetupExporterSettings extends PluginSettingTab {
  private exporter: SetupExporter;

  constructor(plugin: SetupExporter) {
    super(plugin.app, plugin);
    this.exporter = plugin;
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Report')
      .setDesc('Generate and open Setup-Export.md with customized Obsidian settings, plugin lists and custom hotkeys. Plugin options are excluded.')
      .addButton(button => button.setButtonText(`Setup Exporter: Report`).setCta().onClick(async () => {
        button.setDisabled(true);
        try { await this.exporter.exportReport(); }
        finally { button.setDisabled(false); }
      }));
    new Setting(this.containerEl)
      .setName('Report folder')
      .setDesc('Contains Setup-Export.md. Leave empty for the vault root.')
      .addText(text => text.setPlaceholder('Vault folder').setValue(this.exporter.settings.outputFolder).onChange(async value => {
        const folder = value.trim() === '' ? DEFAULT_SETTINGS.outputFolder : vaultPath(value);
        let valid = folder !== null;
        if (folder !== null) {
          try { reportPath(folder, this.app.vault.configDir); }
          catch { valid = false; }
        }
        text.inputEl.setCustomValidity(valid ? '' : 'Invalid relative path or reserved configuration folder.');
        text.inputEl.reportValidity();
        if (!valid || folder === null) return;
        this.exporter.settings.outputFolder = folder;
        await this.exporter.saveSettings();
      }));
    const toggles = [
      ['includeDisabled', 'Include disabled plugins', 'Include their metadata without enabling them.'],
      ['includeTemplateContent', 'Include template content', 'Allow reading and copying Markdown templates.'],
      ['includeHotkeys', 'Include custom hotkeys', 'Export only user overrides, including removed hotkeys.'],
    ] as const;
    for (const [key, name, description] of toggles) {
      new Setting(this.containerEl).setName(name).setDesc(description)
        .addToggle(toggle => toggle.setValue(this.exporter.settings[key]).onChange(async value => {
          this.exporter.settings[key] = value;
          await this.exporter.saveSettings();
        }));
    }
  }
}
