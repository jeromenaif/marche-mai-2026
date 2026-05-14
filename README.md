# GR 223 — Mai 2026

Carnet de marche interactif retraçant 21 étapes du GR 223 (De Panne → ?), du 5 mai 2026 au 25 mai 2026.

## Contenu

- `index.html` — page principale
- `app.js`, `gpx.js`, `days.js` — scripts
- `data/` — traces GPX (une par jour)
- `photos/` — photos par jour (`jour-NN/`)

## Hébergement sur GitHub Pages

1. Créer un nouveau dépôt GitHub (public ou privé selon vos préférences).
2. Uploader tout le contenu de ce dossier à la racine du dépôt.
3. Dans **Settings → Pages**, choisir **Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Quelques minutes plus tard, le site sera accessible à l'URL `https://<votre-pseudo>.github.io/<nom-du-repo>/`.

## Ajouter / modifier des étapes

Tout est centralisé dans `days.js`. Pour ajouter une étape :
1. Déposer le GPX dans `data/NN-depart-arrivee.gpx`.
2. Déposer les photos dans `photos/jour-NN/`.
3. Compléter l'entrée correspondante dans le tableau `days`.

Le site est entièrement statique — pas de backend, pas de base de données.

## Crédits

- Cartographie : [OpenStreetMap](https://www.openstreetmap.org) · [CARTO](https://carto.com) · [OpenTopoMap](https://opentopomap.org) · Esri World Imagery
- Bibliothèque carte : [Leaflet](https://leafletjs.com)
- Typographie : Instrument Serif, Manrope (Google Fonts)
