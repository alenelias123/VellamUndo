# Vellam Undo - Database Configuration & Cloud Migration Guide

This guide details the database architecture of **Vellam Undo** and provides step-by-step instructions to run a local database environment and deploy it to a live cloud production environment.

---

## 1. Local Supabase Docker Environment

Running Supabase locally using Docker provides a local PostgreSQL database, local AWS S3-compatible file storage, and Supabase Studio dashboard.

### Prerequisites
You must have **Docker Desktop** installed and running on your system:
*   [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

### Step-by-Step Connection Instructions

#### Step 1: Start the Local Stack
Open a standard command prompt or powershell on your computer and run:
```bash
npm run db:start
```
*This command pulls the required services from Docker registries and initializes the database.*

#### Step 2: Grab the Local Credentials
Once the start command is complete, retrieve the anon credentials by running:
```bash
npx supabase status
```
Look for the output block. You will need:
*   **API URL**: (Usually `http://127.0.0.1:54321`)
*   **anon key**: (The long publishable token)

#### Step 3: Populate Your Environment Variables
Open the [.env.local](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/.env.local) file in your editor and enter the copied values:
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_copied_anon_key_here
```
*Restart your Next.js server (`npm run dev`) so that the application reloads the configurations.*

#### Step 4: Access Local Dashboard Studio
You can view database tables, inspect columns, and view uploaded files via a local dashboard:
*   **URL**: [http://localhost:54323](http://localhost:54323)

---

### Key Local Commands

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run db:start` | Starts PostgreSQL & Studio | Pushes background services to Docker |
| `npm run db:stop` | Pauses containers | Keeps data intact but shuts down VM |
| `npm run db:reset` | Wipes and recreates DB | Runs migrations from scratch |

---
---

## 2. Cloud Supabase Migration Guide

When you are ready to launch **Vellam Undo** for public use, you must migrate the local schema and storage configurations to a live, cloud-hosted Supabase project.

---

### Method A: Automated CLI Migration (Recommended)

This method links your local command-line project directly to the cloud and pushes migrations.

#### Step 1: Create a Cloud Project
1.  Go to [Supabase Cloud Console](https://supabase.com).
2.  Sign in and click **New Project**.
3.  Name your project (e.g. `Vellam Undo`), set a secure database password, choose your regional server (e.g., *Mumbai (ap-south-1)* for India), and click **Create**.
4.  Copy your **Project Reference ID** (found in your project settings URL: `https://supabase.com/dashboard/project/YOUR-PROJECT-REF`).

#### Step 2: Link Your Local CLI to the Cloud
In your terminal, link the folder to your cloud project using your Project Reference ID:
```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
```
*You will be prompted to enter the database password you set in Step 1.*

#### Step 3: Push the Schema Migration to Cloud
Apply all database tables, indexes, check constraints, and RLS policies to the cloud database:
```bash
npx supabase db push
```
*This executes your local migration scripts in `supabase/migrations/*` onto your live database.*

---

### Method B: Manual Dashboard Migration

If you do not want to use the CLI, you can apply configurations manually in the browser.

#### Step 1: Execute SQL Schema
1.  Open the [supabase_schema.sql](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/supabase_schema.sql) file in your project.
2.  Copy all SQL code.
3.  Go to your cloud dashboard, navigate to **SQL Editor** in the left sidebar, click **New Query**, paste the code, and click **Run**.
    *This creates the `incidents`, `incident_reports`, `incident_images`, and `incident_verifications` tables, and enables security RLS.*

#### Step 2: Configure Storage Bucket
1.  In your cloud dashboard, go to the **Storage** page from the sidebar.
2.  Click **New Bucket**.
3.  Name the bucket exactly: `incident-images`.
4.  Toggle the **Public Bucket** switch to **ON** (allows anyone to view reports images).
5.  Click **Save**.

#### Step 3: Enable Storage Upload Policies
For community members to upload photos, you must grant upload permissions:
1.  On the **Storage** page, click the **Policies** tab.
2.  Find the `incident-images` bucket.
3.  Click **New Policy** -> **For full customization**.
4.  Add the **Select (Read)** Policy:
    *   **Name**: `Allow public reads`
    *   **Allowed Operations**: Check `SELECT`.
    *   **Target Roles**: `public`.
    *   Click **Review** and **Save**.
5.  Click **New Policy** -> **For full customization** again. Add the **Insert (Write)** Policy:
    *   **Name**: `Allow public inserts`
    *   **Allowed Operations**: Check `INSERT`.
    *   **Target Roles**: `public`.
    *   Click **Review** and **Save**.

---

### Connecting Your Web Application to Cloud

Once the cloud database is running:
1.  Obtain your live URL and keys from your cloud console under **Settings** -> **API**:
    *   `Project URL` (e.g. `https://abcxyz.supabase.co`)
    *   `anon/public` key (e.g. `eyJhbGciOi...`)
2.  Update your application environment variables:
    *   For local testing with cloud backend: update [.env.local](file:///c:/Users/amith/vellam.undo/vellom.undo.repo/VellamUndo/.env.local).
    *   For production hosting (Vercel, Netlify): go to your hosting dashboard settings and add these values to the **Environment Variables** panel:
        *   `NEXT_PUBLIC_SUPABASE_URL` = `https://YOUR-PROJECT-REF.supabase.co`
        *   `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `YOUR_CLOUD_PUBLIC_ANON_KEY`

---

## 3. Latest Schema Additions (MVP Enhancements)

The database schema has been upgraded to support advanced reporting trust, guest ownership limits, and detailed system auditing.

### Schema Updates:

#### 1. `incidents` Table additions:
*   `last_verified_at` (timestamptz): Tracks when the last consensus verification vote occurred.
*   `last_report_at` (timestamptz): Tracks when the last report was attached to the incident.
*   `archived_at` (timestamptz): Populated when an incident is archived due to inactivity (>48h).
*   `needs_verification` (boolean): Flag set automatically when an active incident has no report updates or verifications for 24h.

#### 2. `incident_reports` Table additions:
*   `ownership_token` (uuid): A unique token generated for guest reporters, valid for a 5-minute edit/delete window.
*   `is_guest_report` (boolean): Flag denoting whether the reporter was an unauthenticated guest.
*   `reporter_id` (uuid, FK): Points to `auth.users` for authenticated user actions.
*   `updated_at` (timestamptz): Tracks report edits.
*   `deleted_at` (timestamptz): Supports soft-deleting reports.

#### 3. `audit_logs` Table (NEW):
Used to track system operations and moderator interventions.
*   `id` (uuid, Primary Key)
*   `incident_id` (uuid, FK to `incidents`)
*   `user_id` (text): Tracks who performed the action (Guest, system username, or authenticator email).
*   `action` (text): Operational action (`Create`, `Update`, `Delete`, `Verify`, `Resolve`, `Archive`).
*   `target_table` (text): Name of the affected table.
*   `target_id` (uuid): The ID of the row affected.
*   `previous_value` (jsonb): JSON state representation prior to the change.
*   `new_value` (jsonb): JSON state representation after the change.
*   `created_at` (timestamptz)
