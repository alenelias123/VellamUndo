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
import { severityMeta } from "@/lib/floodReports";
import type {
  Coordinates,
  FloodReport,
  HelpRequest,
  ReliefCenter,
  RouteOption
} from "@/lib/types";

type FloodMapProps = {
  center: Coordinates;
  reports: FloodReport[];
  helpRequests: HelpRequest[];
  reliefCenters: ReliefCenter[];
  selectedReportId?: string;
  activeRoute?: RouteOption;
  pendingLocation?: Coordinates;
  onSelectReport: (reportId: string) => void;
  onPickLocation: (coordinates: Coordinates) => void;
};

export function FloodMap({
  center,
  reports,
  helpRequests,
  reliefCenters,
  selectedReportId,
  activeRoute,
  pendingLocation,
  onSelectReport,
  onPickLocation
}: FloodMapProps) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={10}
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

      {activeRoute ? (
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

      {reports.map((report) => {
        const meta = severityMeta[report.severity];
        const isSelected = report.id === selectedReportId;

        return (
          <CircleMarker
            key={report.id}
            center={toLatLng(report.coordinates)}
            radius={isSelected ? 14 : 10}
            pathOptions={{
              color: "#ffffff",
              fillColor: meta.color,
              fillOpacity: isSelected ? 0.95 : 0.82,
              opacity: 1,
              weight: isSelected ? 4 : 2
            }}
            eventHandlers={{
              click: () => onSelectReport(report.id)
            }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{report.roadName}</strong>
                <span>{report.locationName}</span>
                <span>{meta.label}</span>
                <span>{report.waterLevelCm} cm reported water level</span>
              </div>
            </Popup>
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              {report.roadName}: {meta.shortLabel}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {reliefCenters.map((centerItem) => {
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

      {helpRequests
        .filter((request) => request.status !== "completed")
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
            New report location
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

function toLatLng(coordinates: Coordinates): [number, number] {
  return [coordinates.lat, coordinates.lng];
}

function makeTextIcon(kind: "center" | "help" | "pending", text: string, color: string) {
  return L.divIcon({
    className: `vu-map-icon vu-map-icon--${kind}`,
    html: `<span style="background:${color}">${text}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14]
  });
}
