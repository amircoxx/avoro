import type { JSX } from "react";

export function AccountTextField({
  label,
  value,
  placeholder,
  type = "text",
  autoComplete,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
      />
    </label>
  );
}
