import { memo, useState } from 'react';
import { Image } from 'expo-image';
import { usePhotoCreneau, PRIORITE_LISTE, POIDS_SPOTTER } from '../services/photoQueue';

/**
 * Vignette d'un Invader : son gros plan réel, ou l'alien pixel-art à défaut.
 *
 * Les photos viennent d'invader-spotter.art, créditées dans « À propos ». Elles
 * avaient été retirées d'ici par prudence, au motif qu'elles reproduisent
 * l'œuvre d'Invader — la Collection les affiche depuis, sous la même
 * attribution, et le motif ne tient plus seul.
 *
 * ELLES SERVENT À RECONNAÎTRE. Sur un fil d'actualité qui annonce « PA_431
 * endommagé », un alien générique ne dit rien : ils sont tous identiques. La
 * photo montre la mosaïque dont on parle, et c'est tout l'intérêt de l'écran.
 *
 * DANS LES DEUX MODES, explorateur compris. La photo fait corps avec l'actualité
 * — elle EST ce dont on parle. Le mode explorateur protège l'EMPLACEMENT des
 * mosaïques, pas leur existence : l'écran continue d'ailleurs de renvoyer à la
 * ville et jamais au point précis quand il est actif. Voir à quoi ressemble une
 * mosaïque qui vient d'être endommagée ne dit pas où elle se trouve.
 *
 * Et nulle part ailleurs : la fiche ouverte depuis la carte n'affiche aucune
 * image, seulement des liens « Zoom » et « Plan large » vers invader-spotter.
 * C'est délibéré, et ça ne change pas.
 *
 * L'alien reste affiché SOUS la photo, pas à la place : il tient l'espace
 * pendant le chargement et reste seul si l'image n'arrive jamais — hors ligne,
 * fichier absent chez la source. Aucun trou, aucun état d'erreur à gérer.
 *
 * La file d'attente (`photoQueue`) bride le débit : un fil de quatre-vingt-dix
 * événements ne déclenche pas quatre-vingt-dix téléchargements simultanés chez
 * un site qui nous les offre gracieusement.
 */
const ALIEN = {
  ok:        require('../assets/markers/alien_ok.png'),
  damaged:   require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  hidden:    require('../assets/markers/alien_unknown.png'),
  unknown:   require('../assets/markers/alien_unknown.png'),
};
const alienFor = (status) => ALIEN[status] ?? ALIEN.unknown;

const InvaderPhoto = memo(function InvaderPhoto({
  photoUrl, status, style, contentFit = 'contain',
}) {
  const { src, fini } = usePhotoCreneau(photoUrl, PRIORITE_LISTE, POIDS_SPOTTER);
  const [echec, setEchec] = useState(false);

  return (
    <>
      <Image source={alienFor(status)} style={style} contentFit={contentFit} transition={0} />
      {src && !echec ? (
        <Image
          source={{ uri: src }}
          // `top`/`left` explicites : une vue absolue sans ancrage retombe sur
          // la position qu'elle aurait eue dans le flux, soit décalée sous
          // l'alien qui la précède.
          style={[style, { position: 'absolute', top: 0, left: 0 }]}
          contentFit="cover"
          transition={160}
          onLoad={fini}
          // `fini` DANS LES DEUX CAS : sans l'appeler sur erreur, le créneau ne
          // serait rendu qu'à l'expiration du filet de secours, et une source
          // injoignable ralentirait toute la file.
          onError={() => { setEchec(true); fini(); }}
        />
      ) : null}
    </>
  );
});

export default InvaderPhoto;
