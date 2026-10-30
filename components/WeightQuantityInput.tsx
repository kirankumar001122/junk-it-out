'use client';

import React, { useState, useEffect } from 'react';

export interface WeightQuantityInputProps {
  value: number;
  onChange: (weight: number) => void;
  categoryName?: string;
  min?: number;
  max?: number;
  className?: string;
  textClassName?: string;
  unit?: string;
}

/**
 * Validates and clamps a weight value according to JunkitOut business rules:
 * - Must be a finite positive number.
 * - Clamped between `min` (default 1 kg) and `max` (default 500 kg).
 * - Rounded to whole integer kilograms.
 * - Returns `min` (default 1) for empty, zero, negative, NaN, or invalid inputs.
 */
export function parseAndValidateWeight(
  rawValue: string | number,
  min = 1,
  max = 500
): number {
  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue) || isNaN(rawValue)) return min;
    return Math.max(min, Math.min(max, Math.round(rawValue)));
  }
  const trimmed = String(rawValue).trim();
  if (!trimmed) return min;
  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed) || isNaN(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export default function WeightQuantityInput({
  value,
  onChange,
  categoryName,
  min = 1,
  max = 500,
  className = '',
  textClassName = 'text-xs font-extrabold text-emerald-950',
  unit = 'kg',
}: WeightQuantityInputProps) {
  const [localText, setLocalText] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  // Keep local input synchronized with external changes (e.g. + or - button presses)
  useEffect(() => {
    if (!isFocused) {
      setLocalText(String(value));
    }
  }, [value, isFocused]);

  const commitValue = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setLocalText(String(value > 0 ? value : min));
      return;
    }
    const safe = parseAndValidateWeight(trimmed, min, max);
    setLocalText(String(safe));
    if (safe !== value) {
      onChange(safe);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow empty or positive numbers with optional decimal point while typing
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
    setLocalText(raw);

    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && !isNaN(parsed) && parsed > 0) {
      const safe = Math.max(min, Math.min(max, Math.round(parsed)));
      onChange(safe);
    }
  };

  return (
    <div className={`inline-flex items-center px-1 ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={localText}
        onChange={handleChange}
        onFocus={(e) => {
          setIsFocused(true);
          e.target.select();
        }}
        onBlur={(e) => {
          setIsFocused(false);
          commitValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        className={`w-7 sm:w-8 text-center bg-transparent focus:outline-none focus:bg-emerald-100/60 focus:ring-1 focus:ring-emerald-400 rounded py-0.5 px-0.5 transition-all cursor-text ${textClassName}`}
        aria-label={categoryName ? `${categoryName} weight in ${unit}` : `Waste weight in ${unit}`}
      />
      <span className={`${textClassName} select-none ml-0.5`}>{unit}</span>
    </div>
  );
}

