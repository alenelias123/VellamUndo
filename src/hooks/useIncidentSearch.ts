"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Incident } from "@/lib/types";

interface UseIncidentSearchOptions {
  /** Milliseconds to wait after the last keystroke before firing. Default 300. */
  debounceMs?: number;
  /** Minimum query length to trigger a search. Default 2. */
  minLength?: number;
  /** Max number of suggestions to surface. Default 8. */
  maxResults?: number;
}

interface UseIncidentSearchResult {
  query: string;
  setQuery: (value: string) => void;
  suggestions: Incident[];
  isLoading: boolean;
  error: string;
  highlightedIndex: number;
  setHighlightedIndex: (i: number) => void;
  clearSuggestions: () => void;
  /** Call this in the input's onKeyDown to handle ↑ ↓ Enter Escape */
  handleKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    onSelect: (incident: Incident) => void
  ) => void;
}

function matchIncidentLocally(incident: Incident, needle: string): boolean {
  const haystack = [
    incident.roadName,
    incident.landmark,
    incident.district,
    incident.type,
    incident.severity,
    incident.status,
    ...(incident.reports ?? []).map((r) => r.notes),
    ...(incident.reports ?? []).map((r) => r.reporter)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function useIncidentSearch(
  localIncidents: Incident[],
  opts: UseIncidentSearchOptions = {}
): UseIncidentSearchResult {
  const { debounceMs = 300, minLength = 2, maxResults = 8 } = opts;

  const [query, setQueryState] = useState("");
  const [suggestions, setSuggestions] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // AbortController ref to cancel in-flight fetches when query changes
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const runSearch = useCallback(
    async (value: string) => {
      // Cancel any ongoing request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;

      setIsLoading(true);
      setError("");

      let results: Incident[] = [];
      try {
        const res = await fetch(
          `/api/incidents?q=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          results = data.incidents ?? [];
        }
      } catch (err) {
        // Aborts are expected when a newer keystroke supersedes this request.
        if ((err as Error)?.name === "AbortError") return;
        // Offline / API failure → fall back to filtering the local incident set.
        const needle = value.toLowerCase();
        results = localIncidents.filter((inc) => matchIncidentLocally(inc, needle));
      }

      // Ignore stale responses if a newer search already started.
      if (requestIdRef.current !== requestId) return;

      setSuggestions(results.slice(0, maxResults));
      setHighlightedIndex(-1);
      setError(results.length === 0 ? "No incidents found. Try a different search." : "");
      setIsLoading(false);
    },
    [localIncidents, maxResults]
  );

  const setQuery = useCallback(
    (value: string) => {
      setQueryState(value);

      if (!value || value.trim().length < minLength) {
        // Clear immediately when query is too short
        if (debounceRef.current) clearTimeout(debounceRef.current);
        abortRef.current?.abort();
        setSuggestions([]);
        setError("");
        setIsLoading(false);
        setHighlightedIndex(-1);
        return;
      }

      // Debounce the search
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void runSearch(value.trim());
      }, debounceMs);
    },
    [debounceMs, minLength, runSearch]
  );

  const clearSuggestions = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setSuggestions([]);
    setError("");
    setIsLoading(false);
    setHighlightedIndex(-1);
  }, []);

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      onSelect: (incident: Incident) => void
    ) => {
      if (suggestions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          e.preventDefault();
          onSelect(suggestions[highlightedIndex]);
        }
      } else if (e.key === "Escape") {
        clearSuggestions();
      }
    },
    [suggestions, highlightedIndex, clearSuggestions]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return {
    query,
    setQuery,
    suggestions,
    isLoading,
    error,
    highlightedIndex,
    setHighlightedIndex,
    clearSuggestions,
    handleKeyDown,
  };
}
