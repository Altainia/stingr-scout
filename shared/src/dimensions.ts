import type { DimPart, Dimensions } from './types';

export const DIM_PARTS: DimPart[] = ['length', 'width', 'height'];
export const DIM_PART_LABELS: Record<DimPart, string> = { length: 'Length', width: 'Width', height: 'Height' };

/** A dimensions answer: an object of measurements in inches (any of them may be missing). */
export function isDimensions(v: unknown): v is Dimensions {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    && Object.entries(v).every(([k, n]) => DIM_PARTS.includes(k as DimPart) && typeof n === 'number' && Number.isFinite(n));
}

/** Inches split into whole feet and the inches left over (to two decimal places, so 35.999 is 3 ft 0 in). */
export function toFeetInches(total: number): { feet: number; inches: number } {
  const rounded = Math.round(total * 100) / 100;
  const feet = Math.floor(rounded / 12);
  return { feet, inches: Math.round((rounded - feet * 12) * 100) / 100 };
}

/** What a scout typed in the feet and inches boxes, as inches; null when both are empty. */
export function fromFeetInches(feet: number | null, inches: number | null): number | null {
  if (feet === null && inches === null) return null;
  return Math.round(((feet ?? 0) * 12 + (inches ?? 0)) * 100) / 100;
}

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** Inches as feet and inches: 30.5 → 2′ 6½″. Quarters show as fractions, anything else to one decimal place. */
export function feetInches(total: number): string {
  const quarter = Math.round(total * 4) / 4;
  const exact = Math.abs(quarter - total) < 0.005;
  const { feet, inches } = toFeetInches(exact ? quarter : Math.round(total * 10) / 10);
  if (!exact) return `${feet}′ ${inches}″`;
  const whole = Math.floor(inches);
  return `${feet}′ ${whole}${FRACTIONS[inches - whole] ?? ''}″`;
}
