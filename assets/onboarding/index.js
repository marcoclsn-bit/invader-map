// Illustrations de l'onboarding — un seul endroit à éditer.
//
// Chaque clé correspond à la clé d'un panneau dans OnboardingScreen.js.
// Une entrée absente (ou à null) retombe proprement sur l'icône du panneau :
// on peut donc livrer les images une par une, sans jamais casser l'écran.
//
// Les fichiers voyagent dans CHAQUE mise à jour par les airs. Viser 150–250 Ko
// par image, en PNG, largeur ~900 px. Les captures sont prises en thème sombre
// et présentées dans un cadre de téléphone : sans ce cadre, une capture d'écran
// se confond avec l'interface réelle et l'utilisateur essaie de la toucher.

export const illustrations = {
  welcome: require('./welcome.png'),
  chasse: require('./chasse.png'),
  alerte: require('./alerte.png'),
  // Capture prise le champ UID VIDE, à dessein : c'est l'écran que voit
  // réellement quelqu'un qui arrive, et rien à masquer.
  import: require('./import.png'),
  collection: require('./collection.png'),
  location: null,    // l'icône suffit : rien à montrer d'une permission
};

export default illustrations;
