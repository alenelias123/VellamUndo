-- Alter incidents table to add audit and state tracking columns
alter table public.incidents add column if not exists last_verified_at timestamptz;
alter table public.incidents add column if not exists last_report_at timestamptz;
alter table public.incidents add column if not exists archived_at timestamptz;
alter table public.incidents add column if not exists needs_verification boolean default false;

-- Alter incident_reports table to add guest token and soft-delete columns
alter table public.incident_reports add column if not exists ownership_token text;
alter table public.incident_reports add column if not exists is_guest_report boolean default false;
alter table public.incident_reports add column if not exists reporter_id text;
alter table public.incident_reports add column if not exists updated_at timestamptz default now();
alter table public.incident_reports add column if not exists deleted_at timestamptz;

-- Create audit_logs table to track modifications
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

-- Index for target references in audit log
create index if not exists idx_audit_logs_incident_id on public.audit_logs(incident_id);

-- Enable RLS for audit_logs
alter table public.audit_logs enable row level security;

-- Policies for public selects and inserts on audit_logs
create policy "Allow public read access for audit_logs" on public.audit_logs for select using (true);
create policy "Allow public insert for audit_logs" on public.audit_logs for insert with check (true);

-- Grant privileges to postgREST api gateways
grant select, insert, update on public.audit_logs to anon, authenticated;
grant select, insert, update on public.incidents to anon, authenticated;
grant select, insert, update on public.incident_reports to anon, authenticated;
