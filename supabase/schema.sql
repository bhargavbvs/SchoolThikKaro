-- supabase/schema.sql  — idempotent, safe to re-run.

create table if not exists schools (
  udise_code text primary key,
  name text not null,
  state text not null,
  district text not null,
  block text,
  lat double precision,
  lng double precision,
  indicator text not null check (indicator in ('no_girls_toilet','girls_toilet_nonfunctional')),
  source_year text not null default 'UDISE+ 2024-25',
  category text,
  management text
);
create index if not exists schools_state_idx on schools (state);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  udise_code text not null,
  school_name_snapshot text not null,
  -- What the report is about. The published figures stay girls' toilets
  -- only, because that is what UDISE+ measures — but a school fails its
  -- students in more ways than one, and a citizen may report any of them.
  category text not null default 'girls_toilet' check (category in
    ('girls_toilet','boys_toilet','drinking_water','handwashing','electricity',
     'classroom','boundary_wall','ramp','playground','other')),
  finding text not null check (finding in
    ('absent','broken','locked','no_water','inadequate','working')),
  severity text check (severity in ('usable','barely_usable','unusable','absent')),
  note text,
  tier text not null default 'unverified' check (tier in ('verified','unverified')),
  lat double precision,
  lng double precision,
  distance_m double precision,
  gps_accuracy_m double precision,
  captured_at timestamptz,
  image_path text not null,
  blur_applied boolean not null default false,
  faces_found integer not null default 0,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists reports_school_idx on reports (udise_code, review_status);
-- Column added after the table already shipped once — CREATE TABLE IF NOT
-- EXISTS above won't retrofit an existing table, so this makes the file
-- safe to re-run against a database created before faces_found existed.
alter table reports add column if not exists faces_found integer not null default 0;

-- Schools a citizen says exist that the UDISE+ release does not list.
--
-- A SEPARATE table, deliberately, not a nullable udise_code on reports.
-- Every figure this site publishes is the government's own record, and
-- that is the whole basis on which it can be trusted. A citizen-submitted
-- school has no UDISE code, no government record and no independent
-- corroboration, so it must be structurally impossible for one to be
-- counted in those figures. Different table, different query, no accident
-- can merge them.
create table if not exists school_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_name text not null,
  submitted_area text not null,
  submitted_district text,
  submitted_state text,
  udise_code text,                 -- optional: only if the reporter knows it
  category text not null default 'girls_toilet' check (category in
    ('girls_toilet','boys_toilet','drinking_water','handwashing','electricity',
     'classroom','boundary_wall','ramp','playground','other')),
  finding text not null check (finding in
    ('absent','broken','locked','no_water','inadequate','working')),
  severity text check (severity in ('usable','barely_usable','unusable','absent')),
  note text,
  -- No 'verified' tier is possible here: there is no recorded location to
  -- check the reporter's fix against. See computeTier in src/submit/gps.js.
  tier text not null default 'unverified' check (tier = 'unverified'),
  lat double precision,
  lng double precision,
  gps_accuracy_m double precision,
  captured_at timestamptz,
  image_path text not null,
  blur_applied boolean not null default false,
  faces_found integer not null default 0,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists school_submissions_status_idx
  on school_submissions (review_status, created_at desc);

