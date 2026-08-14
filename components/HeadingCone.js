import { Polygon } from 'react-native-maps';

// Calcule un point à distM mètres de (lat, lng) dans la direction bearingDeg
function destination(lat, lng, bearingDeg, distM) {
  const R = 6371000;
  const δ = distM / R;
  const θ = (bearingDeg % 360) * Math.PI / 180;
  const φ1 = lat * Math.PI / 180;
  const λ1 = lng * Math.PI / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  return { latitude: φ2 * 180 / Math.PI, longitude: λ2 * 180 / Math.PI };
}

// Faisceau de direction : secteur centré sur le cap de l'utilisateur.
//
// TOUJOURS MONTÉ, même sans position ni cap, et c'est la raison d'être de ce
// composant tel qu'il est écrit. Il rendait `null` tant que la boussole n'avait
// rien donné, donc il apparaissait TARD, une fois les contours, les tracés et
// les dizaines de marqueurs déjà en place. Il s'insérait alors au milieu des
// enfants de la carte, ce qui est exactement le chemin décrit dans AGENTS.md
// comme cause du plantage `insertObject:atIndex: object cannot be nil` : la
// couche d'interopérabilité de react-native-maps 1.20.1 met en file tout enfant
// inséré ailleurs qu'en fin de liste, puis insère au vidage une vue recyclée
// dont le contenu est encore nul.
//
// En restant monté depuis le premier rendu, il est posé en même temps que ses
// frères, et l'arrivée du cap n'est plus qu'une mise à jour de propriétés. Le
// polygone est alors réduit à un point et entièrement transparent : rien à voir,
// rien à insérer plus tard.
//
// À revoir lors de la montée en react-native-maps 1.29.0, qui supprime la couche
// du chemin : ce contournement deviendra inutile, sans devenir nuisible.
const TRANSPARENT = 'rgba(0,0,0,0)';

export default function HeadingCone({
  userLocation,
  heading,
  radiusM = 65,
  halfAngleDeg = 30,
}) {
  const actif = !!userLocation && heading !== null && heading !== undefined;
  const lat = userLocation?.latitude ?? 0;
  const lng = userLocation?.longitude ?? 0;

  let coords;
  if (actif) {
    // Arc de 8 points + apex = forme en éventail
    const STEPS = 8;
    coords = [{ latitude: lat, longitude: lng }];
    for (let i = 0; i <= STEPS; i++) {
      const angle = (heading - halfAngleDeg) + (2 * halfAngleDeg * i / STEPS);
      coords.push(destination(lat, lng, angle, radiusM));
    }
    coords.push({ latitude: lat, longitude: lng });
  } else {
    // Trois points confondus : polygone d'aire nulle, invisible, mais bien monté.
    const p = { latitude: lat, longitude: lng };
    coords = [p, p, p];
  }

  return (
    <Polygon
      coordinates={coords}
      fillColor={actif ? 'rgba(66, 133, 244, 0.22)' : TRANSPARENT}
      strokeColor={actif ? 'rgba(66, 133, 244, 0.55)' : TRANSPARENT}
      strokeWidth={actif ? 1 : 0}
    />
  );
}
