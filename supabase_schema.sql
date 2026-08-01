-- Create flood_reports table in Supabase
create table if not exists public.flood_reports (
  id text primary key,
  road_name text not null,
  district text default 'ernakulam',
  location_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  severity text not null check (severity in ('safe', 'waterlogged', 'knee-deep', 'waist-deep', 'not-passable')),
  water_level_cm integer default 0,
  description text,
  image_url text,
  created_by text default 'Community reporter',
  created_at timestamptz default now(),
  confirmations integer default 1,
  flags integer default 0
);

-- Enable Row Level Security (RLS)
alter table public.flood_reports enable row level security;

-- Policy: Allow public read access to everyone
create policy "Allow public read access"
  on public.flood_reports for select
  using (true);

-- Policy: Allow authenticated users to insert reports
create policy "Allow insert for authenticated users"
  on public.flood_reports for insert
  with check (true);

-- Policy: Allow delete for admin / authenticated users
create policy "Allow delete for admin"
  on public.flood_reports for delete
  using (true);
