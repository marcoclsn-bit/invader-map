import { memo } from 'react';
import { Image } from 'expo-image';

// Vignette d'un Invader = alien pixel-art du statut (nos propres assets locaux).
//
// NB : on n'affiche plus les photos réelles des mosaïques (gros plans
// invader-spotter) par prudence — reproduction de l'œuvre d'Invader. Le composant
// garde la prop `photoUrl` pour compat des appelants mais l'ignore : aucune
// requête réseau, aucune image tierce affichée. Pour réactiver un jour, restaurer
// la version précédente (git).
const ALIEN = {
  ok:        require('../assets/markers/alien_ok.png'),
  damaged:   require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  hidden:    require('../assets/markers/alien_unknown.png'),
  unknown:   require('../assets/markers/alien_unknown.png'),
};
const alienFor = (status) => ALIEN[status] ?? ALIEN.unknown;

const InvaderPhoto = memo(function InvaderPhoto({ status, style, contentFit = 'contain' }) {
  return <Image source={alienFor(status)} style={style} contentFit={contentFit} transition={0} />;
});

export default InvaderPhoto;
