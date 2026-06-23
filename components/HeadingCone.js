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

// Faisceau de direction : secteur centré sur le cap de l'utilisateur
export default function HeadingCone({
  userLocation,
  heading,
  radiusM = 65,
  halfAngleDeg = 30,
}) {
  if (!userLocation || heading === null || heading === undefined) return null;
  const { latitude: lat, longitude: lng } = userLocation;

  // Arc de 8 points + apex = forme en éventail
  const STEPS = 8;
  const coords = [{ latitude: lat, longitude: lng }];
  for (let i = 0; i <= STEPS; i++) {
    const angle = (heading - halfAngleDeg) + (2 * halfAngleDeg * i / STEPS);
    coords.push(destination(lat, lng, angle, radiusM));
  }
  coords.push({ latitude: lat, longitude: lng });

  return (
    <Polygon
      coordinates={coords}
      fillColor="rgba(66, 133, 244, 0.22)"
      strokeColor="rgba(66, 133, 244, 0.55)"
      strokeWidth={1}
    />
  );
}
