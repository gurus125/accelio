"use client";

import type { MessageLanguage } from "@/lib/ai/types";

const LANGUAGES: { value: MessageLanguage; label: string }[] = [
  { value: "english", label: "English" },
  { value: "hinglish", label: "Hinglish" },
  { value: "hindi", label: "हिन्दी (Hindi)" },
];

interface LanguageSelectorProps {
  value: MessageLanguage;
  onChange: (language: MessageLanguage) => void;
  disabled?: boolean;
}

export function LanguageSelector({ value, onChange, disabled }: LanguageSelectorProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">Language</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as MessageLanguage)}
        className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground disabled:opacity-50"
      >
        {LANGUAGES.map((language) => (
          <option key={language.value} value={language.value}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
