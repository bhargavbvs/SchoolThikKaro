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
  finding text not null check (finding in
    ('no_toilet','locked','no_water','unusable','working')),
  severity text check (severity in ('usable','barely_usable','unusable','absent')),
  tier text not null default 'unverified' check (tier in ('verified','unverified')),
  lat double precision,
  lng double precision,
  distance_m double precision,
  gps_accuracy_m double precision,
  captured_at timestamptz,
  image_path text not null,
  blur_applied boolean not null default false,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists reports_school_idx on reports (udise_code, review_status);

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

drop policy if exists fixes_public_read_approved on fixes;
create policy fixes_public_read_approved on fixes
  for select to anon using (review_status = 'approved');

drop policy if exists disputes_public_read_approved on disputes;
create policy disputes_public_read_approved on disputes
  for select to anon using (review_status = 'approved');

-- moderators and audit_log: no anon policy at all => denied by default.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shaala-photos','shaala-photos', true, 3145728,
        array['image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Public may READ photos. Public may NOT write: the Edge Function uploads.
drop policy if exists shaala_photos_public_read on storage.objects;
create policy shaala_photos_public_read on storage.objects
  for select to anon using (bucket_id = 'shaala-photos');
