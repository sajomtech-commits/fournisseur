#!/usr/bin/env node
/**
 * Collecteur « fournisseur » — JetLife Fashion (0832CLUB)
 *
 * Récupère uniquement les articles récents + les articles mis en avant (top=1),
 * via l'API publique du site. Volontairement limité : quelques requêtes par run,
 * une fois par jour. Aucune collecte massive du catalogue.
 *
 * Les images ne sont PAS téléchargées : seul leur chemin est stocké.
 * Le site les affiche directement depuis le serveur du fournisseur.
 *
 * Sortie : data/products.json + data/meta.json
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const API = "https://www.jetlifefashion.com/api";
const IMG_BASE = "https://www.jetlifefashion.com/";

// --- Réglages -------------------------------------------------------------
const RECENT_COUNT = 240;   // nouveautés conservées (les plus récentes)
const TOP_COUNT = 60;       // articles mis en avant
const NEW_COUNT = 24;       // articles marqués « nouveau » (les N plus récents)
const PAGE_SIZE = 100;      // maximum accepté par l'API
const DELAY_MS = 900;       // politesse entre deux requêtes

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Appel API avec retries. Renvoie null en cas d'échec définitif. */
async function api(path, params, attempt = 1) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    url.searchParams.set(k, String(v));
  }
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`API code ${json.code}: ${json.message}`);
    return json.data;
  } catch (err) {
    if (attempt < 3) {
      console.warn(`  ⚠ ${path} (essai ${attempt}) : ${err.message} — nouvelle tentative`);
      await sleep(DELAY_MS * attempt);
      return api(path, params, attempt + 1);
    }
    console.error(`  ✗ ${path} abandonné : ${err.message}`);
    return null;
  }
}

/** Normalise un article brut de l'API. */
function normalize(p, images) {
  return {
    id: p.id,
    name: (p.name ?? "").trim(),
    price: p.price ?? null,
    currency: p.cSymbol ?? "$",
    imageCount: p.imageCount ?? 0,
    cover: p.cover ? IMG_BASE + p.cover : null,
    images: (images ?? [])
      .slice(0, 12)
      .map((i) => IMG_BASE + (i.srcPath ?? i.thumbPath)),
    createdAt: p.createdAt ?? null,
    top: p.top === 1,
    isNew: p.new === 1,
  };
}

/**
 * Récupère les articles les plus récents.
 *
 * L'API ne trie pas par date et les articles récents se trouvent en fin de
 * catalogue : on parcourt donc les dernières pages, puis on trie localement.
 */
async function fetchRecent() {
  const first = await api("album/getList", { pageIndex: 1, pageSize: PAGE_SIZE });
  if (!first) return [];

  const total = first.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pagesToRead = Math.min(3, lastPage); // ~300 articles examinés

  const collected = [...(first.list ?? [])];
  for (let i = 0; i < pagesToRead; i++) {
    await sleep(DELAY_MS);
    const page = await api("album/getList", {
      pageIndex: lastPage - i,
      pageSize: PAGE_SIZE,
    });
    if (page?.list) collected.push(...page.list);
  }

  collected.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return collected.slice(0, RECENT_COUNT);
}

/**
 * Récupère les articles mis en avant.
 *
 * L'API ignore le paramètre `top` : la première page est de fait la sélection
 * mise en avant du fournisseur (tous ses articles ont top=1). On la lit donc
 * telle quelle, en ne gardant que les articles réellement marqués top.
 */
async function fetchTop() {
  const data = await api("album/getList", { pageIndex: 1, pageSize: PAGE_SIZE });
  const list = (data?.list ?? []).filter((p) => p.top === 1);
  return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
             .slice(0, TOP_COUNT);
}

/** Récupère les images d'un article (pour la galerie de la fiche). */
async function fetchImages(albumId) {
  const data = await api("album/getImageList", {
    pageIndex: 1,
    pageSize: 12,
    albumId,
  });
  return data?.list ?? [];
}

async function main() {
  console.log("→ Collecte JetLife Fashion (0832CLUB)");

  const recent = await fetchRecent();
  console.log(`  ${recent.length} articles récents`);

  await sleep(DELAY_MS);
  const top = await fetchTop();
  console.log(`  ${top.length} articles mis en avant`);

  // Fusion : nouveautés + tops, sans doublon
  const byId = new Map();
  for (const p of [...recent, ...top]) byId.set(p.id, p);

  // Images détaillées : uniquement pour les tops (galerie), budget limité
  const withImages = [];
  for (const p of byId.values()) {
    let images = null;
    if (p.top && withImages.filter((x) => x.images.length).length < 12) {
      await sleep(DELAY_MS);
      images = await fetchImages(p.id);
    }
    withImages.push(normalize(p, images));
  }

  // Badge « nouveau » : basé sur le classement relatif et non sur une fenêtre
  // de dates fixe, car le fournisseur peut rester plusieurs mois sans publier.
  // Les NEW_COUNT articles les plus récents sont marqués, ce qui garantit que
  // la section « Nouveautés » reste utile même en période creuse.
  const products = withImages.sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
  products.forEach((p, i) => {
    p.recent = i < NEW_COUNT;
  });
  const newCount = Math.min(NEW_COUNT, products.length);

  const meta = {
    updatedAt: new Date().toISOString(),
    supplier: "JetLife Fashion — 0832CLUB",
    source: "https://www.jetlifefashion.com",
    total: products.length,
    newCount,
    topCount: products.filter((p) => p.top).length,
    latestAt: products[0]?.createdAt ?? null,
  };

  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(
    join(ROOT, "data", "products.json"),
    JSON.stringify({ meta, products }, null, 1) + "\n"
  );
  await writeFile(
    join(ROOT, "data", "meta.json"),
    JSON.stringify(meta, null, 2) + "\n"
  );

  console.log(`✓ ${products.length} articles écrits (${newCount} récents, ${meta.topCount} tops)`);
}

main().catch((err) => {
  console.error("Échec de la collecte :", err);
  process.exit(1);
});
