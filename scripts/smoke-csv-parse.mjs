/**
 * smoke-csv-parse.mjs
 * -------------------
 * Stand-alone smoke test for the CSV parser used in
 * src/components/islands/admin/ProduitsManager.jsx — logic is
 * duplicated here for isolation (keep parser simple enough to stay in
 * sync manually, or extract to src/lib/csv.ts when reuse emerges).
 *
 * Run : node scripts/smoke-csv-parse.mjs
 */

function parseCSV(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const sep = semis > commas ? ";" : ",";

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else {
      if (c === '"' && cell === "") inQuotes = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
      } else cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  if (rows.length < 2) throw new Error("CSV vide ou sans en-tête");
  const headers = rows[0].map((h) =>
    String(h)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, ""),
  );
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const v = (r[i] ?? "").trim();
      if (v !== "") obj[h] = v;
    });
    if ("actif" in obj) {
      const t = String(obj.actif).toLowerCase();
      obj.actif = !(t === "0" || t === "false" || t === "non" || t === "n" || t === "");
    }
    return obj;
  });
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  OK ", msg); } else { fail++; console.log("  !! ", msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n     got : ${JSON.stringify(a)}\n     want: ${JSON.stringify(b)}`); }

console.log("\n=== CSV parser smoke test ===\n");

/* 1. Basic comma CSV */
eq(
  parseCSV("slug,nom,rayon\nriz,Riz,produits-courants\ncafe,Café,epices-du-monde"),
  [
    { slug: "riz", nom: "Riz", rayon: "produits-courants" },
    { slug: "cafe", nom: "Café", rayon: "epices-du-monde" },
  ],
  "basic comma CSV",
);

/* 2. Semicolon CSV (FR Excel export) */
eq(
  parseCSV("slug;nom;rayon\nriz;Riz;produits-courants"),
  [{ slug: "riz", nom: "Riz", rayon: "produits-courants" }],
  "semicolon separator",
);

/* 3. Quoted field with comma inside */
eq(
  parseCSV('slug,nom,description\nriz,"Riz basmati","Riz aromatique, origine Inde"'),
  [{ slug: "riz", nom: "Riz basmati", description: "Riz aromatique, origine Inde" }],
  "quoted field with comma",
);

/* 4. Escaped double quotes */
eq(
  parseCSV('slug,nom\nriz,"Riz ""basmati"" parfumé"'),
  [{ slug: "riz", nom: 'Riz "basmati" parfumé' }],
  "escaped double quotes",
);

/* 5. CRLF line endings */
eq(
  parseCSV("slug,nom\r\nriz,Riz\r\ncafe,Café"),
  [{ slug: "riz", nom: "Riz" }, { slug: "cafe", nom: "Café" }],
  "CRLF line endings",
);

/* 6. Quoted field with embedded newline */
eq(
  parseCSV('slug,description\nriz,"Ligne 1\nLigne 2"'),
  [{ slug: "riz", description: "Ligne 1\nLigne 2" }],
  "quoted newline preserved",
);

/* 7. UTF-8 BOM */
eq(
  parseCSV("\uFEFFslug,nom\nriz,Riz"),
  [{ slug: "riz", nom: "Riz" }],
  "UTF-8 BOM stripped",
);

/* 8. Header normalisation (spaces, accents, case) */
eq(
  parseCSV("Slug,Nom du produit,Prix indicatif\nriz,Riz basmati,2.90"),
  [{ slug: "riz", nom_du_produit: "Riz basmati", prix_indicatif: "2.90" }],
  "headers normalised to snake_case",
);

/* 8b. Header with hyphens and diacritics → underscored snake_case */
eq(
  parseCSV("slug,Sous-catégorie,Prix indicatif (€)\nriz,Exotiques,2.90"),
  [{ slug: "riz", sous_categorie: "Exotiques", prix_indicatif: "2.90" }],
  "hyphens & punctuation collapsed into single underscore",
);

/* 9. Empty cells → omitted keys */
eq(
  parseCSV("slug,nom,origine\nriz,Riz,\ncafe,Café,Brésil"),
  [{ slug: "riz", nom: "Riz" }, { slug: "cafe", nom: "Café", origine: "Brésil" }],
  "empty cells omitted",
);

/* 10. Boolean actif coercion */
eq(
  parseCSV("slug,actif\na,true\nb,false\nc,0\nd,1\ne,non\nf,OUI"),
  [
    { slug: "a", actif: true },
    { slug: "b", actif: false },
    { slug: "c", actif: false },
    { slug: "d", actif: true },
    { slug: "e", actif: false },
    { slug: "f", actif: true },
  ],
  "actif boolean coerced from text",
);

/* 11. Blank lines dropped */
eq(
  parseCSV("slug,nom\n\nriz,Riz\n\n\ncafe,Café\n"),
  [{ slug: "riz", nom: "Riz" }, { slug: "cafe", nom: "Café" }],
  "blank lines dropped",
);

/* 12. Trailing newline without trailing data */
eq(
  parseCSV("slug,nom\nriz,Riz\n"),
  [{ slug: "riz", nom: "Riz" }],
  "trailing newline tolerated",
);

/* 13. Error on missing header */
try {
  parseCSV("");
  ok(false, "empty CSV should throw");
} catch (e) {
  ok(/en-tête/i.test(e.message), "empty CSV throws with 'en-tête' message");
}

/* 14. Real-world FR Excel export flavour (semicolon, BOM, CRLF, quotes, diacritic header) */
eq(
  parseCSV('\uFEFFSlug;Nom;Rayon;Catégorie;Sous-catégorie;Origine\r\ndattes-medjool;"Dattes Medjool premium";epices-du-monde;Dattes;Exotiques;Tunisie\r\n'),
  [{
    slug: "dattes-medjool",
    nom: "Dattes Medjool premium",
    rayon: "epices-du-monde",
    categorie: "Dattes",
    sous_categorie: "Exotiques",
    origine: "Tunisie",
  }],
  "real-world FR Excel flavour (diacritics stripped, hyphens→underscore)",
);

console.log(`\n=== Summary : ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
