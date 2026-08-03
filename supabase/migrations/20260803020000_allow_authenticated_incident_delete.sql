grant delete on public.incidents to authenticated;

drop policy if exists "Allow authenticated delete for incidents" on public.incidents;

create policy "Allow authenticated delete for incidents"
on public.incidents
for delete
to authenticated
using (true);
