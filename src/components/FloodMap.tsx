"use client";

import React, { useEffect, useState } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents
} from "react-leaflet";
import { Ban, MapPin, PenLine, X, type LucideIcon } from "lucide-react";
import { iconSvg } from "@/lib/icons";
import { helpTypeMeta, priorityMeta } from "@/lib/helpRequests";
import { reliefCenterTypeMeta } from "@/lib/reliefCenters";
import { incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
import { findBlockagePoint } from "@/lib/routing";
import type {
  Coordinates,
  Incident,
  HelpRequest,
  ReliefCenter,
  RouteOption
} from "@/lib/types";

type FloodMapProps = {
  center: Coordinates;
  userLocation?: Coordinates;
  incidents: Incident[];
  helpRequests?: HelpRequest[];
  reliefCenters?: ReliefCenter[];
  selectedIncidentId?: string;
  activeRoute?: RouteOption;
  routes?: RouteOption[];
  routeOrigin?: Coordinates;
  routeDestination?: Coordinates;
  routeMapPickMode?: "origin" | "destination" | null;
  reportPinMode?: boolean;
  isDrawingStretch?: boolean;
  stretchStart?: Coordinates;
  stretchEnd?: Coordinates;
  stretchPath?: Coordinates[];
  onStretchChange?: (start: Coordinates, end: Coordinates) => void;
  onStretchPoint?: (point: Coordinates) => void;
  onToggleStretchDrawing?: (active: boolean) => void;
  onSelectRoute?: (route: RouteOption) => void;
  onRoutePinMoved?: (mode: "origin" | "destination", coordinates: Coordinates) => void;
  pendingLocation?: Coordinates;
  gpsLoading?: boolean;
  onRecenter?: () => void;
  onSelectIncident: (id: string) => void;
  onPickLocation: (coordinates: Coordinates) => void;
};

export function FloodMap({
  center,
  userLocation,
  incidents,
  helpRequests,
  reliefCenters,
  selectedIncidentId,
  activeRoute,
  routes = [],
  routeOrigin,
  routeDestination,
  routeMapPickMode = null,
  reportPinMode = false,
  isDrawingStretch = false,
  stretchStart,
  stretchEnd,
  stretchPath,
  onStretchChange,
  onStretchPoint,
  onToggleStretchDrawing,
  onSelectRoute,
  onRoutePinMoved,
  pendingLocation,
  gpsLoading = false,
  onRecenter,
  onSelectIncident,
  onPickLocation
}: FloodMapProps) {
  const [mounted, setMounted] = useState(false);
  const [mapKey] = useState(() => `vu-map-${Math.random()}`);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="map-loading bg-gray-50 flex items-center justify-center h-full text-xs font-semibold text-gray-500">
        Loading Map Viewport...
      </div>
    );
  }

  return (
    <MapContainer
      key={mapKey}
      center={[center.lat, center.lng]}
      zoom={11}
      scrollWheelZoom
      className={[
        "flood-map",
        routeMapPickMode ? `flood-map--pick-${routeMapPickMode}` : ""
      ].join(" ")}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapResizeHandler />
      <MapClickHandler
        isDrawingStretch={isDrawingStretch}
        onPickLocation={onPickLocation}
        onStretchPoint={onStretchPoint}
      />
      <MapViewController center={center} hasActiveRoute={Boolean(activeRoute)} />
      <RouteViewController activeRoute={activeRoute} />
      {routeMapPickMode ? (
        <MapPickModeBadge mode={routeMapPickMode} />
      ) : null}
      {isDrawingStretch ? (
        <StretchDrawBadge hasStart={Boolean(stretchStart)} hasEnd={Boolean(stretchEnd)} />
      ) : null}
      {reportPinMode && onToggleStretchDrawing ? (
        <ReportStretchToggle
          isDrawingStretch={isDrawingStretch}
          onToggle={onToggleStretchDrawing}
        />
      ) : null}

      {/* Recenter / GPS refresh button */}
      {onRecenter ? (
        <RecenterControl
          onRecenter={onRecenter}
          gpsLoading={gpsLoading}
          userLocation={userLocation}
        />
      ) : null}

      {/* User GPS dot */}
      {userLocation ? (
        <CircleMarker
          center={toLatLng(userLocation)}
          radius={9}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#2563eb",
            fillOpacity: 0.95,
            opacity: 1,
            weight: 3
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
            You are here
          </Tooltip>
        </CircleMarker>
      ) : null}

      {/* Render all calculated driving routes */}
      {routes.map((routeOption) => {
        const isSelected = activeRoute?.id === routeOption.id;
        const isFaded = !!activeRoute && !isSelected;
        const isPrimaryRoute = routeOption.id === "osrm-0";
        const risk = routeOption.analysis?.floodRisk ?? "LOW";
        const health = routeOption.analysis?.routeHealth ?? 100;
        const isBlocked = health === 0 || risk === "EXTREME";

        // Risk-based color for all routes
        let color: string;
        if (isBlocked)              color = "#b91c1c";
        else if (risk === "HIGH")   color = "#ea580c";
        else if (risk === "MEDIUM") color = "#0284c7";
        else                        color = "#157f3b";

        const opacity = isSelected
          ? 0.95
          : isFaded
          ? isPrimaryRoute && isBlocked
            ? 0.34
            : 0.18
          : isBlocked
          ? 0.7
          : 0.45;
        const weight  = isSelected ? 7 : 4;

        // For blocked routes: find where the passable segment ends
        const blockageIdx = isBlocked
          ? findBlockagePoint(routeOption.coordinates, incidents)
          : -1;

        // Passable segment: everything up to (and including) the blockage point.
        // If no blockage point found fall back to showing full route faded.
        const passableCoords =
          blockageIdx > 1
            ? routeOption.coordinates.slice(0, blockageIdx + 1)
            : routeOption.coordinates;

        const blockageCoord =
          blockageIdx > 1 ? routeOption.coordinates[blockageIdx] : null;

        const tooltip = (
          <Tooltip sticky>
            <strong>{routeOption.name}</strong>
            <br />
            <span>{routeOption.distanceKm} km · {routeOption.estimatedMinutes} min</span>
            {routeOption.analysis ? (
              <span> · {isBlocked ? <><Ban size={12} className="inline" /> BLOCKED</> : `Risk: ${risk}`} ({routeOption.analysis.routeHealth}% health)</span>
            ) : null}
          </Tooltip>
        );

        return (
          <React.Fragment key={routeOption.id}>
            {isBlocked ? (
              <>
                {/* Passable portion — solid green up to the block */}
                <Polyline
                  positions={passableCoords.map(toLatLng)}
                  pathOptions={{
                    color: "#16a34a",
                    opacity: isSelected ? 0.9 : isFaded ? 0.24 : 0.55,
                    weight: isPrimaryRoute ? weight + 1 : weight,
                    lineCap: "round",
                    lineJoin: "round"
                  }}
                  eventHandlers={{ click: () => onSelectRoute?.(routeOption) }}
                >
                  {tooltip}
                </Polyline>

                {/* Remainder of route — faded red dashed to show what's impassable */}
                {blockageIdx > 1 && blockageIdx < routeOption.coordinates.length - 1 ? (
                  <Polyline
                    positions={routeOption.coordinates.slice(blockageIdx).map(toLatLng)}
                    pathOptions={{
                      color: "#ef4444",
                      opacity: isSelected ? 0.68 : isFaded ? 0.28 : 0.45,
                      weight: isSelected ? 5 : isPrimaryRoute ? 4 : 3,
                      lineCap: "round",
                      lineJoin: "round",
                      dashArray: isPrimaryRoute ? "8 6" : "6 7"
                    }}
                    interactive={false}
                  />
                ) : null}

                {/* Blockage pin at the exact first impassable point */}
                {blockageCoord ? (
                  <Marker
                    position={toLatLng(blockageCoord)}
                    icon={makeBlockageIcon()}
                    zIndexOffset={1000}
                  >
                    <Popup>
                      <div className="map-popup">
                        <strong className="inline-flex items-center gap-1" style={{ color: "#b91c1c" }}>
                          <Ban size={14} /> Road Blocked
                        </strong>
                        <span>
                          {routeOption.analysis?.affectedIncidents
                            .filter(
                              (i) =>
                                i.severity === "NOT_PASSABLE" ||
                                i.severity === "WAIST_DEEP"
                            )
                            .map((i) => `${i.type} — ${i.landmark}`)
                            .join(", ") || "Impassable flood zone"}
                        </span>
                        <span style={{ fontSize: "0.72rem" }}>
                          Tap an alternate route to navigate around this area.
                        </span>
                      </div>
                    </Popup>
                  </Marker>
                ) : null}
              </>
            ) : (
              /* Normal passable route */
              <Polyline
                positions={routeOption.coordinates.map(toLatLng)}
                pathOptions={{
                  color,
                  opacity,
                  weight,
                  lineCap: "round",
                  lineJoin: "round"
                }}
                eventHandlers={{ click: () => onSelectRoute?.(routeOption) }}
              >
                {tooltip}
              </Polyline>
            )}
          </React.Fragment>
        );
      })}

      {/* If there's no multi-route list but there IS an activeRoute, render it alone */}
      {routes.length === 0 && activeRoute ? (
        <Polyline
          positions={activeRoute.coordinates.map(toLatLng)}
          pathOptions={{
            color: activeRoute.floodExposure > 5 ? "#b33b23" : "#2458b8",
            opacity: 0.9,
            weight: 6
          }}
        >
          <Tooltip sticky>{activeRoute.name}</Tooltip>
        </Polyline>
      ) : null}

      {/* Route endpoint pins — A (green) at origin, B (red) at destination */}
      {(routeDestination || activeRoute || routeMapPickMode) ? (
        <>
          {(routeOrigin ?? activeRoute?.coordinates[0]) && (activeRoute || routeDestination || routeMapPickMode === "origin") ? (
            <Marker
              position={toLatLng((routeOrigin ?? activeRoute!.coordinates[0]) as Coordinates)}
              icon={makeRouteEndpointIcon("origin")}
              zIndexOffset={900}
              draggable={Boolean(onRoutePinMoved) && routeMapPickMode === "origin"}
              eventHandlers={
                onRoutePinMoved && routeMapPickMode === "origin"
                  ? {
                      dragend: (event) => {
                        const marker = event.target as L.Marker;
                        const latLng = marker.getLatLng();
                        onRoutePinMoved("origin", {
                          lat: Number(latLng.lat.toFixed(5)),
                          lng: Number(latLng.lng.toFixed(5))
                        });
                      }
                    }
                  : undefined
              }
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                Start{routeMapPickMode === "origin" ? " (drag to move)" : ""}
              </Tooltip>
            </Marker>
          ) : null}

          {(routeDestination ?? activeRoute?.coordinates[activeRoute.coordinates.length - 1]) ? (
            <Marker
              position={toLatLng((routeDestination ?? activeRoute!.coordinates[activeRoute!.coordinates.length - 1]) as Coordinates)}
              icon={makeRouteEndpointIcon("destination")}
              zIndexOffset={900}
              draggable={Boolean(onRoutePinMoved) && routeMapPickMode === "destination"}
              eventHandlers={
                onRoutePinMoved && routeMapPickMode === "destination"
                  ? {
                      dragend: (event) => {
                        const marker = event.target as L.Marker;
                        const latLng = marker.getLatLng();
                        onRoutePinMoved("destination", {
                          lat: Number(latLng.lat.toFixed(5)),
                          lng: Number(latLng.lng.toFixed(5))
                        });
                      }
                    }
                  : undefined
              }
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                Destination{routeMapPickMode === "destination" ? " (drag to move)" : ""}
              </Tooltip>
            </Marker>
          ) : null}
        </>
      ) : null}

      {/* Render draggable stretch markers if drawing */}
      {isDrawingStretch && stretchStart ? (
        (() => {
          const startPos = stretchPath?.[0] ?? stretchStart;
          const endPos = stretchPath?.[stretchPath.length - 1] ?? stretchEnd;
          const hasBoth = Boolean(startPos && endPos);
          return (
            <>
              <Marker
                position={toLatLng(startPos)}
                draggable={hasBoth}
                eventHandlers={{
                  dragend: (e) => {
                    const latlng = e.target.getLatLng();
                    if (onStretchChange && stretchEnd) {
                      onStretchChange(
                        { lat: Number(latlng.lat.toFixed(5)), lng: Number(latlng.lng.toFixed(5)) },
                        stretchEnd
                      );
                    }
                  }
                }}
                icon={makeTextIcon("stretch-start", "S", "#ea580c")}
                zIndexOffset={1000}
              >
                <Tooltip direction="top" permanent>
                  {stretchEnd ? "Start of Flood Stretch (Drag me)" : "Start of Flood Stretch — now click the end"}
                </Tooltip>
              </Marker>
              {endPos ? (
                <>
                  <Marker
                    position={toLatLng(endPos)}
                    draggable={true}
                    eventHandlers={{
                      dragend: (e) => {
                        const latlng = e.target.getLatLng();
                        if (onStretchChange && stretchStart) {
                          onStretchChange(
                            stretchStart,
                            { lat: Number(latlng.lat.toFixed(5)), lng: Number(latlng.lng.toFixed(5)) }
                          );
                        }
                      }
                    }}
                    icon={makeTextIcon("stretch-end", "E", "#ea580c")}
                    zIndexOffset={1000}
                  >
                    <Tooltip direction="top" permanent>
                      End of Flood Stretch (Drag me)
                    </Tooltip>
                  </Marker>
                  <Polyline
                    positions={
                      stretchPath && stretchPath.length > 1
                        ? stretchPath.map(toLatLng)
                        : [toLatLng(startPos), toLatLng(endPos)]
                    }
                    pathOptions={{
                      color: "#ea580c",
                      dashArray: "6, 6",
                      weight: 5,
                      opacity: 0.9
                    }}
                  />
                </>
              ) : null}
            </>
          );
        })()
      ) : null}

      {/* Render incident markers and their stretches */}
      {incidents
        .filter((inc) => inc.status !== "archived")
        .map((incident) => {
          const sevMeta = severityColorMeta[incident.severity];
          const typeMeta = incidentTypeMeta[incident.type] || { label: incident.type, icon: MapPin };
          const isSelected = incident.id === selectedIncidentId;
          const isIncidentOnSelectedRoute = activeRoute?.analysis?.affectedIncidents.some(
            (ai) => ai.id === incident.id
          );

          const hasStretch = incident.floodStartLat && incident.floodStartLng && incident.floodEndLat && incident.floodEndLng;
          const incidentPath =
            hasStretch && incident.floodStretchPath && incident.floodStretchPath.length > 1
              ? incident.floodStretchPath
              : undefined;

          return (
            <React.Fragment key={incident.id}>
              {hasStretch && (
                <Polyline
                  positions={
                    incidentPath
                      ? incidentPath.map(toLatLng)
                      : [
                          [incident.floodStartLat!, incident.floodStartLng!],
                          [incident.floodEndLat!, incident.floodEndLng!]
                        ]
                  }
                  pathOptions={{
                    color: sevMeta.color,
                    weight: isSelected ? 6 : 4,
                    opacity: isSelected ? 0.9 : 0.65,
                    dashArray: "4, 6"
                  }}
                />
              )}
              <Marker
                position={toLatLng(incident.coordinates)}
                icon={makeIncidentIcon(typeMeta.icon, sevMeta.color, isSelected, isIncidentOnSelectedRoute)}
                eventHandlers={{ click: () => onSelectIncident(incident.id) }}
              >
                <Popup>
                  <div className="map-popup">
                    <div className="flex items-center gap-1.5 font-bold text-sm">
                      <typeMeta.icon size={14} className="shrink-0" />
                      <span>{incident.type}</span>
                    </div>
                    <span className="text-xs text-gray-500 font-semibold">{incident.roadName}</span>
                    <span className="text-xs text-gray-600 italic">Near {incident.landmark}</span>
                    <div className="flex gap-2 items-center mt-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] text-white font-bold"
                        style={{ backgroundColor: sevMeta.color }}
                      >
                        {sevMeta.label}
                      </span>
                      <span className="text-xs font-bold text-teal-600">{incident.confidence}% match</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

      {/* Render relief centers */}
      {reliefCenters?.map((centerItem) => {
        const meta = reliefCenterTypeMeta[centerItem.type];
        return (
          <Marker
            key={centerItem.id}
            position={toLatLng(centerItem.coordinates)}
            icon={makeIconMarker(meta.icon, meta.color, "center")}
          >
            <Popup>
              <div className="map-popup">
                <strong>{centerItem.name}</strong>
                <span>{meta.label}</span>
                <span>{Math.max(0, centerItem.capacity - centerItem.occupancy)} spaces available</span>
                <span>{centerItem.contact}</span>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Render help requests */}
      {helpRequests
        ?.filter((request) => request.status !== "completed")
        .map((request) => (
          <Marker
            key={request.id}
            position={toLatLng(request.coordinates)}
            icon={makeIconMarker(
              helpTypeMeta[request.type].icon,
              priorityMeta[request.priority].color,
              "help"
            )}
          >
            <Popup>
              <div className="map-popup">
                <strong>{helpTypeMeta[request.type].label} request</strong>
                <span>{request.locationName}</span>
                <span>{priorityMeta[request.priority].label} priority</span>
                <span>{request.peopleCount} people</span>
              </div>
            </Popup>
          </Marker>
        ))}

      {/* Report pending location pin */}
      {pendingLocation ? (
        <Marker
          position={toLatLng(pendingLocation)}
          icon={makeTextIcon("pending", "+", "#111827")}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              if (marker != null) {
                const latLng = marker.getLatLng();
                onPickLocation({ lat: latLng.lat, lng: latLng.lng });
              }
            }
          }}
        >
          <Tooltip direction="top" permanent>
            Selected Location (Drag to adjust)
          </Tooltip>
        </Marker>
      ) : null}
    </MapContainer>
  );
}

function MapPickModeBadge({ mode }: { mode: "origin" | "destination" }) {
  const map = useMap();
  useEffect(() => {
    const BadgeCtrl = L.Control.extend({
      onAdd() {
        const el = L.DomUtil.create("div", "vu-map-pick-badge");
        el.innerHTML = mode === "origin"
          ? "Pick source pin on map"
          : "Pick destination pin on map";
        return el;
      },
      onRemove() {}
    });
    const badge = new BadgeCtrl({ position: "topright" });
    badge.addTo(map);
    return () => {
      badge.remove();
    };
  }, [map, mode]);
  return null;
}

function StretchDrawBadge({ hasStart, hasEnd }: { hasStart: boolean; hasEnd: boolean }) {
  const map = useMap();
  useEffect(() => {
    const BadgeCtrl = L.Control.extend({
      onAdd() {
        const el = L.DomUtil.create("div", "vu-map-pick-badge vu-stretch-badge");
        el.innerHTML = !hasStart
          ? "Click the map to mark the START of the flooded road stretch"
          : !hasEnd
            ? "Click the map to mark the END of the flooded road stretch"
            : "Stretch set — drag the S / E markers to adjust";
        return el;
      },
      onRemove() {}
    });
    const badge = new BadgeCtrl({ position: "topright" });
    badge.addTo(map);
    return () => {
      badge.remove();
    };
  }, [map, hasStart, hasEnd]);
  return null;
}

// ── Report stretch toggle (pin-drop sub-feature) ─────────────────────────────
function ReportStretchToggle({
  isDrawingStretch,
  onToggle
}: {
  isDrawingStretch: boolean;
  onToggle: (active: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const StretchCtrl = L.Control.extend({
      onAdd() {
        const wrap = L.DomUtil.create("div", "leaflet-bar leaflet-control vu-stretch-toggle");
        const btn = L.DomUtil.create("button", `vu-stretch-toggle-btn${isDrawingStretch ? " vu-stretch-toggle-btn--active" : ""}`) as HTMLButtonElement;
        btn.type = "button";
        btn.title = isDrawingStretch
          ? "Cancel tracing the flooded route"
          : "Trace the flooded route length on the map";
        btn.setAttribute("aria-pressed", String(isDrawingStretch));
        btn.innerHTML = `
          <span>${iconSvg(isDrawingStretch ? X : PenLine, { size: 14, color: isDrawingStretch ? "#0f3d3e" : "#ffffff" })}</span>
          <span>${isDrawingStretch ? "Cancel tracing" : "Trace the Route"}</span>`;
        L.DomEvent.on(btn, "click", (e) => {
          L.DomEvent.stopPropagation(e);
          onToggle(!isDrawingStretch);
        });
        wrap.appendChild(btn);
        return wrap;
      },
      onRemove() {}
    });
    const control = new StretchCtrl({ position: "bottomright" });
    control.addTo(map);
    return () => { control.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isDrawingStretch, onToggle]);

  return null;
}

// ── Recenter control ──────────────────────────────────────────────────────────
function RecenterControl({
  onRecenter,
  gpsLoading,
  userLocation
}: {
  onRecenter: () => void;
  gpsLoading: boolean;
  userLocation?: Coordinates;
}) {
  const map = useMap();

  useEffect(() => {
    const RecenterCtrl = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create(
          "button",
          "leaflet-bar leaflet-control vu-recenter-btn"
        ) as HTMLButtonElement;
        btn.type = "button";
        btn.title = "Re-lock GPS and fly to your location";
        btn.setAttribute("aria-label", "Recenter map on GPS location");
        renderBtnState(btn, gpsLoading, !!userLocation);

        L.DomEvent.on(btn, "click", (e) => {
          L.DomEvent.stopPropagation(e);
          onRecenter();
        });

        return btn;
      },
      onRemove() {}
    });

    const control = new RecenterCtrl({ position: "bottomright" });
    control.addTo(map);
    return () => { control.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, gpsLoading, !!userLocation]);

  return null;
}

function renderBtnState(btn: HTMLButtonElement, loading: boolean, hasLocation: boolean) {
  if (loading) {
    btn.innerHTML = `
      <span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round"
             style="animation:vu-spin 1s linear infinite">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      </span>`;
  } else {
    const color = hasLocation ? "#2563eb" : "#6b7280";
    btn.innerHTML = `
      <span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;" title="Recenter on GPS">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          <circle cx="12" cy="12" r="7" stroke-dasharray="3 2"/>
        </svg>
      </span>`;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// Keeps the Leaflet view in sync with the container size. Leaflet only
// listens to window resizes, so container resizes caused by layout/media-query
// changes (breakpoint shifts, panel toggles, browser chrome on mobile) would
// otherwise leave tiles blurry or misaligned.
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ debounceMoveend: true });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function MapClickHandler({
  isDrawingStretch,
  onPickLocation,
  onStretchPoint
}: {
  isDrawingStretch?: boolean;
  onPickLocation: (coordinates: Coordinates) => void;
  onStretchPoint?: (point: Coordinates) => void;
}) {
  useMapEvents({
    click(event) {
      const coords: Coordinates = {
        lat: Number(event.latlng.lat.toFixed(5)),
        lng: Number(event.latlng.lng.toFixed(5))
      };
      if (isDrawingStretch && onStretchPoint) {
        onStretchPoint(coords);
      } else {
        onPickLocation(coords);
      }
    }
  });
  return null;
}

function MapViewController({
  center,
  hasActiveRoute
}: {
  center: Coordinates & { zoom?: number };
  hasActiveRoute: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (hasActiveRoute) return;
    map.flyTo([center.lat, center.lng], center.zoom ?? map.getZoom(), { duration: 0.6 });
  }, [center.lat, center.lng, center.zoom, hasActiveRoute, map]);
  return null;
}

function RouteViewController({ activeRoute }: { activeRoute?: RouteOption }) {
  const map = useMap();

  useEffect(() => {
    if (!activeRoute || activeRoute.coordinates.length === 0) return;

    const fitRoute = () => {
      const latLngs = activeRoute.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
      if (latLngs.length === 1) {
        map.setView(latLngs[0], 14, { animate: true, duration: 0.6 });
        return;
      }

      const bounds = L.latLngBounds(latLngs);
      if (!bounds.isValid()) return;

      const size = map.getSize();
      const padX = Math.min(180, Math.max(44, Math.round(size.x * 0.12)));
      const padY = Math.min(200, Math.max(52, Math.round(size.y * 0.14)));

      map.fitBounds(bounds, {
        paddingTopLeft: [padX, padY],
        paddingBottomRight: [padX, padY],
        maxZoom: 15,
        animate: true
      });
    };

    fitRoute();
    map.on("resize", fitRoute);
    return () => {
      map.off("resize", fitRoute);
    };
  }, [activeRoute, map]);
  return null;
}

function toLatLng(coordinates: Coordinates): [number, number] {
  return [coordinates.lat, coordinates.lng];
}

function makeTextIcon(kind: "center" | "help" | "pending" | "stretch-start" | "stretch-end", text: string, color: string) {
  return L.divIcon({
    className: `vu-map-icon vu-map-icon--${kind}`,
    html: `<span style="background:${color}">${text}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -10]
  });
}

// Colored ring pin with a lucide icon — same visual language as incident pins
function makeIconMarker(icon: LucideIcon, color: string, kind: "center" | "help") {
  const size = 34;
  return L.divIcon({
    className: `vu-map-icon vu-map-icon--${kind}`,
    html: `<div style="
      background:#ffffff;
      border:2px solid ${color};
      border-radius:50%;
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 3px 8px rgba(0,0,0,0.18);
    ">${iconSvg(icon, { size: 18, color })}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

// Road-blocked pin — red teardrop with a Ban icon
function makeBlockageIcon() {
  return L.divIcon({
    className: "vu-blockage-icon",
    html: `
      <div style="
        position: relative;
        width: 36px;
        height: 42px;
      ">
        <!-- Teardrop body -->
        <div style="
          width: 36px; height: 36px;
          background: #b91c1c;
          border: 3px solid #ffffff;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 3px 12px rgba(185,28,28,0.5);
        "></div>
        <!-- Icon centred in the circle -->
        <span style="
          position: absolute;
          top: 2px; left: 0;
          width: 36px; height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        ">${iconSvg(Ban, { size: 18, color: "#ffffff" })}</span>
      </div>`,
    iconSize: [36, 42],
    iconAnchor: [18, 42],
    popupAnchor: [0, -44]
  });
}

// Green "A" teardrop for origin, red "B" teardrop for destination
function makeRouteEndpointIcon(kind: "origin" | "destination") {
  const isOrigin = kind === "origin";
  const bg = isOrigin ? "#16a34a" : "#dc2626";
  const label = isOrigin ? "A" : "B";
  const size = 36;

  return L.divIcon({
    className: "vu-route-endpoint-icon",
    html: `
      <div style="position:relative;width:${size}px;height:${size + 10}px;">
        <div style="
          width:${size}px;height:${size}px;
          background:${bg};
          border:3px solid #ffffff;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 3px 10px rgba(0,0,0,0.28);
        "></div>
        <span style="
          position:absolute;top:4px;left:0;
          width:${size}px;text-align:center;
          color:#ffffff;font-size:14px;font-weight:900;
          font-family:system-ui,sans-serif;
          line-height:${size - 8}px;
          pointer-events:none;
        ">${label}</span>
      </div>`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 10],
    popupAnchor: [0, -(size + 10)]
  });
}

function makeIncidentIcon(
  icon: LucideIcon,
  color: string,
  isSelected: boolean,
  isIncidentOnSelectedRoute?: boolean
) {
  const size = isSelected ? 40 : 32;
  const borderSize = isSelected ? "3px" : "2px";
  const iconSize = isSelected ? 22 : 18;
  const shadow = isIncidentOnSelectedRoute
    ? `box-shadow:0 0 12px 6px ${color};`
    : `box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06);`;

  return L.divIcon({
    className: "vu-incident-icon",
    html: `<div style="
      background:white;
      border:${borderSize} solid ${color};
      border-radius:50%;
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      ${shadow}
      transform:scale(${isSelected ? 1.15 : 1.0});
      transition:all 0.2s ease-out;
    ">${iconSvg(icon, { size: iconSize, color })}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}
