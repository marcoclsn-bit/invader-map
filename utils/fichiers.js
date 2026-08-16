import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/**
 * Lire et écrire des fichiers — la sauvegarde par le disque.
 *
 * Ces deux modules exigent du code natif : ils entrent dans le binaire au build
 * 1.4.0, et rien de ce fichier ne fonctionne sur un binaire antérieur. C'est
 * précisément ce qui a retardé cette fonctionnalité pendant des semaines.
 *
 * Pourquoi elle vaut le détour, alors qu'un champ de collage existe déjà : au
 * format actuel, une collection parisienne complète avec ses dates pèse environ
 * 45 Ko de texte. On ne colle pas 45 Ko dans un message. Le fichier n'ajoute
 * aucune fonction, il rend simplement praticable ce qui ne l'était plus au-delà
 * de quelques centaines de lignes.
 */

/**
 * Ouvre le sélecteur et rend le CONTENU TEXTE du fichier choisi, ou null si
 * l'utilisateur renonce.
 *
 * Le filtre est volontairement large. Restreindre aux types texte paraît propre
 * mais grise les fichiers dans le sélecteur dès que leur type est mal déclaré —
 * et un .csv exporté par un tableur l'est souvent. Mieux vaut laisser ouvrir et
 * répondre « aucun identifiant reconnu » que d'empêcher d'essayer.
 */
export async function lireFichierTexte() {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,   // sans copie, l'URI peut expirer avant lecture
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const { uri, name } = res.assets[0];
  const contenu = await new File(uri).text();
  return { contenu, nom: name ?? null };
}

/**
 * Écrit un fichier dans le cache et ouvre la feuille de partage.
 *
 * Le cache et non les documents : c'est une sauvegarde qu'on envoie ailleurs, pas
 * un fichier que l'app doit conserver. Le système le nettoiera tout seul.
 *
 * Rend false si le partage n'est pas disponible — l'appelant peut alors se
 * rabattre sur l'envoi en texte, qui marche partout.
 */
export async function ecrireEtPartager(nomFichier, contenu, { mimeType, titre } = {}) {
  if (!(await Sharing.isAvailableAsync())) return false;
  const fichier = new File(Paths.cache, nomFichier);
  if (fichier.exists) fichier.delete();
  fichier.create();
  fichier.write(contenu);
  await Sharing.shareAsync(fichier.uri, {
    mimeType: mimeType ?? 'text/plain',
    dialogTitle: titre,
    UTI: mimeType === 'application/json' ? 'public.json' : 'public.plain-text',
  });
  return true;
}

/** « 2026-08-16 » — pour nommer les sauvegardes sans les faire se recouvrir. */
export function dateDuJour() {
  return new Date().toISOString().slice(0, 10);
}
