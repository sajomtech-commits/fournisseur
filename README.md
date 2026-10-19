# Fournisseur

Veille des nouveautés du fournisseur **JetLife Fashion (0832CLUB)** — les derniers articles et la sélection mise en avant, avec photos, mis à jour automatiquement chaque jour.

🔗 **https://sajomtech-commits.github.io/fournisseur/**

## Ce que fait le site

- 🆕 **Nouveautés** — les 24 derniers articles publiés par le fournisseur
- ⭐ **Top produits** — la sélection mise en avant par le fournisseur
- 📚 **Tout** — les 240 articles suivis
- 🖼️ **Photos** — vignette sur chaque carte, galerie complète dans la fiche produit
- 🔍 **Recherche** instantanée + filtres par catégorie et par marque
- 🌙 **Thème clair / sombre** automatique
- 📱 **Responsive** — utilisable sur téléphone

## Comment ça marche

```
GitHub Actions (1 fois par jour, ~6 requêtes)
        │
        ▼
   data/products.json          ← métadonnées seulement (~85 Ko)
        │
        ▼
   Site statique (HTML/CSS/JS)  ← aucune dépendance, aucun build
        │
        ▼
   GitHub Pages
```

Le site ne stocke **que les chemins des images**. Elles sont affichées
directement depuis le serveur du fournisseur : le dépôt reste léger et il n'y a
aucune copie d'image à maintenir.

## Collecte

`scripts/collect.mjs` interroge l'API publique du fournisseur :

| Endpoint | Usage |
|---|---|
| `api/album/getList` | liste des articles (dernières pages = articles récents) |
| `api/album/getImageList` | photos d'un article (galerie) |

Volontairement limité : **~6 requêtes par jour**, avec un délai de 900 ms entre
chaque. Il ne s'agit pas d'une collecte massive du catalogue (17 791 articles).

Si l'API change ou devient indisponible, le collecteur échoue proprement :
le site continue d'afficher les dernières données valides.

### Lancer la collecte à la main

```bash
node scripts/collect.mjs
```

Aucune dépendance à installer — Node 20+ suffit.

## Structure

```
index.html                      page unique
assets/style.css                styles
assets/app.js                   logique du site
scripts/collect.mjs             collecteur
data/products.json              données (généré)
data/meta.json                  métadonnées (généré)
.github/workflows/collect.yml   planification quotidienne
```

## Remarques

- Les **prix** sont ceux affichés par le fournisseur, en dollars, à titre indicatif.
- Les **catégories et marques sont déduites du nom** de l'article : l'API ne les
  fournit pas sur la liste. C'est une approximation, elle peut se tromper.
- Le badge « Nouveau » marque les 24 articles les plus récents. Il est basé sur le
  classement et non sur une fenêtre de dates, car le fournisseur peut rester
  plusieurs mois sans publier.
- Les **images appartiennent aux marques concernées** : ce site les affiche pour
  la veille, il ne les redistribue pas.

## Publication manuelle

```bash
git clone https://github.com/sajomtech-commits/fournisseur.git
cd fournisseur
# … modifications …
git add -A && git commit -m "mise à jour" && git push
```