-- Reporting widened beyond girls' toilets after both tables had already
-- shipped. CREATE TABLE IF NOT EXISTS above cannot retrofit an existing
-- table, so these make this file safe to re-run against either shape.
-- Existing rows predate categories and were all toilet reports, which is
-- what the default records.
-- A school can be short of a toilet AND of drinking water. Reporting that
-- as two submissions loses the fact that it is one school in one state, so
-- `categories` holds the whole set. `category` stays as the first of them:
-- it is what every index and filter already reads, and keeping it in step
-- costs one array subscript.
do $$
declare t text;
begin
  foreach t in array array['reports','school_submissions'] loop
    execute format('alter table %I add column if not exists categories text[] not null default ''{}''', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_categories_check');
    execute format($f$alter table %I add constraint %I check (
      categories <@ ARRAY['girls_toilet','boys_toilet','drinking_water','handwashing',
        'electricity','classroom','boundary_wall','ramp','playground','other']::text[])$f$,
      t, t || '_categories_check');
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['reports','school_submissions'] loop
    execute format('alter table %I add column if not exists category text not null default %L', t, 'girls_toilet');
    execute format('alter table %I add column if not exists note text', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_category_check');
    execute format('alter table %I add constraint %I check (category in (%s))', t, t || '_category_check',
      '''girls_toilet'',''boys_toilet'',''drinking_water'',''handwashing'',''electricity'',''classroom'',''boundary_wall'',''ramp'',''playground'',''other''');
    execute format('alter table %I drop constraint if exists %I', t, t || '_finding_check');
    execute format('alter table %I add constraint %I check (finding in (%s))', t, t || '_finding_check',
      '''absent'',''broken'',''locked'',''no_water'',''inadequate'',''working''');
  end loop;
end $$;

create table if not exists fixes (
  id uuid primary key default gen_random_uuid(),
  udise_code text not null,
  note text,
  image_path text,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  udise_code text not null,
  reason text not null,
  contact text,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists moderators (
  email text primary key,
  role text not null default 'moderator' check (role in ('moderator','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  target_table text not null,
  target_id text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table schools   enable row level security;
alter table reports   enable row level security;
alter table school_submissions enable row level security;
alter table fixes     enable row level security;
alter table disputes  enable row level security;
alter table moderators enable row level security;
alter table audit_log enable row level security;

drop policy if exists schools_public_read on schools;
create policy schools_public_read on schools for select to anon using (true);

-- anon may READ approved only. anon may NOT insert: submissions go through
-- the submit-report Edge Function, which writes with the service key.
drop policy if exists reports_public_read_approved on reports;
create policy reports_public_read_approved on reports
  for select to anon using (review_status = 'approved');

-- Same shape as reports: anon reads approved only, and cannot insert at
-- all — submissions go through the submit-report Edge Function, which
-- enforces the rate limit, the size cap and the unblurred-photo refusal
-- with the service key.
drop policy if exists school_submissions_public_read_approved on school_submissions;
create policy school_submissions_public_read_approved on school_submissions
  for select to anon using (review_status = 'approved');

drop policy if exists fixes_public_read_approved on fixes;
create policy fixes_public_read_approved on fixes
  for select to anon using (review_status = 'approved');

drop policy if exists disputes_public_read_approved on disputes;
create policy disputes_public_read_approved on disputes
  for select to anon using (review_status = 'approved');

-- moderators and audit_log: no anon policy at all => denied by default.

-- Fixes and disputes are lower-stakes than reports (no minors in frame by
-- design, no rate-limit-sensitive photo pipeline), so — unlike reports —
-- anon may insert directly rather than going through an Edge Function.
drop policy if exists fixes_public_insert_pending on fixes;
create policy fixes_public_insert_pending on fixes
  for insert to anon with check (review_status = 'pending');

drop policy if exists disputes_public_insert_pending on disputes;
create policy disputes_public_insert_pending on disputes
  for insert to anon with check (review_status = 'pending');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shaala-photos','shaala-photos', true, 3145728,
        array['image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Public may READ photos. Public may NOT write to the report-photo path:
-- the submit-report Edge Function uploads those with the service key.
drop policy if exists shaala_photos_public_read on storage.objects;
create policy shaala_photos_public_read on storage.objects
  for select to anon using (bucket_id = 'shaala-photos');

-- Fix-evidence photos ARE written directly by anon, but only under the
-- fixes/ path prefix — the report-photo path stays Edge-Function-only.
drop policy if exists shaala_photos_fixes_insert on storage.objects;
create policy shaala_photos_fixes_insert on storage.objects
  for insert to anon
  with check (bucket_id = 'shaala-photos' and (storage.foldername(name))[1] = 'fixes');

-- Moderators (Plan B Task 8): read every pending report and act on it.
-- Without these, the admin console has no query it's allowed to run.
drop policy if exists reports_moderator_read_all on reports;
create policy reports_moderator_read_all on reports for select to authenticated
  using (exists (select 1 from moderators m
                 where m.email = auth.jwt() ->> 'email' and m.active));

drop policy if exists reports_moderator_update on reports;
create policy reports_moderator_update on reports for update to authenticated
  using (exists (select 1 from moderators m
                 where m.email = auth.jwt() ->> 'email' and m.active))
  with check (true);

drop policy if exists school_submissions_moderator_read_all on school_submissions;
create policy school_submissions_moderator_read_all on school_submissions
  for select to authenticated
  using (exists (select 1 from moderators m
                 where m.email = auth.jwt() ->> 'email' and m.active));

drop policy if exists school_submissions_moderator_update on school_submissions;
create policy school_submissions_moderator_update on school_submissions
  for update to authenticated
  using (exists (select 1 from moderators m
                 where m.email = auth.jwt() ->> 'email' and m.active))
  with check (true);

drop policy if exists audit_insert_moderator on audit_log;
create policy audit_insert_moderator on audit_log for insert to authenticated
  with check (exists (select 1 from moderators m
                      where m.email = auth.jwt() ->> 'email' and m.active));
