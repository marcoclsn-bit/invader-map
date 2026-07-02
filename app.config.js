// app.config.js — config dynamique.
// Injecte la clé Google Maps Android depuis l'environnement (variable EAS en build,
// .env.local en local) pour NE PAS la committer dans le dépôt.
// Tout le reste de la configuration vient de app.json.
//
// La clé est utilisée uniquement par la config native Android (AndroidManifest via
// le plugin react-native-maps) — jamais inlinée dans le bundle JS, et sans effet
// sur iOS (qui utilise Apple Maps).
export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android && config.android.config),
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
});
