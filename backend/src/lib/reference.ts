/** Fill a reference format like "VCHR-{YYYY}-{seq}" → "VCHR-2026-0042". */
export function formatReference(format: string, year: number, seq: number): string {
  const seqStr = String(seq).padStart(4, '0');
  return format.replace(/\{YYYY\}/g, String(year)).replace(/\{seq\}/g, seqStr);
}
