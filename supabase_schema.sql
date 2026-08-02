-- Drop legacy tables if they exist
drop table if exists public.flood_reports cascade;

-- Create incidents table
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null check (status in ('active', 'receding', 'resolved', 'archived')),
  severity text not null check (severity in ('SAFE', 'WATERLOGGED', 'KNEE_DEEP', 'WAIST_DEEP', 'NOT_PASSABLE')),
  road_name text not null,
  landmark text not null,
  district text not null,
  latitude double precision not null,
  longitude double precision not null,
  confidence integer default 0 check (confidence between 0 and 100),
  elevation_meters double precision,
  flood_start_lat double precision,
  flood_start_lng double precision,
  flood_end_lat double precision,
  flood_end_lng double precision,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz,
  last_verified_at timestamptz,
  last_report_at timestamptz,
  archived_at timestamptz,
  needs_verification boolean default false
);

-- Create incident_reports table
create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  severity text not null check (severity in ('SAFE', 'WATERLOGGED', 'KNEE_DEEP', 'WAIST_DEEP', 'NOT_PASSABLE')),
  notes text,
  reporter text default 'Community reporter',
  created_at timestamptz default now(),
  ownership_token text,
  is_guest_report boolean default false,
  reporter_id text,
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Create incident_images table
create table if not exists public.incident_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.incident_reports(id) on delete cascade,
  image_url text not null,
  created_at timestamptz default now()
);

-- Create incident_verifications table
create table if not exists public.incident_verifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  reporter text default 'Community verifier',
  vote text not null check (vote in ('still-flooded', 'water-rising', 'water-receding', 'road-cleared', 'false-report')),
  created_at timestamptz default now()
);

-- Create audit_logs table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  user_id text,
  action text not null check (action in ('Create', 'Update', 'Delete', 'Verify', 'Resolve', 'Archive')),
  target_table text not null,
  target_id uuid not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_incidents_lat_lng on public.incidents(latitude, longitude);
create index if not exists idx_incidents_status on public.incidents(status);
create index if not exists idx_incident_reports_incident_id on public.incident_reports(incident_id);
create index if not exists idx_incident_images_report_id on public.incident_images(report_id);
create index if not exists idx_incident_verifications_incident_id on public.incident_verifications(incident_id);
create index if not exists idx_audit_logs_incident_id on public.audit_logs(incident_id);

-- Enable RLS
alter table public.incidents enable row level security;
alter table public.incident_reports enable row level security;
alter table public.incident_images enable row level security;
alter table public.incident_verifications enable row level security;
alter table public.audit_logs enable row level security;

-- Policies for public read
create policy "Allow public read access for incidents" on public.incidents for select using (true);
create policy "Allow public read access for reports" on public.incident_reports for select using (true);
create policy "Allow public read access for images" on public.incident_images for select using (true);
create policy "Allow public read access for verifications" on public.incident_verifications for select using (true);
create policy "Allow public read access for audit_logs" on public.audit_logs for select using (true);

-- Policies for insert and updates (allowing all for public/anonymous MVP writes)
create policy "Allow public insert for incidents" on public.incidents for insert with check (true);
create policy "Allow public update for incidents" on public.incidents for update using (true);
create policy "Allow public insert for reports" on public.incident_reports for insert with check (true);
create policy "Allow public update for reports" on public.incident_reports for update using (true);
create policy "Allow public insert for images" on public.incident_images for insert with check (true);
create policy "Allow public insert for verifications" on public.incident_verifications for insert with check (true);
create policy "Allow public insert for audit_logs" on public.audit_logs for insert with check (true);

-- Grant usage on public schema to PostgREST roles
grant usage on schema public to anon, authenticated;

-- Grant select, insert, and update privileges on incidents tables
grant select, insert, update on public.incidents to anon, authenticated;
grant select, insert, update on public.incident_reports to anon, authenticated;
grant select, insert, update on public.incident_images to anon, authenticated;
grant select, insert, update on public.incident_verifications to anon, authenticated;
grant select, insert, update on public.audit_logs to anon, authenticated;

-- Grant sequence privileges for autogenerated IDs
grant all on all sequences in schema public to anon, authenticated;
