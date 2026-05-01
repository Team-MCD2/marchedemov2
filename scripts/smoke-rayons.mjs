/**
 * Quick smoke test — count <img> referencing product/rayon images
 * on key rayon pages after the cat-image wiring fix.
 */
const urls = [
  "/rayons/boucherie-halal",
  "/rayons/boucherie-halal/charcuterie-halal",
  "/rayons/boucherie-halal/viandes",
  "/rayons/saveur-mediterranee",
  "/rayons/saveur-mediterranee/harissas-condiments",
  "/rayons/saveurs-afrique",
  "/recettes",
  "/rayons",
];
const BASE = "http://127.0.0.1:4322";
for (const u of urls) {
  const r = await fetch(BASE + u);
  const b = await r.text();
  const imgs = (b.match(/<img[^>]*src="[^"]+\.(?:jpg|jpeg|png|webp)[^"]*"/g) || []).length;
  const offImgs = (b.match(/images\.openfoodfacts\.org/g) || []).length;
  const rayonImgs = (b.match(/\/images\/rayons\/[a-z-]+\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)/gi) || []).length;
  console.log(
    `${r.status} ${u.padEnd(60)} imgs:${String(imgs).padStart(2)}  off:${String(offImgs).padStart(2)}  rayon-sub:${rayonImgs}`,
  );
}
