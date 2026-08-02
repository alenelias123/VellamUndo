"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Code,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  Home,
  Info,
  Layers,
  Play,
  Search,
  Server,
  Terminal
} from "lucide-react";

type EndpointDoc = {
  id: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  summary: string;
  description: string;
  deprecated?: boolean;
  category: "Analytics" | "Geocoding" | "Incidents" | "Help Requests" | "Relief Centers" | "Routing" | "Legacy Reports";
  params?: Array<{ name: string; type: string; required: boolean; description: string; example?: string }>;
  requestBody?: string;
  responseBody: string;
  curlExample: string;
};

const endpointData: EndpointDoc[] = [
  {
    id: "get-analytics",
    method: "GET",
    path: "/api/analytics",
    summary: "Retrieve general statistics and analytics snapshot",
    description: "Fetches compiled statistics showing total active flood reports, impassable roads, pending rescue help requests, and available relief camp beds.",
    category: "Analytics",
    responseBody: `{
  "analytics": {
    "totalReports": 14,
    "blockedRoads": 3,
    "openHelpRequests": 8,
    "criticalHelpRequests": 2,
    "reliefBedsAvailable": 240,
    "averageConfidence": 78
  }
}`,
    curlExample: "curl -X GET http://localhost:3000/api/analytics"
  },
  {
    id: "get-geocode",
    method: "GET",
    path: "/api/geocode",
    summary: "Reverse geocode latitude and longitude to road name",
    description: "Resolves a coordinate pair into local attributes including the closest road name, landmark text, and administrative district name.",
    category: "Geocoding",
    params: [
      { name: "lat", type: "number", required: true, description: "Latitude coordinates of position.", example: "10.0245" },
      { name: "lng", type: "number", required: true, description: "Longitude coordinates of position.", example: "76.3122" }
    ],
    responseBody: `{
  "roadName": "Seaport-Airport Rd",
  "landmark": "Near Kakkanad Signal Junction",
  "district": "ernakulam"
}`,
    curlExample: "curl -X GET 'http://localhost:3000/api/geocode?lat=10.0245&lng=76.3122'"
  },
  {
    id: "get-help-requests",
    method: "GET",
    path: "/api/help-requests",
    summary: "List all active help requests",
    description: "Retrieves the list of active pleas for rescue, food supplies, drinking water, charging stations, and shelter camps.",
    category: "Help Requests",
    responseBody: `{
  "helpRequests": [
    {
      "id": "req-9238",
      "requesterName": "Amith Kumar",
      "contact": "+919876543210",
      "district": "ernakulam",
      "locationName": "Muttom Metro Station, Aluva",
      "coordinates": { "lat": 10.0841, "lng": 76.3312 },
      "type": "rescue",
      "priority": "critical",
      "peopleCount": 5,
      "description": "Rising floodwaters inside home. Family trapped on terrace.",
      "status": "open",
      "createdAt": "2026-08-02T15:20:00Z"
    }
  ]
}`,
    curlExample: "curl -X GET http://localhost:3000/api/help-requests"
  },
  {
    id: "post-help-requests",
    method: "POST",
    path: "/api/help-requests",
    summary: "Submit a new help request",
    description: "Creates and queues a community request for rescue assistance, medical help, food supplies, or general shelters.",
    category: "Help Requests",
    requestBody: `{
  "requesterName": "Alen Elias",
  "contact": "+919800112233",
  "district": "ernakulam",
  "locationName": "Near Periyar bridge camp",
  "coordinates": { "lat": 10.1245, "lng": 76.3562 },
  "type": "food",
  "priority": "high",
  "peopleCount": 3,
  "description": "Need dry rations and baby food packets."
}`,
    responseBody: `{
  "helpRequest": {
    "id": "help-req-df8a21",
    "requesterName": "Alen Elias",
    "contact": "+919800112233",
    "district": "ernakulam",
    "locationName": "Near Periyar bridge camp",
    "coordinates": { "lat": 10.1245, "lng": 76.3562 },
    "type": "food",
    "priority": "high",
    "peopleCount": 3,
    "description": "Need dry rations and baby food packets.",
    "status": "open",
    "createdAt": "2026-08-02T16:04:12Z"
  }
}`,
    curlExample: `curl -X POST http://localhost:3000/api/help-requests \\
  -H "Content-Type: application/json" \\
  -d '{"requesterName":"Alen Elias","contact":"+919800112233","district":"ernakulam","locationName":"Near Periyar bridge camp","coordinates":{"lat":10.1245,"lng":76.3562},"type":"food","priority":"high","peopleCount":3,"description":"Need dry rations and baby food packets."}'`
  },
  {
    id: "get-incidents",
    method: "GET",
    path: "/api/incidents",
    summary: "List active incidents and reports",
    description: "Retrieves compiled incident reports grouped by location clusters (within 500m proximity) containing current severity levels, confidence, verification votes, and photos.",
    category: "Incidents",
    responseBody: `{
  "incidents": [
    {
      "id": "incident-8af912",
      "type": "Flooded Road",
      "status": "active",
      "severity": "NOT_PASSABLE",
      "roadName": "MC Road",
      "landmark": "Near Town Masjid",
      "district": "ernakulam",
      "coordinates": { "lat": 10.1425, "lng": 76.5123 },
      "confidence": 92,
      "createdAt": "2026-08-02T12:00:00Z",
      "updatedAt": "2026-08-02T15:45:00Z",
      "reports": [
        {
          "id": "report-xyz",
          "incidentId": "incident-8af912",
          "severity": "NOT_PASSABLE",
          "notes": "Water depth over 3 feet. Impossible for cars.",
          "reporter": "Volunteer John",
          "createdAt": "2026-08-02T15:45:00Z",
          "photos": ["https://res.cloudinary.com/demo/image/upload/flood1.jpg"]
        }
      ],
      "verifications": []
    }
  ]
}`,
    curlExample: "curl -X GET http://localhost:3000/api/incidents"
  },
  {
    id: "post-incidents",
    method: "POST",
    path: "/api/incidents",
    summary: "Submit a new incident report",
    description: "Saves a new flood report. If another active report of the same category exists within 500 meters, it automatically groups the submission into that incident card cluster rather than creating a new marker.",
    category: "Incidents",
    requestBody: `{
  "latitude": 10.1425,
  "longitude": 76.5123,
  "severity": "NOT_PASSABLE",
  "type": "Flooded Road",
  "roadName": "MC Road",
  "landmark": "Near Town Masjid",
  "district": "ernakulam",
  "notes": "Water depth over 3 feet. Impossible for cars.",
  "reporter": "Volunteer John",
  "photos": ["https://res.cloudinary.com/demo/image/upload/flood1.jpg"]
}`,
    responseBody: `{
  "success": true,
  "reportId": "rep-cf1a82b",
  "incidentId": "incident-8af912",
  "isNewIncident": false,
  "ownershipToken": "9a23c8d1-7c2e-4b9a-8c9e-5e728e932ba8"
}`,
    curlExample: `curl -X POST http://localhost:3000/api/incidents \\
  -H "Content-Type: application/json" \\
  -d '{"latitude":10.1425,"longitude":76.5123,"severity":"NOT_PASSABLE","type":"Flooded Road","roadName":"MC Road","landmark":"Near Town Masjid","district":"ernakulam","notes":"Water depth over 3 feet. Impossible for cars.","reporter":"Volunteer John","photos":[]}'`
  },
  {
    id: "patch-incident",
    method: "PATCH",
    path: "/api/incidents/[id]",
    summary: "Update specific incident attributes",
    description: "Modifies primary coordinate, severity level, type, district, and coordinates of an incident. restricted to authenticated volunteer/admin accounts.",
    category: "Incidents",
    requestBody: `{
  "status": "receding",
  "severity": "KNEE_DEEP"
}`,
    responseBody: `{
  "success": true,
  "updatedIncident": {
    "id": "incident-8af912",
    "status": "receding",
    "severity": "KNEE_DEEP",
    "updatedAt": "2026-08-02T16:11:32Z"
  }
}`,
    curlExample: `curl -X PATCH http://localhost:3000/api/incidents/incident-8af912 \\
  -H "Content-Type: application/json" \\
  -d '{"status":"receding","severity":"KNEE_DEEP"}'`
  },
  {
    id: "delete-incident",
    method: "DELETE",
    path: "/api/incidents/[id]",
    summary: "Archive or delete an incident",
    description: "Archives an incident. Deletes its active visibility from maps and routes. Restricted to admins.",
    category: "Incidents",
    responseBody: `{
  "success": true,
  "archived": true
}`,
    curlExample: "curl -X DELETE http://localhost:3000/api/incidents/incident-8af912"
  },
  {
    id: "post-verify-incident",
    method: "POST",
    path: "/api/incidents/[id]/verify",
    summary: "Cast a status verification vote",
    description: "Submit status verification votes. Updates overall incident confidence percentages in real-time.",
    category: "Incidents",
    requestBody: `{
  "vote": "water-receding",
  "reporter": "volunteer-john"
}`,
    responseBody: `{
  "success": true,
  "newConfidence": 82
}`,
    curlExample: `curl -X POST http://localhost:3000/api/incidents/incident-8af912/verify \\
  -H "Content-Type: application/json" \\
  -d '{"vote":"water-receding","reporter":"volunteer-john"}'`
  },
  {
    id: "get-relief-centers",
    method: "GET",
    path: "/api/relief-centers",
    summary: "List relief camps and service hubs",
    description: "Fetches details of emergency medical camps, relief camp shelters, food packaging camps, and fire rescue service stations.",
    category: "Relief Centers",
    responseBody: `{
  "reliefCenters": [
    {
      "id": "camp-8a",
      "name": "Aluva Town Hall Relief Camp",
      "district": "ernakulam",
      "type": "relief-camp",
      "coordinates": { "lat": 10.1092, "lng": 76.3531 },
      "address": "Town Hall Rd, Aluva, Kerala 683101",
      "contact": "0484-2624233",
      "capacity": 400,
      "occupancy": 220,
      "supplies": ["Dry rations", "Blankets", "Baby diapers", "Drinking water"]
    }
  ]
}`,
    curlExample: "curl -X GET http://localhost:3000/api/relief-centers"
  },
  {
    id: "post-route-plan",
    method: "POST",
    path: "/api/route-plan",
    summary: "Calculate flood-avoiding alternative route",
    description: "Queries OSRM server to calculate safe road routes between two points, automatically inserting avoidance checkpoints for streets blocked by impassable reports.",
    category: "Routing",
    requestBody: `{
  "origin": { "lat": 10.0245, "lng": 76.3122 },
  "destination": { "lat": 10.1235, "lng": 76.5432 }
}`,
    responseBody: `{
  "routes": [
    {
      "distance": 24500,
      "duration": 1820,
      "geometry": "encoded_polyline_string",
      "safe": true,
      "floodedStretchesAvoided": 2
    }
  ]
}`,
    curlExample: `curl -X POST http://localhost:3000/api/route-plan \\
  -H "Content-Type: application/json" \\
  -d '{"origin":{"lat":10.0245,"lng":76.3122},"destination":{"lat":10.1235,"lng":76.5432}}'`
  },
  {
    id: "put-reports",
    method: "PUT",
    path: "/api/reports/[id]",
    summary: "Edit raw user submission notes",
    description: "Allows corrections to be sent for incident notes or severity values. Guest user edits are limited to 5 minutes after submission.",
    category: "Legacy Reports",
    requestBody: `{
  "notes": "Correction: Water levels are waist deep now.",
  "severity": "WAIST_DEEP",
  "ownershipToken": "9a23c8d1-7c2e-4b9a-8c9e-5e728e932ba8"
}`,
    responseBody: `{
  "success": true
}`,
    curlExample: `curl -X PUT http://localhost:3000/api/reports/rep-cf1a82b \\
  -H "Content-Type: application/json" \\
  -d '{"notes":"Correction: Water levels are waist deep now.","severity":"WAIST_DEEP","ownershipToken":"9a23c8d1-7c2e-4b9a-8c9e-5e728e932ba8"}'`
  },
  {
    id: "delete-reports",
    method: "DELETE",
    path: "/api/reports/[id]",
    summary: "Delete raw user submission report",
    description: "Permanently deletes a specific sub-report. Guests must supply their original ownership token parameter to delete their reports.",
    category: "Legacy Reports",
    params: [
      { name: "token", type: "string", required: false, description: "Guest user ownership verification token.", example: "9a23c8d1-7c2e-4b9a-8c9e-5e728e932ba8" }
    ],
    responseBody: `{
  "success": true
}`,
    curlExample: "curl -X DELETE 'http://localhost:3000/api/reports/rep-cf1a82b?token=9a23c8d1-7c2e-4b9a-8c9e-5e728e932ba8'"
  }
];

