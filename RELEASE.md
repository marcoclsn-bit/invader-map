# 🚀 Guide de publication — InvaderQuest

Aide-mémoire pour mettre à jour l'app **sans se tromper**.
Racine du projet : `~/Documents/invader-map` (commence toujours par `cd ~/Documents/invader-map`).

---

## 🧠 La règle d'or

> **« Est-ce que ma modif touche au NATIF ? »**
> - **Non** → mise à jour **OTA** (`eas update`) ou juste **données** → instantané, aucune review Apple.
> - **Oui** → **nouveau build** (`eas build` + `eas submit`) → review Apple ~24-48 h.

« Natif » = nouvelle librairie native, permission, icône/splash, config `app.json` iOS/Android, paiement.
Tout le reste (écrans, logique JS, textes, styles, données) = **pas natif**.

---

## 🧱 Les 3 couches de mise à jour

| Couche | Exemples | Mise à jour | Review Apple |
|---|---|---|---|
| **1. Données** | Invaders, coords, actus, statuts | `git push` (l'app lit GitHub) | ❌ |
| **2. Code JS / UI** | écrans, textes, bugs, petites features | `eas update` (OTA) | ❌ |
| **3. Natif / build** | lib native, permission, icône, paiement | `eas build` + `eas submit` | ✅ |

Canaux EAS configurés : `production` (vrais users App Store), `preview` (testeurs), `development`.

---

## ✅ Scénarios courants (copier-coller)

### 1. Mettre à jour des données (Invaders, actus, coordonnées)
Rien de spécial : tu modifies les données (ou l'Action quotidienne le fait), tu pushes.
```bash
cd ~/Documents/invader-map
git add data/ && git commit -m "data: ..." && git push
```
➡️ Les utilisateurs les voient **à la prochaine ouverture** de l'app. **Rien sur App Store Connect.**

> 💡 L'Action GitHub tourne **chaque jour à 6 h UTC** et rafraîchit les données automatiquement.
> Les coordonnées ajoutées à la main vont dans `data/invaders_extras.json` (elles persistent).

### 2. Corriger un bug / ajouter une petite feature JS → OTA
```bash
cd ~/Documents/invader-map
# (commit ton code d'abord)
git add -A && git commit -m "..." && git push
# Publier l'OTA aux vrais utilisateurs :
eas update --branch production --message "ce que ça change"
```
➡️ Reçu à l'ouverture de l'app (souvent il faut **fermer/rouvrir 2 fois** : la 1ʳᵉ télécharge, la 2ᵉ applique). **Aucune review.**

### 3. Tester AVANT de livrer aux vrais utilisateurs
Pousse d'abord sur le canal **preview** (tes testeurs), pas production :
```bash
eas update --branch preview --message "test: ..."
```
Tes testeurs sur la build **preview** (TestFlight / APK Android) le reçoivent ; les vrais users **ne voient rien**.
Quand c'est validé → tu republies sur `production` (scénario 2).

### 4. Déploiement progressif (pour une OTA sensible)
```bash
eas update --branch production --rollout-percentage 10   # 10 % des users
# tu surveilles… puis tu montes :
eas update --branch production --rollout-percentage 100
```
En cas de souci → **rollback** : republie l'update précédent (via le dashboard EAS ou un nouveau `eas update` corrigé).

### 5. Nouveau build iOS (natif) + soumission App Store
```bash
cd ~/Documents/invader-map
eas build --platform ios --profile production
# quand le build est fini :
eas submit --platform ios --latest
```
Puis sur **App Store Connect** :
1. Crée/ouvre la **version** (ex. `1.1.0`).
2. Attache la **build** (numéro auto-incrémenté).
3. Remplis **« Nouveautés de cette version »**.
4. **Soumets pour vérification** → ~24-48 h → une fois approuvée, **publie**.

> ⚠️ Un nouveau build a une **nouvelle empreinte** : tes futures OTA s'appliquent à cette build.

### 6. Build Android (APK de test direct)
```bash
eas build --platform android --profile preview   # → APK installable en direct
```
Lien de téléchargement affiché à la fin (ou sur expo.dev).

---

## 💳 Cas spécial : le paiement (In-App Purchase / abonnement)

C'est du **natif** → impossible à tester en OTA seul. Parcours :
1. Créer les produits dans **App Store Connect** (+ contrats « Agreements, Tax & Banking » **actifs**).
2. Intégrer (RevenueCat conseillé, ou expo-in-app-purchases) → **nouveau build**.
3. Tester avec des **comptes Sandbox** (App Store Connect → Testeurs Sandbox) sur **TestFlight** → achats **simulés, aucun débit réel**.
4. Cacher la feature derrière un **feature flag**, activer une fois validée, puis review + publication.

---

## 📋 Tableau de décision rapide

| Je veux… | Commande | Review |
|---|---|---|
| MAJ Invaders / actus | `git push` | ❌ |
| Corriger un bug JS | `eas update --branch production` | ❌ |
| Tester avant les users | `eas update --branch preview` + TestFlight | ❌ |
| Grosse feature / permission / icône / paiement | `eas build` + `eas submit` + version ASC | ✅ |

---

## 🎯 `runtimeVersion` — pour que les OTA atteignent bien l'app live

**Règle d'or : on ne change `runtimeVersion` (dans `app.json`) QUE quand on modifie du natif / qu'on fait un nouveau build.**
Tant qu'on ne fait que du JS/OTA, elle **ne bouge pas** → les `eas update` rejoignent toujours l'app installée.

- Valeur actuelle : une **chaîne fixe** (actuellement « 1.1.0 » depuis le build 16 ; avant : l'empreinte de la build 15), pas la policy `fingerprint`.
- Pourquoi : la policy `fingerprint` calculait une empreinte **différente** selon la machine (serveurs EAS vs local) → les OTA locales rataient l'app live. Une valeur fixe = déterministe, les OTA passent depuis n'importe où.

**Quand tu fais un nouveau build natif** (build 16, 17…) :
1. Laisse `runtimeVersion` **inchangée** si tu veux que l'OTA couvre l'ancienne ET la nouvelle build.
2. OU change-la (ex. nouvelle chaîne) si tu veux « couper » l'ancienne build — mais alors seule la nouvelle recevra les OTA.
3. Après le build : récupère son runtime avec `eas build:view <ID>` et vérifie qu'il correspond à `runtimeVersion`.

**Dépannage — « mon OTA n'arrive pas sur l'app live »** :
```bash
# 1. runtime de la build installée (App Store) :
eas build:view <BUILD_ID> | grep "Runtime Version"
# 2. runtime des dernières OTA publiées :
eas update:list --branch production --limit 3
# → les deux DOIVENT être identiques. Sinon, aligne runtimeVersion dans app.json.
```

> ⚠️ **Android** : les builds Android existants (APK/Play interne) ont un autre runtime. Le premier build Android de production devra être compilé avec cette même `runtimeVersion` pour que ses OTA passent.

---

## 🔒 Règles de sécurité (ne jamais oublier)

- **Aucune clé API dans Git.** Elles vivent dans `config/ors.js`, `config/mapbox.js`, `.env.local` (gitignorés) et les **variables d'environnement EAS**.
- Avant un `git push`, vérifie qu'aucun secret ne part (`git diff` sur les fichiers modifiés).
- **Android + Google Maps** : la clé Maps doit autoriser **2 empreintes SHA-1** :
  - keystore EAS (`19:D6…`) → APK directs ;
  - Play App Signing (`CD:9A…`) → distribution Play Store.
  (Sinon carte noire — voir historique de session.)

---

## 🆘 Rappels utiles

- **OTA reçue mais rien ne change ?** Ferme complètement l'app (balaie-la des récentes) et rouvre **2 fois**.
- **`eas submit` demande un `ascAppId`** en non-interactif → lance-le **sans** `--non-interactive` (mode interactif).
- Une OTA n'atteint que les builds de **même empreinte** : si tu changes le natif, rebuild puis republie l'OTA.
- Chaque changement doit être **commité ET poussé** avant de publier (l'OTA/le build partent de l'état du repo).
