import { memo } from 'react';
import { Image } from 'expo-image';

// Placeholder / fallback pixel-art : l'alien du statut (assets locaux, toujours dispos).
const ALIEN = {
  ok:        require('../assets/markers/alien_ok.png'),
  damaged:   require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  hidden:    require('../assets/markers/alien_unknown.png'),
  unknown:   require('../assets/markers/alien_unknown.png'),
};
const alienFor = (status) => ALIEN[status] ?? ALIEN.unknown;

/**
 * Photo d'un Invader (gros plan invader-spotter), avec :
 *   - placeholder pixel-art (alien du statut) pendant le chargement,
 *   - cache disque agressif (une image chargée n'est pas rechargée),
 *   - fallback gracieux si pas de photoUrl ou hors-ligne → l'alien du statut.
 * `style` porte les dimensions (carré en Liste, large sur la fiche).
 */
const InvaderPhoto = memo(function InvaderPhoto({ photoUrl, status, style, contentFit = 'contain' }) {
  const placeholder = alienFor(status);

  // Pas d'URL → on affiche directement l'alien local (aucune requête réseau).
  if (!photoUrl) {
    return <Image source={placeholder} style={style} contentFit={contentFit} transition={0} />;
  }

  return (
    <Image
      source={{ uri: photoUrl }}
      placeholder={placeholder}
      placeholderContentFit="contain"
      contentFit={contentFit}
      cachePolicy="disk"        // cache disque persistant entre sessions
      recyclingKey={photoUrl}   // évite les images fantômes lors du recyclage FlatList
      transition={150}
      style={style}
    />
  );
});

export default InvaderPhoto;
