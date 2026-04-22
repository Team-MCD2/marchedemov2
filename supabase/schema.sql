-- ================================================================
-- Marché de Mo' V2 — Schéma initial Supabase
--
-- À exécuter UNE SEULE FOIS dans Supabase Studio :
--   1. Ouvrir https://supabase.com/dashboard/project/rlqesmyifbqfbblttrhl
--   2. SQL Editor → New query
--   3. Coller ce fichier intégralement → Run
--
-- Ré-exécution safe (idempotent) : `create if not exists`, `drop policy if exists`.
-- ================================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";

-- ================================================================
-- PROMOS
-- ================================================================
create table if not exists public.promos (
  id              uuid         primary key default uuid_generate_v4(),
  slug            text         unique not null,
  titre           text         not null,
  description     text         default '',
  image_url       text,
  prix_original   numeric(10,2) not null,
  prix_promo      numeric(10,2) not null,
  reduction_pct   integer      not null check (reduction_pct between 0 and 99),
  rayon           text         not null check (rayon in (
                    'boucherie-halal','fruits-legumes','epices-du-monde',
                    'saveurs-afrique','saveurs-asie','saveur-mediterranee',
                    'saveur-sud-amer','balkans-turques','produits-courants','surgeles',
                    'boulangerie','produits-laitiers'
                  )),
  magasin         text         not null default 'tous'
                    check (magasin in ('tous','portet','toulouse-sud')),
  date_debut      date         not null,
  date_fin        date         not null,
  mise_en_avant   boolean      default false,
  actif           boolean      default true,
  ordre           integer      default 0,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create index if not exists idx_promos_actif   on public.promos(actif) where actif = true;
create index if not exists idx_promos_rayon   on public.promos(rayon);
create index if not exists idx_promos_magasin on public.promos(magasin);
create index if not exists idx_promos_ordre   on public.promos(ordre);

-- ================================================================
-- PRODUITS (vitrine catalogue — prix_indicatif optionnel)
-- ================================================================
create table if not exists public.produits (
  id              uuid         primary key default uuid_generate_v4(),
  slug            text         unique not null,
  nom             text         not null,
  description     text         default '',
  image_url       text,
  prix_indicatif  numeric(10,2),
  unite           text,
  rayon           text         not null check (rayon in (
                    'boucherie-halal','fruits-legumes','epices-du-monde',
                    'saveurs-afrique','saveurs-asie','saveur-mediterranee',
                    'saveur-sud-amer','balkans-turques','produits-courants','surgeles',
                    'boulangerie','produits-laitiers'
                  )),
  origine         text,
  badge           text,
  actif           boolean      default true,
  ordre           integer      default 0,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create index if not exists idx_produits_actif on public.produits(actif) where actif = true;
create index if not exists idx_produits_rayon on public.produits(rayon);
create index if not exists idx_produits_ordre on public.produits(ordre);

-- ================================================================
-- Trigger updated_at (touche les timestamps à chaque UPDATE)
-- ================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_promos_updated   on public.promos;
drop trigger if exists touch_produits_updated on public.produits;

create trigger touch_promos_updated   before update on public.promos
  for each row execute procedure public.touch_updated_at();
create trigger touch_produits_updated before update on public.produits
  for each row execute procedure public.touch_updated_at();

-- ================================================================
-- Row-Level Security (RLS)
-- ================================================================
alter table public.promos   enable row level security;
alter table public.produits enable row level security;

-- Lecture publique : uniquement les rows avec actif = true.
-- Le site public utilise la anon key et ne voit que les données publiées.
drop policy if exists "public read active promos"   on public.promos;
create policy "public read active promos" on public.promos
  for select using (actif = true);

drop policy if exists "public read active produits" on public.produits;
create policy "public read active produits" on public.produits
  for select using (actif = true);

-- Aucune policy INSERT / UPDATE / DELETE n'est définie.
-- Seule la service_role key (bypass RLS automatique) peut écrire.
-- L'admin /admin utilisera SUPABASE_SERVICE_ROLE_KEY côté serveur.

-- ================================================================
-- Storage : bucket public "medias" pour les images
-- ================================================================
-- Images promos/produits/rayons, tailles organisées par dossier :
--   medias/promos/<slug>.webp
--   medias/produits/<rayon>/<slug>.webp
--   medias/rayons/<slug>.webp
insert into storage.buckets (id, name, public)
values ('medias', 'medias', true)
on conflict (id) do nothing;

-- Lecture publique du bucket (par défaut Supabase).
-- L'écriture dans le bucket utilisera aussi la service_role key.

-- ================================================================
-- DONE
-- ================================================================
-- Prochaine étape : lancer `node scripts/seed-supabase.mjs` pour
-- importer les 6 promos du Content Collection vers Supabase.
-- Ce script requiert SUPABASE_SERVICE_ROLE_KEY dans .env.local.
