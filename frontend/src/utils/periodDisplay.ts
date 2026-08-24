/** Display helpers for weekly period rows (1–5 morning, 6–8 afternoon). */

export function periodHeader(p: number): string {
  return `tiết ${p}`;
}

export function isAfternoonPeriod(p: number): boolean {
  return p >= 6;
}

/** Soft row tint: morning white, afternoon light sky. */
export function periodSessionRowClass(p: number): string {
  return isAfternoonPeriod(p) ? 'bg-sky-50/80' : 'bg-white';
}

/** Sticky period label column. */
export function periodSessionLabelClass(p: number): string {
  return isAfternoonPeriod(p)
    ? 'bg-sky-100 text-sky-900'
    : 'bg-primary-50 text-primary-800';
}

/** Top border: thicker rule starting at tiết 6 (no label text). */
export function periodSessionBorderClass(p: number): string {
  return p === 6 ? 'border-t-2 border-slate-300' : 'border-t border-gray-100';
}

/** Mobile list: tint when no status background overrides. */
export function periodSessionListClass(p: number): string {
  return isAfternoonPeriod(p) ? 'bg-sky-50/50' : '';
}
