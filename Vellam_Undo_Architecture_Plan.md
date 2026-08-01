# Vellam Undo -- Architecture Plan (Inspired by GasUndo)

> **Note:** We are **not copying GasUndo**. We are reusing its
> architecture and replacing the business logic with a flood emergency
> platform for Kerala.

------------------------------------------------------------------------

# Project Goal

**Vellam Undo?** is a real-time community-driven flood information
platform that helps people:

-   Report flooded roads
-   Check road conditions
-   Find safer routes
-   Request emergency help
-   Locate relief camps
-   Verify community reports

------------------------------------------------------------------------

# Architecture

``` text
                Users
                   │
         Report Flood / Help
                   │
                   ▼
          Next.js 16 + React 19
                   │
──────────────────────────────────
        API Routes (Server)
──────────────────────────────────
       │         │          │
       ▼         ▼          ▼
 Supabase   OpenStreetMap   Realtime
 Database      + Routing
```

------------------------------------------------------------------------

# Technology Stack

## Frontend

-   Next.js 16 (App Router)
-   React 19
-   Tailwind CSS
-   React Leaflet

## Backend

-   Next.js API Routes

## Database

-   Supabase PostgreSQL

## Maps

-   OpenStreetMap
-   React Leaflet

## Routing

-   OpenRouteService

## Realtime

-   Supabase Realtime

## Storage

-   Supabase Storage

------------------------------------------------------------------------

# Mapping GasUndo → Vellam Undo

  GasUndo                   Vellam Undo
  ------------------------- --------------------------
  Restaurant                Road / Flood Location
  Restaurant Status         Flood Severity
  Restaurant Comment        Flood Updates
  Restaurant Confirmation   Community Verification
  Restaurant Catalog        Kerala Roads & Locations
  Open / Closed             Safe / Flooded
  Analytics                 Flood Analytics

------------------------------------------------------------------------

# Folder Structure

``` text
src/
 ├── app/
 │    ├── page.tsx
 │    ├── home-client.tsx
 │    └── layout.tsx
 │
 ├── components/
 │
 ├── lib/
 │    ├── floodReports.ts
 │    ├── roads.ts
 │    ├── helpRequests.ts
 │    ├── reliefCenters.ts
 │    ├── routing.ts
 │    ├── districts.ts
 │    ├── realtime.ts
 │    └── analytics.ts
 │
 ├── api/
 └── hooks/
```

------------------------------------------------------------------------

# Main Features

## Flood Map

-   Live flood reports
-   Color-coded road status
-   Flood photos
-   Report timestamps

## Flood Reporting

Users can submit: - GPS location - Road name - Water level - Photo -
Description

## Road Status

-   Safe
-   Waterlogged
-   Knee Deep
-   Waist Deep
-   Not Passable

## Safe Route

-   Source → Destination
-   Avoid flooded roads
-   Recommend safer routes

## Emergency Help

People can request: - Rescue - Food - Water - Medicine - Shelter -
Charging Point

## Volunteer Dashboard

-   Accept requests
-   Update status
-   Mark completed

## Relief Centers

-   Hospitals
-   Relief camps
-   Fire stations
-   Police stations

------------------------------------------------------------------------

# Database Tables

## flood_reports

``` text
id
latitude
longitude
road_name
water_level
status
image_url
created_by
created_at
```

## help_requests

``` text
id
location
type
priority
people_count
status
assigned_volunteer
```

## volunteers

``` text
id
name
phone
availability
vehicle
```

## relief_centers

``` text
id
name
location
type
contact
```

## confirmations

``` text
id
report_id
user_id
created_at
```

------------------------------------------------------------------------

# Home Screen

-   🗺️ Flood Map
-   📍 Report Flood
-   🚧 Road Status
-   🆘 Request Help
-   🏠 Relief Centers
-   🧭 Safe Route

------------------------------------------------------------------------

# Community Verification

Instead of admin approval:

-   Users confirm reports
-   Multiple confirmations increase confidence
-   False reports can be downvoted or flagged

------------------------------------------------------------------------

# Future Enhancements

-   SOS button
-   Live volunteer locations
-   Rainfall layer
-   Offline PWA support
-   Push notifications
-   Flood heatmap

------------------------------------------------------------------------

# Development Phases

## Phase 1

-   Interactive map
-   Flood reports
-   Road status
-   Relief centers
-   Emergency contacts

## Phase 2

-   Safe routing
-   Help requests
-   Volunteer dashboard
-   Community verification

## Phase 3

-   Analytics
-   Notifications
-   Offline support

------------------------------------------------------------------------

# Summary

GasUndo provides a proven architecture for: - Next.js - Supabase -
OpenStreetMap - Realtime updates - Rate limiting - Optimistic UI

Vellam Undo adapts that architecture for flood response by replacing
restaurant-related functionality with flood reporting, road safety,
emergency assistance, and community verification.
