/** Shared output-safety helpers (browser and server safe). */

/** One quoted CSV cell; neutralises spreadsheet formulas (=, +, -, @, tab, CR). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Escape text for insertion into HTML markup. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip characters that change meaning inside a PostgREST or()/ilike filter. */
export function safeSearchTerm(value: unknown, max = 100): string {
  return String(value ?? "").replace(/[,()*%\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Mask an email for logs: jo***@example.com */
export function maskEmail(value: unknown): string {
  const s = String(value ?? "");
  const at = s.indexOf("@");
  if (at < 1) return "***";
  return `${s.slice(0, Math.min(2, at))}***${s.slice(at)}`;
}
