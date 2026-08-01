"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Clock3, Navigation2, Route, ShieldCheck } from "lucide-react";
import { buildRouteOptions, routePlaces } from "@/lib/routing";
import type { FloodReport, RouteOption } from "@/lib/types";

type SafeRoutePlannerProps = {
  reports: FloodReport[];
  activeRoute?: RouteOption;
  onRouteChange: (route?: RouteOption) => void;
};

export function SafeRoutePlanner({ reports, activeRoute, onRouteChange }: SafeRoutePlannerProps) {
  const [sourceId, setSourceId] = useState(routePlaces[0].id);
  const [destinationId, setDestinationId] = useState(routePlaces[1].id);

  const source = routePlaces.find((place) => place.id === sourceId) ?? routePlaces[0];
  const destination =
    routePlaces.find((place) => place.id === destinationId) ?? routePlaces[1];

  const routeOptions = useMemo(() => {
    if (source.id === destination.id) {
      return [];
    }

    return buildRouteOptions(source, destination, reports);
  }, [destination, reports, source]);

  function planSafestRoute() {
    onRouteChange(routeOptions[0]);
  }

  return (
    <section className="panel-stack" aria-label="Safe route planner">
      <div className="panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Re-navigation</p>
            <h2>Find safer route</h2>
          </div>
          <Navigation2 size={20} />
        </div>

        <div className="form-grid">
          <label className="span-2">
            Source
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              {routePlaces.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>

          <label className="span-2">
            Destination
            <select
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
            >
              {routePlaces.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="primary-action span-2"
            type="button"
            disabled={routeOptions.length === 0}
            onClick={planSafestRoute}
          >
            <Route size={17} />
            Calculate route
          </button>
        </div>
      </div>

      <div className="panel-section route-options">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Options</p>
            <h2>Flood exposure</h2>
          </div>
          {activeRoute ? (
            <button type="button" className="text-button" onClick={() => onRouteChange(undefined)}>
              Clear
            </button>
          ) : null}
        </div>

        {routeOptions.length === 0 ? (
          <p className="muted">Choose two different places to compare routes.</p>
        ) : (
          routeOptions.map((option, index) => (
            <button
              type="button"
              className={`route-card ${activeRoute?.id === option.id ? "is-active" : ""}`}
              key={option.id}
              onClick={() => onRouteChange(option)}
            >
              <span className="route-card-title">
                <strong>{option.name}</strong>
                {index === 0 ? (
                  <span className="safe-badge">
                    <ShieldCheck size={14} />
                    Safest
                  </span>
                ) : null}
              </span>
              <span className="muted">{option.summary}</span>
              <span className="route-stats">
                <span>
                  <Route size={14} />
                  {option.distanceKm} km
                </span>
                <span>
                  <Clock3 size={14} />
                  {option.estimatedMinutes} min
                </span>
                <span>
                  <AlertTriangle size={14} />
                  {option.floodExposure} exposure
                </span>
              </span>
              <span className="route-warning">{option.warnings[0]}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
