/**
 * Shared slug normaliser.
 *
 * The canonical shape of a slug in `public.produits.slug` and
 * `public.promos.slug` is :
 *     lowercase, [a-z0-9-]+, no leading/trailing `-`, max 80 chars.
 *
 * Before this helper existed, the admin islands did NFD-strip but the
 * server endpoints didn't, which meant a CSV import of "crème-fraîche"
 * would write `crème-fraîche` to the DB — passing Supabase's `text`
 * column but failing the admin's client-side regex filter and looking
 * like an untyped row. Single source of truth fixes the divergence.
 *
 * Contract :
 *   - idempotent : slugifyKey(slugifyKey(x)) === slugifyKey(x)
 *   - deterministic : same input always produces the same output
 *   - no empty string for non-empty input, unless the input was pure
 *     diacritics / symbols (then returns "")
 */
export function slugifyKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") /* strip combining diacritics */
    .replace(/[^a-z0-9]+/g, "-") /* everything else → - */
    .replace(/^-+|-+$/g, "") /* trim leading/trailing - */
    .slice(0, 80);
}
