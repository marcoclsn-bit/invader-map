// Clé d'application Aptabase (analytics de fréquentation).
//
// ⚠️ Contrairement aux clés ORS / Mapbox, cette clé n'est PAS sensible : elle est
// conçue pour être embarquée en clair dans l'app (c'est une clé « publique » côté
// client). On peut donc la mettre directement ici, sans variable d'environnement.
//
// Où la trouver : https://aptabase.com → connecte-toi → ton app → menu « Instructions »
// (à gauche). Format : A-EU-XXXXXXXXXX (le préfixe « EU » = hébergement Europe / RGPD).
//
// Tant que cette valeur est vide, l'analytics est totalement désactivé (aucun envoi,
// aucun crash) — pratique pour builder sans encore avoir de compte.
export const APTABASE_KEY = 'A-EU-4047131131'; // hébergement Europe (RGPD)
