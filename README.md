# ILIA · mise en place

Outil équipe (fiche de mise en place du matin, inventaire de fin de service) et vue direction.

- Une adresse par restaurant : `/washington`, `/casanova`, `/mathurins`, `/riviere`, `/vernier`, `/caumartin`
- Vue direction : `/direction`
- Données : Supabase (projet « ILIA Mise en place »), ventes importées de Zelty chaque nuit.
- Page statique sans compilation : `index.html`, `app.js`, `app.css`. Toutes les lectures et écritures passent par des fonctions Supabase qui vérifient le code du restaurant.
