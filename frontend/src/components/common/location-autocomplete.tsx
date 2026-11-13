/** Reusable debounced city picker that delegates lookups to the browser API boundary. */
"use client";

import { useEffect, useState } from "react";
import { getLocationSuggestions, type LocationSuggestion } from "@/services/api";

export default function LocationAutocomplete({
  label,
  placeholder,
  selectedLabel,
  ariaLabel,
  className,
  inputClassName,
  onSelect,
  onClear
}: {
  label?: string;
  placeholder: string;
  selectedLabel: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  onSelect: (suggestion: LocationSuggestion) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState(selectedLabel);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || trimmed === selectedLabel) {
      setSuggestions([]);
      setStatus(trimmed.length < 2 ? "" : "City selected.");
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setStatus("Finding cities...");

      try {
        const nextSuggestions = await getLocationSuggestions(trimmed, controller.signal);
        setSuggestions(nextSuggestions);
        setStatus(nextSuggestions.length ? "Select a city from the list." : "No city matches found.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
        setStatus(error instanceof Error ? error.message : "Location lookup failed");
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query, selectedLabel]);

  const input = (
    <input
      className={inputClassName}
      value={query}
      autoComplete="off"
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => {
        setQuery(event.target.value);
        onClear();
      }}
    />
  );

  return (
    <div className={`relative ${className ?? ""}`}>
      {label ? (
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {label}
          {input}
        </label>
      ) : (
        input
      )}

      {suggestions.length > 0 ? (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-56 overflow-auto rounded-xl border border-border bg-white p-1 shadow-xl shadow-rose-900/10"
          role="listbox"
          aria-label={label ? `${label} suggestions` : "Location suggestions"}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-rose-50"
              onClick={() => {
                setQuery(suggestion.label);
                setSuggestions([]);
                setStatus("City selected.");
                onSelect(suggestion);
              }}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}

      {status ? <p className="mt-1 text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
