import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Storage usage as an accurate percentage. Returns the exact value (for bars/
 * gauges) and an adaptive label so tiny usage doesn't round to "0%"
 * (e.g. 0.09%, 2.3%, 45%).
 */
export function storagePercent(used: number, quota: number): { value: number; label: string } {
  const q = quota || 1;
  const exact = Math.min(100, Math.max(0, (used / q) * 100));
  const label =
    exact === 0 ? '0' : exact >= 10 ? String(Math.round(exact)) : exact >= 1 ? exact.toFixed(1) : exact.toFixed(2);
  return { value: exact, label };
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const KIND_BY_EXT: Record<string, string> = {
  pdf: 'pdf',
  doc: 'docx',
  docx: 'docx',
  xls: 'xlsx',
  xlsx: 'xlsx',
  csv: 'xlsx',
  gdoc: 'gdoc',
  gsheet: 'gsheet',
  ppt: 'pptx',
  pptx: 'pptx',
};

export function kindFromFile(fileName: string, mime?: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (KIND_BY_EXT[ext]) return KIND_BY_EXT[ext];
  if (mime?.includes('pdf')) return 'pdf';
  if (mime?.includes('word')) return 'docx';
  if (mime?.includes('sheet') || mime?.includes('excel')) return 'xlsx';
  return 'other';
}

/** File kinds that OnlyOffice can edit in-browser. */
export const EDITABLE_KINDS = ['docx', 'xlsx', 'pptx'] as const;

export function isEditableKind(kind: string): boolean {
  return (EDITABLE_KINDS as readonly string[]).includes(kind);
}

export function slug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function randomId(): string {
  return crypto.randomUUID();
}

export type PreviewCategory = 'pdf' | 'image' | 'office' | 'text' | 'none';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
const TEXT_EXT = ['txt', 'csv', 'md', 'markdown', 'json', 'log'];

/** Decide how to preview a file from its name + kind. */
export function previewCategory(fileName: string, kind: string): PreviewCategory {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (kind === 'pdf' || ext === 'pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (TEXT_EXT.includes(ext)) return 'text';
  if (kind === 'docx' || kind === 'xlsx' || kind === 'pptx') return 'office';
  return 'none';
}
