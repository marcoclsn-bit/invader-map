/**
 * services/featureAccess.js — PORTAIL UNIQUE d'autorisation des fonctionnalités.
 *
 * ⚠️ AUJOURD'HUI : passe-plat. `canUseFeature()` renvoie TOUJOURS { allowed: true }.
 *    Tout reste gratuit et illimité. Ne mets AUCUNE limite ici sans décision produit.
 *
 * OBJECTIF : centraliser en UN SEUL endroit la décision « l'utilisateur peut-il
 * lancer cette fonctionnalité ? ». En v2, toute la logique (abonné ? quota
 * hebdo restant ?) vivra ICI et nulle part ailleurs — les écrans n'auront pas à
 * changer, ils appellent déjà ce portail.
 *
 * Points d'appel actuels (déjà branchés) :
 *   - Trajet : screens/TrajetScreen.js  → calculate()
 *   - Chasse : screens/ChasseScreen.js  → generate()
 *   - Balade : screens/StrollScreen.js  → onToggleEnabled() (à l'activation)
 *
 * Contrat de retour : { allowed: boolean, reason?: string, remaining?: number, limit?: number }
 */

export const FEATURES = {
  TRAJET: 'trajet',
  CHASSE: 'chasse',
  BALADE: 'balade',
};

// Limites hebdo prévues pour la v2 (NON APPLIQUÉES aujourd'hui). Documentation
// uniquement — décommenter/ajuster quand on activera les quotas.
// export const FREE_WEEKLY_LIMITS = { trajet: 5, chasse: 5, balade: 3 };

/**
 * Peut-on utiliser la fonctionnalité ? Async pour pouvoir, en v2, lire l'état
 * d'abonnement et le compteur d'usage sans changer les appelants.
 *
 * @param {'trajet'|'chasse'|'balade'} featureName
 * @returns {Promise<{allowed: boolean, reason?: string, remaining?: number, limit?: number}>}
 */
export async function canUseFeature(featureName) {
  // ───────────────────────────────────────────────────────────────────────────
  // v2 — ACTIVATION DES QUOTAS (exemple, NE PAS activer maintenant) :
  //
  //   import { getUsage } from './usageCounter';
  //   import { FREE_WEEKLY_LIMITS } from './featureAccess';
  //
  //   if (await isSubscriber()) return { allowed: true };          // abonné = illimité
  //   const limit = FREE_WEEKLY_LIMITS[featureName] ?? Infinity;
  //   const { count } = await getUsage(featureName);
  //   if (count >= limit) return { allowed: false, reason: 'quota', remaining: 0, limit };
  //   return { allowed: true, remaining: limit - count, limit };
  // ───────────────────────────────────────────────────────────────────────────

  // AUJOURD'HUI : tout autorisé, illimité.
  return { allowed: true };
}
