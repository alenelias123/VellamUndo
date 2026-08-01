"use client";

import { useEffect } from "react";
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
import { severityRank, incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
import type {
  Coordinates,
  Incident,
  IncidentType,
  HelpRequest,
  ReliefCenter,
  RouteOption,
  SeverityLevel
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
  onSelectIncident: (id: string) => void;
  onPickLocation: (coordinates: Coordinates) => void;
};

export function FloodMap({
  center,
  incidents,
  helpRequests,
  reliefCenters,
  selectedIncidentId,
  activeRoute,
  routes = [],
  onSelectRoute,
  pendingLocation,
  onSelectIncident,
  onPickLocation
}: FloodMapProps) {
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

      {/* Render all calculated driving routes */}
      {routes.map((routeOption) => {
        const isSelected = activeRoute?.id === routeOption.id;
        // Fade non-selected routes if one is active, otherwise draw semi-bold
        const isFaded = activeRoute && !isSelected;
        const opacity = isSelected ? 0.95 : isFaded ? 0.22 : 0.6;
        const weight = isSelected ? 7 : 4;
        
        let color = "#64748b"; // default slate gray
        if (isSelected) {
          const risk = routeOption.analysis?.floodRisk || "LOW";
          if (risk === "LOW") color = "#157f3b"; // green
          else if (risk === "MEDIUM") color = "#0284c7"; // blue
          else if (risk === "HIGH") color = "#ea580c"; // orange
          else color = "#b91c1c"; // extreme red
        }

        return (
          <Polyline
            key={routeOption.id}
            positions={routeOption.coordinates.map(toLatLng)}
            pathOptions={{
              color,
              opacity,
              weight,
              lineCap: "round",
              lineJoin: "round"
            }}
            eventHandlers={{
              click: () => onSelectRoute && onSelectRoute(routeOption)
            }}
          >
            <Tooltip sticky>
              <strong>{routeOption.name}</strong>
              <br />
              <span>{routeOption.distanceKm} km · {routeOption.estimatedMinutes} min</span>
              {routeOption.analysis && (
                <span> · Risk: {routeOption.analysis.floodRisk} ({routeOption.analysis.routeHealth}% Health)</span>
              )}
            </Tooltip>
          </Polyline>
        );
      })}

      {/* Render incident markers */}
      {incidents
        .filter((inc) => inc.status !== "archived")
        .map((incident) => {
          const sevMeta = severityColorMeta[incident.severity];
          const typeMeta = incidentTypeMeta[incident.type] || { label: incident.type, icon: "📍" };
          const isSelected = incident.id === selectedIncidentId;

          // Check if this incident lies along the selected active route path
          const isIncidentOnSelectedRoute = activeRoute?.analysis?.affectedIncidents.some(
            (ai) => ai.id === incident.id
          );

          // Highlight markers that are along the path of the selected route
          const pulseClass = isIncidentOnSelectedRoute ? "animate-pulse" : "";

          return (
            <Marker
              key={incident.id}
              position={toLatLng(incident.coordinates)}
              icon={makeIncidentIcon(typeMeta.icon, sevMeta.color, isSelected, isIncidentOnSelectedRoute)}
              eventHandlers={{
                click: () => onSelectIncident(incident.id)
              }}
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
            icon={makeTextIcon("help", helpTypeMeta[request.type].label.slice(0, 1), priorityMeta[request.priority].color)}
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
    map.flyTo([center.lat, center.lng], map.getZoom(), {
      duration: 0.6
    });
  }, [center.lat, center.lng, map]);

  return null;
}

function RouteViewController({ activeRoute }: { activeRoute?: RouteOption }) {
  const map = useMap();

  useEffect(() => {
    if (activeRoute && activeRoute.coordinates.length > 0) {
      const latLngs = activeRoute.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 13,
        duration: 0.8
      });
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

function makeIncidentIcon(emoji: string, color: string, isSelected: boolean, isIncidentOnSelectedRoute?: boolean) {
  const size = isSelected ? 40 : 32;
  const borderSize = isSelected ? "3px" : "2px";
  const glowShadow = isIncidentOnSelectedRoute
    ? `box-shadow: 0 0 12px 6px ${color};`
    : `box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);`;

  return L.divIcon({
    className: "vu-incident-icon",
    html: `<div style="
      background: white; 
      border: ${borderSize} solid ${color}; 
      border-radius: 50%; 
      width: ${size}px; 
      height: ${size}px; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      font-size: ${isSelected ? "20px" : "16px"};
      ${glowShadow}
      transform: scale(${isSelected ? 1.15 : 1.0});
      transition: all 0.2s ease-out;
    ">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}
