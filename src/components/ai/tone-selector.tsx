"use client";

import type { MessageTone } from "@/lib/ai/types";

const TONES: { value: MessageTone; label: string }[] = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
];

interface ToneSelectorProps {
  value: MessageTone;
  onChange: (tone: MessageTone) => void;
  disabled?: boolean;
}

export function ToneSelector({ value, onChange, disabled }: ToneSelectorProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">Tone</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as MessageTone)}
        className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground disabled:opacity-50"
      >
        {TONES.map((tone) => (
          <option key={tone.value} value={tone.value}>
            {tone.label}
          </option>
        ))}
      </select>
    </label>
  );
}
