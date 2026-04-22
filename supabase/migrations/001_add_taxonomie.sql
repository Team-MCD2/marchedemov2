-- ================================================================
-- Migration 001 — Ajout colonnes categorie + sous_categorie aux produits
--
-- Permet le drill-down hiérarchique par rayon :
--   /rayons/fruits-legumes              → grille des `categorie` distinctes
--   /rayons/fruits-legumes/fruits       → grille des `sous_categorie` distinctes
--                                          si niveau 2 existe, sinon produits
--   /rayons/fruits-legumes/fruits/dattes → feuille : produits
--
-- Idempotent : `add column if not exists`.
-- À exécuter dans Supabase Studio → SQL Editor.
-- ================================================================

alter table public.produits
  add column if not exists categorie      text,
  add column if not exists sous_categorie text;

-- Index composites pour les requêtes drill-down (rayon + cat + sous-cat).
create index if not exists idx_produits_categorie
  on public.produits(rayon, categorie);

create index if not exists idx_produits_sous_cat
  on public.produits(rayon, categorie, sous_categorie);

-- Commentaires de documentation (visibles dans Supabase Studio).
comment on column public.produits.categorie is
  'Niveau 1 dans la hiérarchie du rayon. Ex: "Fruits" dans fruits-legumes.';
comment on column public.produits.sous_categorie is
  'Niveau 2 optionnel. Ex: "Dattes" sous "Fruits". Peut rester NULL.';
