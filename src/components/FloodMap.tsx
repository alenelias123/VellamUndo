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
  onSelectRoute?: (route: RouteOption) => void;
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
  onSelectRoute,
  pendingLocation,
  gpsLoading = false,
  onRecenter,
  onSelectIncident,
  onPickLocation
}: FloodMapProps) {
  const [mounted, setMounted] = useState(false);

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
      center={[center.lat, center.lng]}
      zoom={11}
      scrollWheelZoom
      className="flood-map"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onPickLocation={onPickLocation} />
      <MapViewController center={center} />
      <RouteViewController activeRoute={activeRoute} />

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
        const risk = routeOption.analysis?.floodRisk ?? "LOW";
        const health = routeOption.analysis?.routeHealth ?? 100;
        const isBlocked = health === 0 || risk === "EXTREME";

        // Risk-based color for all routes
        let color: string;
        if (isBlocked)              color = "#b91c1c";
        else if (risk === "HIGH")   color = "#ea580c";
        else if (risk === "MEDIUM") color = "#0284c7";
        else                        color = "#157f3b";

        const opacity = isSelected ? 0.95 : isFaded ? 0.18 : isBlocked ? 0.6 : 0.45;
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
              <span> · {isBlocked ? "🚫 BLOCKED" : `Risk: ${risk}`} ({routeOption.analysis.routeHealth}% health)</span>
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
                    opacity: isSelected ? 0.9 : isFaded ? 0.2 : 0.55,
                    weight,
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
                      opacity: isSelected ? 0.55 : isFaded ? 0.1 : 0.28,
                      weight: isSelected ? 5 : 3,
                      lineCap: "round",
                      lineJoin: "round",
                      dashArray: "6 7"
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
                        <strong style={{ color: "#b91c1c" }}>🚫 Road Blocked</strong>
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
      {activeRoute && activeRoute.coordinates.length >= 2 ? (
        <>
          <Marker
            position={toLatLng(activeRoute.coordinates[0])}
            icon={makeRouteEndpointIcon("origin")}
            zIndexOffset={900}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
              Start
            </Tooltip>
          </Marker>

          <Marker
            position={toLatLng(activeRoute.coordinates[activeRoute.coordinates.length - 1])}
            icon={makeRouteEndpointIcon("destination")}
            zIndexOffset={900}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
              Destination
            </Tooltip>
          </Marker>
        </>
      ) : null}

      {/* Render incident markers */}
      {incidents
        .filter((inc) => inc.status !== "archived")
        .map((incident) => {
          const sevMeta = severityColorMeta[incident.severity];
          const typeMeta = incidentTypeMeta[incident.type] || { label: incident.type, icon: "📍" };
          const isSelected = incident.id === selectedIncidentId;
          const isIncidentOnSelectedRoute = activeRoute?.analysis?.affectedIncidents.some(
            (ai) => ai.id === incident.id
          );

          return (
            <Marker
              key={incident.id}
              position={toLatLng(incident.coordinates)}
              icon={makeIncidentIcon(typeMeta.icon, sevMeta.color, isSelected, isIncidentOnSelectedRoute)}
              eventHandlers={{ click: () => onSelectIncident(incident.id) }}
            >
              <Popup>
                <div className="map-popup">
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <span>{typeMeta.icon}</span>
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
                    <span className="text-xs font-bold text-blue-600">{incident.confidence}% match</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* Render relief centers */}
      {reliefCenters?.map((centerItem) => {
        const meta = reliefCenterTypeMeta[centerItem.type];
        return (
          <Marker
            key={centerItem.id}
            position={toLatLng(centerItem.coordinates)}
            icon={makeTextIcon("center", meta.label.slice(0, 1), meta.color)}
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
            icon={makeTextIcon(
              "help",
              helpTypeMeta[request.type].label.slice(0, 1),
              priorityMeta[request.priority].color
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
        >
          <Tooltip direction="top" permanent>
            Selected Location
          </Tooltip>
        </Marker>
      ) : null}
    </MapContainer>
  );
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

function MapClickHandler({ onPickLocation }: { onPickLocation: (coordinates: Coordinates) => void }) {
  useMapEvents({
    click(event) {
      onPickLocation({
        lat: Number(event.latlng.lat.toFixed(5)),
        lng: Number(event.latlng.lng.toFixed(5))
      });
    }
  });
  return null;
}

function MapViewController({ center }: { center: Coordinates }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.6 });
  }, [center.lat, center.lng, map]);
  return null;
}

function RouteViewController({ activeRoute }: { activeRoute?: RouteOption }) {
  const map = useMap();
  useEffect(() => {
    if (activeRoute && activeRoute.coordinates.length > 0) {
      const latLngs = activeRoute.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
      map.fitBounds(L.latLngBounds(latLngs), { padding: [60, 60], maxZoom: 13, duration: 0.8 });
    }
  }, [activeRoute, map]);
  return null;
}

function toLatLng(coordinates: Coordinates): [number, number] {
  return [coordinates.lat, coordinates.lng];
}

function makeTextIcon(kind: "center" | "help" | "pending", text: string, color: string) {
  return L.divIcon({
    className: `vu-map-icon vu-map-icon--${kind}`,
    html: `<span style="background:${color}">${text}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -10]
  });
}

// Road-blocked pin — red octagon with 🚫
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
          top: 3px; left: 0;
          width: 36px;
          text-align: center;
          font-size: 16px;
          line-height: 30px;
          pointer-events: none;
        ">🚫</span>
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
  emoji: string,
  color: string,
  isSelected: boolean,
  isIncidentOnSelectedRoute?: boolean
) {
  const size = isSelected ? 40 : 32;
  const borderSize = isSelected ? "3px" : "2px";
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
      font-size:${isSelected ? "20px" : "16px"};
      ${shadow}
      transform:scale(${isSelected ? 1.15 : 1.0});
      transition:all 0.2s ease-out;
    ">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}
