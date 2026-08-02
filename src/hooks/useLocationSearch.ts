"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { geocodeDestination, type SearchResultPlace } from "@/lib/routing";

interface UseLocationSearchOptions {
  /** Milliseconds to wait after the last keystroke before firing. Default 300. */
  debounceMs?: number;
  /** Minimum query length to trigger a search. Default 2. */
  minLength?: number;
}

interface UseLocationSearchResult {
  query: string;
  setQuery: (value: string) => void;
  suggestions: SearchResultPlace[];
  isLoading: boolean;
  error: string;
  highlightedIndex: number;
  setHighlightedIndex: (i: number) => void;
  clearSuggestions: () => void;
  /** Call this in the input's onKeyDown to handle ↑ ↓ Enter Escape */
  handleKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    onSelect: (place: SearchResultPlace) => void
  ) => void;
}

export function useLocationSearch(
  opts: UseLocationSearchOptions = {}
): UseLocationSearchResult {
  const { debounceMs = 300, minLength = 2 } = opts;

  const [query, setQueryState] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResultPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // AbortController ref to cancel in-flight fetches when query changes
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (q: string) => {
      // Cancel any ongoing request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsLoading(true);
      setError("");

      try {
        const results = await geocodeDestination(q);
        setSuggestions(results);
        setHighlightedIndex(-1);
        if (results.length === 0) {
          setError("No places found. Try a different name.");
        }
      } catch {
        setError("Search failed. Check your connection.");
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
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
      onSelect: (place: SearchResultPlace) => void
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
