-- ================================================================
-- Migration 002 — admin_activity audit log
--
-- Append-only feed of every admin write (create / update / delete /
-- bulk / reorder / upload). Powers the new admin dashboard activity
-- feed and the per-entity "modifiés récemment" mini-list.
--
-- Idempotent (`create if not exists`). À exécuter UNE FOIS dans
-- Supabase Studio → SQL Editor.
-- ================================================================

create table if not exists public.admin_activity (
  id            bigserial    primary key,
  created_at    timestamptz  not null default now(),
  actor         text         not null default 'admin',
  -- "promo" | "produit" | "media" | "import" | "auth" (extensible).
  entity        text         not null,
  -- For promos / produits : the row uuid. For media : the storage path.
  entity_id     text,
  -- Short human label (e.g. promo titre, produit nom, media filename)
  -- captured at write-time so the feed stays readable even after
  -- deletes. Stored as plain text rather than a join.
  entity_label  text,
  -- "create" | "update" | "delete" | "bulk" | "reorder" | "upload" | "import"
  action        text         not null,
  -- Free-form JSON payload. Patches stored as { before, after } when
  -- it makes sense, single ids/lists otherwise. Capped at ~16 KB by
  -- the helper (see src/lib/admin-activity.ts).
  payload       jsonb        default '{}'::jsonb
);

create index if not exists idx_admin_activity_created
  on public.admin_activity(created_at desc);

create index if not exists idx_admin_activity_entity
  on public.admin_activity(entity, created_at desc);

create index if not exists idx_admin_activity_entity_id
  on public.admin_activity(entity, entity_id);

-- RLS : table d'audit privée. Seule la service_role key peut lire/écrire.
alter table public.admin_activity enable row level security;

drop policy if exists "no public access admin_activity" on public.admin_activity;
-- Pas de policy = aucune lecture/écriture via anon key.
-- L'admin (service_role) bypasse RLS automatiquement.

comment on table public.admin_activity is
  'Audit log append-only des écritures côté /admin. Lecture = service_role uniquement.';
comment on column public.admin_activity.payload is
  'Snapshot JSON de l''opération. Tronqué à ~16 KB côté API pour éviter les blobs.';
