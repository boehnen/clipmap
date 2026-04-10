'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

export type Unit = 'in' | 'cm' | 'mm';

export interface OutputSize {
  width: number;
  height: number;
  unit: Unit;
}

interface SizeInputProps {
  selectionWidthKm: number;
  selectionHeightKm: number;
  value: OutputSize;
  onChange: (size: OutputSize) => void;
}

const UNITS: { value: Unit; label: string; perKm: number }[] = [
  { value: 'in', label: 'in', perKm: 39370.1 },
  { value: 'cm', label: 'cm', perKm: 100000 },
  { value: 'mm', label: 'mm', perKm: 1000000 },
];

export function SizeInput({ selectionWidthKm, selectionHeightKm, value, onChange }: SizeInputProps) {
  const [lockAspect, setLockAspect] = useState(true);
  const aspectRatio = selectionWidthKm / selectionHeightKm;

  // Calculate scale (real-world km per output unit)
  const unitInfo = UNITS.find(u => u.value === value.unit)!;
  const scaleRatio = selectionWidthKm / (value.width / unitInfo.perKm);

  // Format scale as 1:X
  const scaleStr = scaleRatio > 1000
    ? `1:${Math.round(scaleRatio).toLocaleString()}`
    : `1:${scaleRatio.toFixed(0)}`;

  const handleWidthChange = (newWidth: number) => {
    if (lockAspect) {
      onChange({ ...value, width: newWidth, height: Math.round(newWidth / aspectRatio * 10) / 10 });
    } else {
      onChange({ ...value, width: newWidth });
    }
  };

  const handleHeightChange = (newHeight: number) => {
    if (lockAspect) {
      onChange({ ...value, height: newHeight, width: Math.round(newHeight * aspectRatio * 10) / 10 });
    } else {
      onChange({ ...value, height: newHeight });
    }
  };

  const handleUnitChange = (newUnit: Unit) => {
    const oldUnit = UNITS.find(u => u.value === value.unit)!;
    const newUnitInfo = UNITS.find(u => u.value === newUnit)!;
    const conversionFactor = newUnitInfo.perKm / oldUnit.perKm;

    onChange({
      unit: newUnit,
      width: Math.round(value.width * conversionFactor * 10) / 10,
      height: Math.round(value.height * conversionFactor * 10) / 10,
    });
  };

  // Quick size presets
  const presets = value.unit === 'in'
    ? [
        { label: '8×10"', w: 8, h: 10 },
        { label: '12×12"', w: 12, h: 12 },
        { label: '18×24"', w: 18, h: 24 },
      ]
    : value.unit === 'cm'
      ? [
          { label: '20×25', w: 20, h: 25 },
          { label: '30×30', w: 30, h: 30 },
          { label: '40×60', w: 40, h: 60 },
        ]
      : [
          { label: '200×250', w: 200, h: 250 },
          { label: '300×300', w: 300, h: 300 },
          { label: '400×600', w: 400, h: 600 },
        ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">Output Size</h3>
        <span className="text-xs text-neutral-500">Scale {scaleStr}</span>
      </div>

      <div className="flex gap-2 items-end">
        {/* Width */}
        <div className="flex-1">
          <label className="text-xs text-neutral-500 mb-1 block">Width</label>
          <input
            type="number"
            value={value.width}
            onChange={(e) => handleWidthChange(parseFloat(e.target.value) || 0)}
            min={0.1}
            step={0.1}
            className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Lock aspect */}
        <button
          onClick={() => setLockAspect(!lockAspect)}
          className={cn(
            'p-1.5 rounded border transition-colors mb-0.5',
            lockAspect
              ? 'bg-brand-50 border-brand-300 text-brand-600'
              : 'bg-white border-neutral-200 text-neutral-400'
          )}
          title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {lockAspect ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            )}
          </svg>
        </button>

        {/* Height */}
        <div className="flex-1">
          <label className="text-xs text-neutral-500 mb-1 block">Height</label>
          <input
            type="number"
            value={value.height}
            onChange={(e) => handleHeightChange(parseFloat(e.target.value) || 0)}
            min={0.1}
            step={0.1}
            className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Unit */}
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Unit</label>
          <select
            value={value.unit}
            onChange={(e) => handleUnitChange(e.target.value as Unit)}
            className="px-2 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            {UNITS.map(u => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex gap-1.5">
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => {
              const newWidth = p.w;
              const newHeight = Math.round(p.w / aspectRatio * 10) / 10;
              onChange({ ...value, width: newWidth, height: newHeight });
            }}
            className="px-2 py-1 text-xs bg-neutral-100 hover:bg-neutral-200 rounded transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
