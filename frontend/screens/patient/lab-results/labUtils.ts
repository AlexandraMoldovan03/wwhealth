/**
 * Pure helpers for lab values. They only COMPARE a number with the reference range printed in the
 * document — never interpret it. When anything is ambiguous the answer is `null` (no flag).
 */
import type { LabExtractionResponse, LabValueEntry, PatientLabValue } from '@/types';

export type LabFlag = 'low' | 'high' | 'normal';

const NUM = String.raw`[-+]?\d+(?:[.,]\d+)?`;

/** "13,5" → 13.5 · "1.234" stays 1.234 · "<5" / "pozitiv" / "13,5a" → null (not a plain number). */
export function parseLabNumber(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim();
  if (!new RegExp(`^${NUM}$`).test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "12,0 - 16,0" → {low:12, high:16} · "< 5" → {high:5} · "> 40" → {low:40} · anything else → null. */
export function parseReferenceRange(raw: string | null | undefined): { low?: number; high?: number } | null {
  const s = (raw ?? '').trim().replace(/^[[(]|[\])]$/g, '').trim();
  const between = new RegExp(`^(${NUM})\\s*[-–]\\s*(${NUM})$`).exec(s);
  if (between) {
    const low = parseLabNumber(between[1]);
    const high = parseLabNumber(between[2]);
    return low !== null && high !== null && low <= high ? { low, high } : null;
  }
  const bound = new RegExp(`^([<>≤≥])\\s*=?\\s*(${NUM})$`).exec(s);
  if (bound) {
    const n = parseLabNumber(bound[2]);
    if (n === null) return null;
    return bound[1] === '<' || bound[1] === '≤' ? { high: n } : { low: n };
  }
  return null;
}

/** Outside the printed range? Only when both the value and the range are plain numbers. */
export function labFlag(value: string, range: string | null | undefined): LabFlag | null {
  const n = parseLabNumber(value);
  const r = parseReferenceRange(range);
  if (n === null || !r) return null;
  if (r.low !== undefined && n < r.low) return 'low';
  if (r.high !== undefined && n > r.high) return 'high';
  return 'normal';
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Same analysis across documents: case / diacritics / spacing insensitive. */
export const labKey = (name: string) => strip(name).toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

/** Units are compared after trivial normalisation (µ/μ/u, case, spaces) — never converted. */
export const unitKey = (unit: string | null | undefined) =>
  (unit ?? '').trim().toLowerCase().replace(/[µμ]/g, 'u').replace(/\s+/g, '');

/** Date used to place a value in time: analysis date if known, else the document's upload date. */
export const labDate = (v: PatientLabValue) => v.measuredAt ?? v.documentDate ?? '';

export interface LabSeries {
  id: string; // `${labKey}|${unitKey}` — one series never mixes units
  name: string;
  unit: string | null;
  points: (PatientLabValue & { numeric: number | null; date: string })[];
}

/** Groups values into series of the same analysis AND the same unit, oldest → newest. */
export function buildLabSeries(values: PatientLabValue[]): LabSeries[] {
  const map = new Map<string, LabSeries>();
  for (const v of values) {
    const id = `${labKey(v.name)}|${unitKey(v.unit)}`;
    const series = map.get(id) ?? { id, name: v.name.trim(), unit: v.unit, points: [] };
    series.points.push({ ...v, numeric: parseLabNumber(v.value), date: labDate(v) });
    map.set(id, series);
  }
  for (const s of map.values()) s.points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** yyyy-mm-dd, a real calendar date, not in the future. */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= '1990-01-01' && d.getTime() <= Date.now();
}

/** Values ready to save: complete rows only, with the confirmed analysis date. */
export function prepareLabValues(values: LabValueEntry[], measuredAt: string | null): LabValueEntry[] {
  return values
    .filter((v) => v.name.trim() && v.value.trim())
    .map(({ needsReview: _review, ...v }) => ({
      ...v,
      name: v.name.trim(),
      value: v.value.trim(),
      unit: v.unit?.trim() || null,
      referenceRange: v.referenceRange?.trim() || null,
      measuredAt,
    }));
}

/** Why nothing (or OCR) was used — shown under the scanner; never blocks saving the document itself. */
export function scanMessage(res: LabExtractionResponse, t: (key: string) => string): string | null {
  if (!res.textFound) return res.ocrAvailable ? t('scanner.ocrNothing') : t('scanner.noOcr');
  if (res.values.length === 0) return t('scanner.noValues');
  return res.method === 'ocr' ? t('scanner.ocrUsed') : null;
}