export default function DocsPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDoc>(endpointData[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleTryItOut = async (endpoint: EndpointDoc) => {
    setTestingEndpoint(endpoint.id);
    setTestResult(null);
    try {
      let url = endpoint.path;
      const options: RequestInit = {
        method: endpoint.method,
        headers: {
          "Content-Type": "application/json"
        }
      };

      // Mock test if POST/PATCH or parameter matching is needed
      if (endpoint.method === "POST" || endpoint.method === "PATCH" || endpoint.method === "PUT") {
        options.body = endpoint.requestBody;
      }

      if (endpoint.params) {
        const queryParts = endpoint.params.map(p => `${p.name}=${p.example || ""}`);
        url += `?${queryParts.join("&")}`;
      }

      // Format clean URL path placeholders
      url = url.replace("[id]", "incident-8af912");

      const response = await fetch(url, options);
      const data = await response.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setTestResult(JSON.stringify({ error: "Failed to connect to API endpoint. Ensure server is running locally.", message: err.message }, null, 2));
    } finally {
      setTestingEndpoint(null);
    }
  };

  const filteredEndpoints = endpointData.filter(
    ep =>
      ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ep.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ep.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="docs-page">
      <style jsx global>{`
        .docs-page {
          display: flex;
          min-height: 100vh;
          background-color: #0f172a;
          color: #f1f5f9;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .docs-sidebar {
          width: 320px;
          border-right: 1px solid #1e293b;
          background-color: #0b0f19;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
        }
        .docs-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #38bdf8;
          font-weight: 800;
          font-size: 1.15rem;
          letter-spacing: -0.025em;
          padding: 0 8px;
        }
        .docs-search {
          display: flex;
          align-items: center;
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 8px 12px;
          gap: 8px;
        }
        .docs-search input {
          background: transparent;
          border: none;
          color: #f1f5f9;
          font-size: 0.85rem;
          outline: none;
          width: 100%;
        }
        .docs-menu {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .docs-category-title {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          font-weight: 700;
          padding: 0 8px;
          margin-bottom: 6px;
        }
        .docs-item-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .docs-menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }
        .docs-menu-item:hover {
          background-color: #1e293b;
        }
        .docs-menu-item--active {
          background-color: #0f172a;
          border-color: #38bdf8;
        }
        .badge-method {
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          min-width: 48px;
          text-align: center;
        }
        .badge-GET { background-color: #059669; color: #ecfdf5; }
        .badge-POST { background-color: #2563eb; color: #eff6ff; }
        .badge-PATCH { background-color: #7c3aed; color: #f5f3ff; }
        .badge-PUT { background-color: #d97706; color: #fffbeb; }
        .badge-DELETE { background-color: #dc2626; color: #fef2f2; }

        .docs-item-path {
          font-size: 0.8rem;
          font-family: monospace;
          color: #cbd5e1;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-left: 8px;
          flex: 1;
        }
        .docs-content {
          flex: 1;
          padding: 40px;
          overflow-y: auto;
          max-width: 1000px;
        }
        .docs-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid #1e293b;
          padding-bottom: 24px;
          margin-bottom: 32px;
        }
        .docs-meta-links {
          display: flex;
          gap: 12px;
        }
        .btn-outline {
          display: flex;
          align-items: center;
          gap: 6px;
          background-color: #1e293b;
          border: 1px solid #334155;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          color: #e2e8f0;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
        }
        .btn-outline:hover {
          background-color: #334155;
          border-color: #475569;
        }
        .docs-title-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: monospace;
          background-color: #1e293b;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid #334155;
          font-size: 0.95rem;
          margin-bottom: 12px;
        }
        .docs-summary {
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #f8fafc;
          margin-bottom: 12px;
        }
        .docs-description {
          color: #94a3b8;
          font-size: 0.95rem;
          line-height: 1.6;
          margin-bottom: 28px;
        }
        .docs-section-title {
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #38bdf8;
        }
        .docs-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 28px;
          font-size: 0.85rem;
        }
        .docs-table th {
          text-align: left;
          background-color: #0b0f19;
          padding: 10px 14px;
          border-bottom: 1px solid #1e293b;
          color: #64748b;
          font-weight: 600;
        }
        .docs-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #1e293b;
          color: #cbd5e1;
        }
        .param-name {
          font-weight: 700;
          font-family: monospace;
          color: #f8fafc;
        }
        .param-req {
          color: #f43f5e;
          font-weight: 700;
          font-size: 0.75rem;
        }
        .code-container {
          position: relative;
          background-color: #0b0f19;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 28px;
          font-family: monospace;
          font-size: 0.85rem;
          overflow-x: auto;
          color: #38bdf8;
          max-height: 400px;
        }
        .copy-button {
          position: absolute;
          right: 12px;
          top: 12px;
          background-color: #1e293b;
          border: 1px solid #334155;
          padding: 6px;
          border-radius: 4px;
          cursor: pointer;
          color: #cbd5e1;
          transition: all 0.2s;
        }
        .copy-button:hover {
          background-color: #334155;
          color: #fff;
        }
        .btn-try {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: #0284c7;
          border: none;
          color: #fff;
          padding: 10px 18px;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 24px;
        }
        .btn-try:hover {
          background-color: #0369a1;
        }
        .test-console-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: #34d399;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
      `}</style>

      {/* ── Left Sidebar Navigation ───────────────────────── */}
      <div className="docs-sidebar">
        <div className="docs-brand">
          <BookOpen size={20} />
          <span>Vellam Undo API Console</span>
        </div>

        <div className="docs-search">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search endpoints..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="docs-menu">
          {["Analytics", "Geocoding", "Incidents", "Help Requests", "Relief Centers", "Routing", "Legacy Reports"].map(category => {
            const list = filteredEndpoints.filter(ep => ep.category === category);
            if (list.length === 0) return null;
            return (
              <div key={category} className="docs-category-group">
                <div className="docs-category-title">{category}</div>
                <div className="docs-item-list">
                  {list.map(ep => {
                    const isActive = selectedEndpoint.id === ep.id;
                    return (
                      <div
                        key={ep.id}
                        className={`docs-menu-item${isActive ? " docs-menu-item--active" : ""}`}
                        onClick={() => {
                          setSelectedEndpoint(ep);
                          setTestResult(null);
                        }}
                      >
                        <span className={`badge-method badge-${ep.method}`}>{ep.method}</span>
                        <span className="docs-item-path">{ep.path}</span>
                        <ChevronRight size={12} className="text-slate-500" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main Details Frame ────────────────────────────── */}
      <div className="docs-content">
        <div className="docs-header-row">
          <div>
            <div className="docs-title-badge">
              <Server size={14} className="text-sky-400" />
              <span>Base URL: http://localhost:3000</span>
            </div>
            <h1>API Specification</h1>
          </div>
          <div className="docs-meta-links">
            <a href="/" className="btn-outline">
              <Home size={14} />
              <span>Dashboard</span>
            </a>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="btn-outline">
              <Globe size={14} />
              <span>openapi.json</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Selected Endpoint Card Detail */}
        <div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
            <span className={`badge-method badge-${selectedEndpoint.method}`} style={{ padding: "4px 8px", fontSize: "0.75rem" }}>
              {selectedEndpoint.method}
            </span>
            <span style={{ fontSize: "1.1rem", fontFamily: "monospace", fontWeight: 700, color: "#cbd5e1" }}>
              {selectedEndpoint.path}
            </span>
          </div>

          <h2 className="docs-summary">{selectedEndpoint.summary}</h2>
          <p className="docs-description">{selectedEndpoint.description}</p>

          {/* Path / Query Parameters */}
          {selectedEndpoint.params && (
            <div>
              <div className="docs-section-title">
                <Info size={14} />
                <span>Request Parameters</span>
              </div>
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEndpoint.params.map(p => (
                    <tr key={p.name}>
                      <td>
                        <span className="param-name">{p.name}</span>
                      </td>
                      <td>
                        <span className="text-slate-400">{p.type}</span>
                      </td>
                      <td>
                        {p.required ? <span className="param-req">required</span> : <span className="text-slate-500">optional</span>}
                      </td>
                      <td>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Request Body Payload */}
          {selectedEndpoint.requestBody && (
            <div>
              <div className="docs-section-title">
                <Layers size={14} />
                <span>Request Body Example (JSON)</span>
              </div>
              <div className="code-container">
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => handleCopy(selectedEndpoint.requestBody || "", "req")}
                  title="Copy payload"
                >
                  {copiedId === "req" ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
                <pre style={{ margin: 0 }}>{selectedEndpoint.requestBody}</pre>
              </div>
            </div>
          )}

          {/* Curl Command line trigger */}
          <div className="docs-section-title">
            <Terminal size={14} />
            <span>Example cURL Request</span>
          </div>
          <div className="code-container" style={{ color: "#34d399" }}>
            <button
              type="button"
              className="copy-button"
              onClick={() => handleCopy(selectedEndpoint.curlExample, "curl")}
              title="Copy curl"
            >
              {copiedId === "curl" ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{selectedEndpoint.curlExample}</pre>
          </div>

          {/* Response Payload */}
          <div className="docs-section-title">
            <Code size={14} />
            <span>Response Payload (JSON)</span>
          </div>
          <div className="code-container" style={{ color: "#cbd5e1" }}>
            <button
              type="button"
              className="copy-button"
              onClick={() => handleCopy(selectedEndpoint.responseBody, "res")}
              title="Copy response schema"
            >
              {copiedId === "res" ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
            <pre style={{ margin: 0 }}>{selectedEndpoint.responseBody}</pre>
          </div>

          {/* Interactive Test Panel */}
          <button
            type="button"
            className="btn-try"
            onClick={() => handleTryItOut(selectedEndpoint)}
            disabled={testingEndpoint !== null}
          >
            <Play size={14} />
            <span>{testingEndpoint === selectedEndpoint.id ? "Fetching Response..." : "Send Test API Request"}</span>
          </button>

          {/* Try Out Results */}
          {testResult && (
            <div style={{ marginTop: "16px" }}>
              <div className="test-console-title">
                <Globe size={14} />
                <span>API Console Response:</span>
              </div>
              <div className="code-container" style={{ color: "#a7f3d0", borderColor: "#059669" }}>
                <pre style={{ margin: 0 }}>{testResult}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
