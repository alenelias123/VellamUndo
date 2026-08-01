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
import { severityMeta } from "@/lib/floodReports";
import type {
  Coordinates,
  FloodReport,
  RouteOption
} from "@/lib/types";
import { Trash2 } from "lucide-react";

type FloodMapProps = {
  center: Coordinates;
  userLocation: Coordinates | null;
  reports: FloodReport[];
  selectedReportId?: string;
  activeRoute?: RouteOption;
  destinationLocation?: Coordinates | null;
  pendingLocation?: Coordinates | null;
  isAdmin: boolean;
  onSelectReport: (reportId: string) => void;
  onDeleteReport: (reportId: string) => void;
  onPickLocation: (coordinates: Coordinates) => void;
};

export function FloodMap({
  center,
  userLocation,
  reports,
  selectedReportId,
  activeRoute,
  destinationLocation,
  pendingLocation,
  isAdmin,
  onSelectReport,
  onDeleteReport,
  onPickLocation
}: FloodMapProps) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      scrollWheelZoom
      className="flood-map google-map-theme"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onPickLocation={onPickLocation} />
      <MapViewController center={center} />

      {/* User Realtime Geolocation Pulse Marker */}
      {userLocation ? (
        <Marker
          position={toLatLng(userLocation)}
          icon={makeUserLocationIcon()}
          zIndexOffset={1000}
        >
          <Popup>
            <div className="map-popup user-location-popup">
              <strong>📍 You are here</strong>
              <span>Live GPS position</span>
            </div>
          </Popup>
          <Tooltip direction="top" offset={[0, -10]}>
            Your Current Location (Live)
          </Tooltip>
        </Marker>
      ) : null}

      {/* Destination Marker */}
      {destinationLocation ? (
        <Marker
          position={toLatLng(destinationLocation)}
          icon={makeDestinationIcon()}
          zIndexOffset={900}
        >
          <Popup>
            <div className="map-popup">
              <strong>🎯 Destination</strong>
            </div>
          </Popup>
          <Tooltip direction="top" permanent offset={[0, -14]}>
            Destination
          </Tooltip>
        </Marker>
      ) : null}

      {/* Active Navigation Route */}
      {activeRoute ? (
        <Polyline
          positions={activeRoute.coordinates.map(toLatLng)}
          pathOptions={{
            color: activeRoute.floodExposure > 3 ? "#dc2626" : "#2563eb",
            opacity: 0.9,
            weight: 7,
            lineCap: "round",
            lineJoin: "round"
          }}
        >
          <Tooltip sticky>
            {activeRoute.name} • {activeRoute.distanceKm} km ({activeRoute.estimatedMinutes} mins)
          </Tooltip>
        </Polyline>
      ) : null}

      {/* Flood Reports Markers */}
      {reports.map((report) => {
        const meta = severityMeta[report.severity];
        const isSelected = report.id === selectedReportId;

        return (
          <CircleMarker
            key={report.id}
            center={toLatLng(report.coordinates)}
            radius={isSelected ? 16 : 11}
            pathOptions={{
              color: "#ffffff",
              fillColor: meta.color,
              fillOpacity: isSelected ? 0.95 : 0.85,
              opacity: 1,
              weight: isSelected ? 4 : 2
            }}
            eventHandlers={{
              click: () => onSelectReport(report.id)
            }}
          >
            <Popup>
              <div className="map-popup flood-report-popup">
                <div className="popup-header">
                  <strong>{report.roadName}</strong>
                  <span
                    className="severity-badge"
                    style={{ background: meta.background, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="location-sub">{report.locationName}</p>
                <div className="water-level">
                  💧 <strong>{report.waterLevelCm} cm</strong> water level
                </div>
                {report.description ? <p className="desc">{report.description}</p> : null}
                <div className="meta-info">
                  <small>Reported by {report.createdBy}</small>
                </div>

                {/* Admin Delete Action */}
                {isAdmin ? (
                  <button
                    type="button"
                    className="delete-report-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteReport(report.id);
                    }}
                  >
                    <Trash2 size={14} /> Delete Report (Admin)
                  </button>
                ) : null}
              </div>
            </Popup>
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              ⚠️ {report.roadName}: {meta.shortLabel} ({report.waterLevelCm}cm)
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Pending Tapped Location Marker */}
      {pendingLocation ? (
        <Marker
          position={toLatLng(pendingLocation)}
          icon={makeTextIcon("pending", "📍", "#2563eb")}
        >
          <Tooltip direction="top" permanent offset={[0, -14]}>
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
      duration: 0.8
    });
  }, [center.lat, center.lng, map]);

  return null;
}

function toLatLng(coordinates: Coordinates): [number, number] {
  return [coordinates.lat, coordinates.lng];
}

// User location icon (Google Maps style pulsing blue dot)
function makeUserLocationIcon() {
  return L.divIcon({
    className: "google-user-location-marker",
    html: `
      <div className="user-dot-wrapper">
        <div className="user-dot-pulse"></div>
        <div className="user-dot"></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

// Destination pin icon
function makeDestinationIcon() {
  return L.divIcon({
    className: "google-destination-marker",
    html: `<div style="background:#dc2626; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.3); font-size:16px;">🎯</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function makeTextIcon(kind: "pending", text: string, color: string) {
  return L.divIcon({
    className: `vu-map-icon vu-map-icon--${kind}`,
    html: `<span style="background:${color}; display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; color:white; font-size:16px; box-shadow:0 2px 8px rgba(0,0,0,0.3);">${text}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}
