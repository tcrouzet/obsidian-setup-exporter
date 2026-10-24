export const MASKED = '[masqué]';

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function privateText(text: string): boolean {
  if (text === '/' || text === './') return false;
  return /(?:^|[\s"'(=])(?:\/|~[\\/]|[A-Za-z]:[\\/]|\\\\)/.test(text) ||
    /(?:file:\/\/|(?:api[_ -]?key|token|password|secret|authorization)\s*[:=]|\bBearer\s+\S+|\b(?:sk-|gh[pousr]_|github_pat_)[\w-]+|BEGIN[ A-Z]*PRIVATE KEY|\beyJ[\w-]+\.[\w-]+\.[\w-]+)/i.test(text) ||
    /[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i.test(text) ||
    /https?:\/\/[^\s/]+:[^\s/]+@/i.test(text) ||
    (/^[a-z0-9_+/=-]{40,}$/i.test(text) && /[0-9]/.test(text));
}

export function vaultPath(value: unknown, allowRoot = false): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim().replace(/\/$/, '');
  if (!path) return allowRoot && value.trim() === '' ? '' : null;
  if (/[\\:\x00-\x1f\x7f#\[\]|?*<>"~]/.test(path) || path.startsWith('/')) return null;
  if (path.split('/').some(part => !part || part.startsWith('.') || part.trim() !== part)) return null;
  return path;
}

export function publicText(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return 'Indisponible';
  const text = String(value);
  if (privateText(text)) return MASKED;
  return text.replace(/[\\<>`\[\]*_{}|~$]/g, '\\$&').replace(/[\r\n\t]/g, ' ');
}

export function codeBlock(text: string, language: string): string {
  let length = 3;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  const fence = '`'.repeat(length);
  return `${fence}${language}\n${text}\n${fence}`;
}
