"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MapPin, SearchX } from "lucide-react";
import { formatRelativeTime, incidentTypeMeta, severityMeta } from "@/lib/floodReports";
import type { Incident } from "@/lib/types";

type SearchResultsPanelProps = {
  /** Query the results were generated from. */
  query: string;
  /** Matches already loaded by the header autocomplete (shown instantly). */
  initialResults?: Incident[];
  onBack: () => void;
  onSelectIncident: (id: string) => void;
};

export function SearchResultsPanel({
  query,
  initialResults,
  onBack,
  onSelectIncident
}: SearchResultsPanelProps) {
  const [results, setResults] = useState<Incident[] | null>(initialResults ?? null);
  const [isLoading, setIsLoading] = useState(!initialResults);
  const [error, setError] = useState("");

  // Fetch the full result set for the query (the header autocomplete is capped).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setError("");
    fetch(`/api/incidents?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return;
        setResults(data.incidents ?? []);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        setError("Could not load all results.");
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query]);

  const count = results?.length ?? 0;

  const sortedResults = useMemo(() => {
    if (!results) return [];
    return [...results].sort((a, b) => {
      const rank = { NOT_PASSABLE: 4, WAIST_DEEP: 3, KNEE_DEEP: 2, WATERLOGGED: 1, SAFE: 0 };
      const aR = rank[a.severity] ?? 0;
      const bR = rank[b.severity] ?? 0;
      if (aR !== bR) return bR - aR;
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });
  }, [results]);

  return (
    <section className="search-results-panel" aria-label="Search Results">
      <div className="search-results-header">
        <button type="button" className="icon-button search-results-back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={15} />
        </button>
        <div className="search-results-title">
          <p className="eyebrow">Search Results</p>
          <h2>{query}</h2>
        </div>
        <span className="search-results-count">{count} found</span>
      </div>

      <div className="search-results-body">
        {isLoading && !results ? (
          <div className="search-results-status">
            <Loader2 size={16} className="report-spin" />
            Searching reported incidents…
          </div>
        ) : count === 0 ? (
          <div className="search-results-empty">
            <SearchX size={26} />
            <p>No incidents found for “{query}”.</p>
            <small>Try a road, district, landmark or incident type.</small>
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="search-results-refreshing">
                <Loader2 size={12} className="report-spin" />
                Loading all results…
              </div>
            )}
            {error && <div className="search-results-error">{error}</div>}
            <ul className="search-results-list">
              {sortedResults.map((inc) => {
                const TypeIcon = incidentTypeMeta[inc.type]?.icon ?? MapPin;
                const sev = severityMeta[inc.severity] ?? severityMeta.WATERLOGGED;
                const latestNote = (inc.reports ?? []).find((r) => r.notes)?.notes;
                return (
                  <li key={inc.id}>
                    <button
                      type="button"
                      className="search-result-card"
                      onClick={() => onSelectIncident(inc.id)}
                    >
                      <span
                        className="search-result-icon"
                        style={{ background: sev.background, color: sev.color, borderColor: sev.border }}
                      >
                        <TypeIcon size={17} />
                      </span>
                      <div className="search-result-main">
                        <div className="search-result-head">
                          <strong className="search-result-name">{inc.roadName}</strong>
                          <span
                            className="search-result-badge"
                            style={{ background: sev.background, color: sev.color, borderColor: sev.border }}
                          >
                            {sev.shortLabel}
                          </span>
                        </div>
                        <p className="search-result-loc">
                          Near {inc.landmark}, {inc.district}
                        </p>
                        {latestNote && <p className="search-result-note">{latestNote}</p>}
                        <div className="search-result-meta">
                          <span>{incidentTypeMeta[inc.type]?.label ?? inc.type}</span>
                          <span className="search-result-status" data-status={inc.status}>
                            {inc.status}
                          </span>
                          <span>{inc.confidence}% confidence</span>
                          <span>{(inc.reports ?? []).length} report{(inc.reports ?? []).length === 1 ? "" : "s"}</span>
                          <span>{formatRelativeTime(inc.updatedAt || inc.createdAt)}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
