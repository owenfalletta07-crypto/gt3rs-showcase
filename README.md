# gt3rs-showcase

Démo fan non officielle — Porsche 911 GT3 RS (992).

Site statique sans build : Three.js + GSAP/ScrollTrigger + Lenis, scroll cinématique
autour d'un modèle 3D, choré­graphié caméra sur une scène fixe.

**Aucun lien avec Porsche AG.** Projet de démonstration non officiel.

## Modèle 3D

`assets/car.glb` est dérivé de [« 2023 Porsche 911 GT3 RS 2.7 Carrera Tribute 992 »](https://sketchfab.com/3d-models/2023-porsche-911-gt3-rs-27-carrera-tribute-992-f17a982d5d8a4d97baef4b00b51a4e9a)
par **Ddiaz Design**, sous licence [CC BY-NC-SA 4.0](http://creativecommons.org/licenses/by-nc-sa/4.0/).
Le fichier source a été retraité (`tools/process-source-model.mjs`) : suppression de
l'écusson Porsche et de la plaque constructeur, fusion des meshes par matériau,
repositionnement des 4 roues (non présentes individuellement dans l'export source),
simplification géométrique (~250k → ~87k triangles) et compression du fichier.

## Développement local

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080/`.

