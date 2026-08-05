import { NextResponse } from "next/server";

export async function GET() {
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "Vellam Undo API Documentation",
      description: "Real-time emergency coordination, route planning, flood reporting, and smart road snapping API.",
      version: "1.0.0"
    },
    servers: [
      {
        url: "/api",
        description: "Local / Production API Gateway"
      }
    ],
    paths: {
      "/analytics": {
        "get": {
          "summary": "Retrieve disaster analytics",
          "description": "Fetch high-level statistics like total incident reports, blocked roads, and help requests.",
          "responses": {
            "200": {
              "description": "Success returning analytics statistics object.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "analytics": {
                        "type": "object",
                        "properties": {
                          "totalReports": { "type": "integer", "example": 14 },
                          "blockedRoads": { "type": "integer", "example": 3 },
                          "openHelpRequests": { "type": "integer", "example": 8 },
                          "criticalHelpRequests": { "type": "integer", "example": 2 },
                          "averageConfidence": { "type": "integer", "example": 78 }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/geocode": {
        "get": {
          "summary": "Reverse Geocoding",
          "description": "Resolve geographic coordinates into a human-readable road name, landmark, and district.",
          "parameters": [
            {
              "name": "lat",
              "in": "query",
              "required": true,
              "description": "Latitude of the selected coordinate point",
              "schema": { "type": "number", "example": 10.12345 }
            },
            {
              "name": "lng",
              "in": "query",
              "required": true,
              "description": "Longitude of the selected coordinate point",
              "schema": { "type": "number", "example": 76.54321 }
            }
          ],
          "responses": {
            "200": {
              "description": "Location resolved successfully.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "roadName": { "type": "string", "example": "MC Road" },
                      "landmark": { "type": "string", "example": "Perumbavoor Junction" },
                      "district": { "type": "string", "example": "ernakulam" }
                    }
                  }
                }
              }
            },
            "400": {
              "description": "Missing parameters."
            }
          }
        }
      },
      "/help-requests": {
        "get": {
          "summary": "List Help Requests",
          "description": "Retrieve all community rescue, supply, and medical assistance requests.",
          "responses": {
            "200": {
              "description": "Returns array of active requests.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "helpRequests": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "id": { "type": "string" },
                            "requesterName": { "type": "string" },
                            "contact": { "type": "string" },
                            "district": { "type": "string" },
                            "locationName": { "type": "string" },
                            "peopleCount": { "type": "integer" },
                            "type": { "type": "string", "enum": ["rescue", "food", "water", "medicine", "shelter", "charging"] },
                            "priority": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
                            "status": { "type": "string", "enum": ["open", "assigned", "in-progress", "completed"] }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "post": {
          "summary": "Create Help Request",
          "description": "Dispatch a new plea for help, rescue, food, shelter, or volunteer logistics.",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": ["requesterName", "contact", "district", "locationName", "coordinates", "type", "priority", "peopleCount", "description"],
                  "properties": {
                    "requesterName": { "type": "string", "example": "Amith Kumar" },
                    "contact": { "type": "string", "example": "+919876543210" },
                    "district": { "type": "string", "example": "ernakulam" },
                    "locationName": { "type": "string", "example": "Near River bank camp" },
                    "coordinates": {
                      "type": "object",
                      "properties": {
                        "lat": { "type": "number", "example": 10.12345 },
                        "lng": { "type": "number", "example": 76.54321 }
                      }
                    },
                    "type": { "type": "string", "example": "rescue" },
                    "priority": { "type": "string", "example": "high" },
                    "peopleCount": { "type": "integer", "example": 4 },
                    "description": { "type": "string", "example": "Water levels rising. Need immediate rescue boat." }
                  }
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Request created successfully."
            }
          }
        }
      },
      "/incidents": {
        "get": {
          "summary": "List Incidents",
          "description": "Retrieve all live active incidents, flooded roads, closed bridges, blockages, and bypass routes.",
          "responses": {
            "200": {
              "description": "Array of incidents returned successfully."
            }
          }
        },
        "post": {
          "summary": "Report Incident / Add to Cluster",
          "description": "Post a new user report. If there is an existing active incident of the same type within 500 meters, it automatically clusters them into a single incident to avoid card clutter.",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": ["latitude", "longitude", "severity", "type", "roadName", "landmark", "district"],
                  "properties": {
                    "latitude": { "type": "number", "example": 10.0245 },
                    "longitude": { "type": "number", "example": 76.3122 },
                    "severity": { "type": "string", "example": "WATERLOGGED" },
                    "type": { "type": "string", "example": "Flooded Road" },
                    "roadName": { "type": "string", "example": "Seaport-Airport Rd" },
                    "landmark": { "type": "string", "example": "Near Signal Junction" },
                    "district": { "type": "string", "example": "ernakulam" },
                    "notes": { "type": "string", "example": "Water levels around 1 foot." },
                    "reporter": { "type": "string", "example": "Citizen Reporter" },
                    "photos": { "type": "array", "items": { "type": "string" } }
                  }
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "Incident reported successfully."
            }
          }
        }
      },
      "/incidents/{id}": {
        "patch": {
          "summary": "Update Incident details",
          "description": "Modify incident properties. Restricted to authenticated volunteers or admin users.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": { "type": "string" }
            }
          ],
          "responses": {
            "200": { "description": "Successfully updated." },
            "401": { "description": "Authentication required." }
          }
        },
        "delete": {
          "summary": "Archive / Delete Incident",
          "description": "Permanently archive or remove an incident. Requires moderator/admin login.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": { "type": "string" }
            }
          ],
          "responses": {
            "200": { "description": "Deleted." }
          }
        }
      },
      "/incidents/{id}/verify": {
        "post": {
          "summary": "Submit Verification Vote",
          "description": "Allow community members or verified volunteers to vote on whether an incident is still flooded, rising, receding, cleared, or a false report.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": { "type": "string" }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": ["vote", "reporter"],
                  "properties": {
                    "vote": { "type": "string", "example": "water-receding" },
                    "reporter": { "type": "string", "example": "volunteer-john" }
                  }
                }
              }
            }
          },
          "responses": {
            "200": { "description": "Vote counted." }
          }
        }
      },
      "/reports": {
        "get": { "summary": "Deprecated raw reports list", "deprecated": true, "responses": { "410": { "description": "Deprecated." } } },
        "post": { "summary": "Deprecated raw report submit", "deprecated": true, "responses": { "410": { "description": "Deprecated." } } },
        "delete": { "summary": "Deprecated raw report clear", "deprecated": true, "responses": { "410": { "description": "Deprecated." } } }
      },
      "/reports/{id}": {
        "put": {
          "summary": "Edit raw user report",
          "description": "Updates specific notes or severity metrics. Guests can edit their own submissions for up to 5 minutes using their ownership token.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": { "type": "string" }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "notes": { "type": "string" },
                    "severity": { "type": "string" },
                    "ownershipToken": { "type": "string" }
                  }
                }
              }
            }
          },
          "responses": {
            "200": { "description": "Report edited." }
          }
        },
        "delete": {
          "summary": "Delete raw user report",
          "description": "Removes a specific user report from incident cluster.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "schema": { "type": "string" }
            },
            {
              "name": "token",
              "in": "query",
              "required": false,
              "description": "Guest ownership token for verification",
              "schema": { "type": "string" }
            }
          ],
          "responses": {
            "200": { "description": "Report deleted." }
          }
        }
      },
      "/route-plan": {
        "post": {
          "summary": "Calculate alternate routes",
          "description": "Interrogates the OSRM Routing Machine to compute routes, avoiding coordinates marked as blocked or impassable by live flood reports.",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": ["origin", "destination"],
                  "properties": {
                    "origin": {
                      "type": "object",
                      "properties": {
                        "lat": { "type": "number", "example": 10.0245 },
                        "lng": { "type": "number", "example": 76.3122 }
                      }
                    },
                    "destination": {
                      "type": "object",
                      "properties": {
                        "lat": { "type": "number", "example": 10.1235 },
                        "lng": { "type": "number", "example": 76.5432 }
                      }
                    }
                  }
                }
              }
            }
          },
          "responses": {
            "200": { "description": "Alternative safe routes resolved." }
          }
        }
      }
    }
  };

  return NextResponse.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    }
  });
}
