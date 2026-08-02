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

---

## 5. Future Extension: How to Build New Supabase-Backed Services

When creating new features (e.g. a "Relief Centers Booking System" or "Volunteer Coordination Panel"), follow this end-to-end checklist:

### Step 1: Create the PostgreSQL Migration
1.  Generate a new local migration file using the Supabase CLI:
    ```bash
    npx supabase migration new add_my_new_service_table
    ```
2.  Open the newly created `.sql` file in `supabase/migrations/` and write your schema:
    ```sql
    -- 1. Create your table
    create table public.volunteer_assignments (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      phone text not null,
      status text not null default 'pending',
      created_at timestamptz default now()
    );

    -- 2. Enable Row Level Security (RLS)
    alter table public.volunteer_assignments enable row level security;

    -- 3. Create RLS Policies
    create policy "Allow public reads" on public.volunteer_assignments for select using (true);
    create policy "Allow public inserts" on public.volunteer_assignments for insert with check (true);

    -- 4. Grant postgREST permissions (Crucial! Avoids "permission denied" error)
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.volunteer_assignments to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
    ```

### Step 2: Apply Schema Locally
Reset your local PostgreSQL instance to execute the new migrations:
```bash
npm run db:reset
```

### Step 3: Define TypeScript Types
Open [types.ts](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/src/lib/types.ts) and add the interface matching your database structure:
```typescript
export interface VolunteerAssignment {
  id: string;
  name: string;
  phone: string;
  status: 'pending' | 'active' | 'completed';
  createdAt: string;
}
```

### Step 4: Write Next.js API Routes
Create a new Next.js route handler in `src/app/api/volunteers/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!supabase) {
    // Return mock fallback data if Supabase URL/key isn't configured
    return NextResponse.json({ volunteers: [] });
  }

  const { data, error } = await supabase
    .from("volunteer_assignments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ volunteers: data });
}
```

### Step 5: Listen to Realtime Events (Optional)
If your new UI component needs to receive instant updates when other users write to your new table, add a listener in your React hooks:
```typescript
useEffect(() => {
  if (!supabase) return;

  const channel = supabase
    .channel("realtime-volunteers-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "volunteer_assignments" }, fetchVolunteers)
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, []);
```

### Step 6: Deploy Changes to Cloud Production
Once verified locally, push your new table schema, indexes, and policy permissions directly to your cloud project:
```bash
npx supabase db push
```

