# Vellam Undo - Supabase Integration Documentation

This document explains in detail every component, API, and hook in **Vellam Undo** that utilizes **Supabase**.

---

## 1. Authentication (Supabase Auth)

Supabase Auth is used to identify users, distinguish community reporters from verified responders, and protect verification voting actions against spam.

*   **Integration File**: [useAuth.ts](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/src/hooks/useAuth.ts)
*   **UI Components**: [AuthModal.tsx](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/src/components/AuthModal.tsx) and [home-client.tsx](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/src/app/home-client.tsx)

### Key Workflows:
1.  **Session Bootstrap**: Checks if a valid user session exists on app load using `supabase.auth.getSession()`.
2.  **Auth State Listener**: Sets up a listener via `supabase.auth.onAuthStateChange()` to automatically update the frontend state when a user signs in or out.
3.  **Google OAuth Login**: Directs users to Google's login interface via:
    ```typescript
    supabase.auth.signInWithOAuth({ provider: "google" })
    ```
4.  **Security Trust Badges**: When users verify reports, the database stores their user ID. The UI displays a **"✓ Verified"** checkmark if a report has been confirmed by real, authenticated users.

---

## 2. Relational Database (Supabase DB / PostgreSQL)

Every live feature in the app queries or saves data into the relational database. The schema is defined in [supabase_schema.sql](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/supabase_schema.sql).

### Database Tables:
*   `incidents`: Parent records containing hazard locations (lat/lng), overall status (`active`, `resolved`), overall severity, and computed trust confidence.
*   `incident_reports`: Individual submissions (notes, reporter labels) linked to parent incidents.
*   `incident_images`: Image URLs associated with reports.
*   `incident_verifications`: Vote entries (`still-flooded`, `road-cleared`) linked to parent incidents.

### Key API integrations:
1.  **Incident Feeds**: GET `/api/incidents` queries PostgreSQL using relational joins:
    ```typescript
    supabase.from("incidents").select("*, incident_reports(*, incident_images(*)), incident_verifications(*)")
    ```
2.  **Report Submissions & Duplicate Clustering**: POST `/api/incidents` checks for nearby active reports within 500 meters using coordinate ranges. If a match is found, it automatically merges the report under the existing parent incident and recalculates overall severity and confidence levels.
3.  **Safety Route Auditing**: GET `/api/route-plan` queries the database for active hazard markers during route calculations. It checks if the route crosses any incidents, identifies blocked roads, and computes safety scores (0-100% health).
4.  **Analytics dashboard**: GET `/api/analytics` computes summaries directly from rows.

---

## 3. Evidence Storage (Supabase Storage)

Supabase Storage is utilized to host photos uploaded by community members when reporting hazards.

*   **Integration Files**: [imageUpload.ts](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/src/lib/imageUpload.ts) and [ReportPanel.tsx](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/src/components/ReportPanel.tsx)
*   **Bucket Name**: `incident-images` (Public access enabled)

### Key Workflows:
1.  **Image Compression**: Frontend uses an HTML Canvas to downscale and compress images to under `200KB` to save bandwidth.
2.  **Binary Upload**: Uploads the raw file directly to the cloud storage bucket:
    ```typescript
    supabase.storage.from("incident-images").upload(filePath, file)
    ```
3.  **Public URL Retrieval**: Generates a public link and stores it as a reference in the `incident_images` database table.

---

## 4. Real-time Synchronization (Supabase Realtime)

To ensure different users looking at the map see new reports and safety warnings immediately without refreshing their browsers, the app implements real-time WebSockets listeners.

*   **Integration File**: [useEmergencyStore.ts](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/src/hooks/useEmergencyStore.ts#L145-L170)

### Key Workflow:
A listener channel is created on mount to listen to database inserts, updates, and deletes across all tables:
```typescript
const channel = supabase
  .channel("realtime-emergency-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, fetchIncidents)
  .on("postgres_changes", { event: "*", schema: "public", table: "incident_reports" }, fetchIncidents)
  .on("postgres_changes", { event: "*", schema: "public", table: "incident_verifications" }, fetchIncidents)
  .on("postgres_changes", { event: "*", schema: "public", table: "incident_images" }, fetchIncidents)
  .subscribe();
```
*Whenever another client submits a report or verification vote, your browser receives the event and instantly updates the route plans and map markers.*
