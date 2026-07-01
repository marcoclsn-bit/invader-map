/**
 * data/privacyPolicy.js — Politique de confidentialité affichée DANS l'app
 * (écran PrivacyPolicyScreen). Localisée fr/en/es/it.
 *
 * ⚠️ Doit rester cohérente avec docs/privacy-policy.md (version hébergée pour l'URL
 * App Store Connect). Contact = email du développeur (modifiable).
 */

const CONTACT = 'marchenri.colson@gmail.com';

export const PRIVACY_POLICY = {
  fr: {
    updatedLabel: 'Dernière mise à jour',
    updated: 'juillet 2026',
    intro: 'InvaderQuest est une application indépendante pour repérer les mosaïques Space Invader. Cette page explique quelles données l’application manipule.',
    summaryTitle: 'En bref',
    summary: 'Pas de compte, pas de serveur, pas de publicité, pas de suivi. Vos données (Invaders flashés, profil, badges, statistiques) restent sur votre appareil. Seules les données nécessaires au calcul d’itinéraire et à la recherche d’adresse sont transmises à nos prestataires de cartographie.',
    sections: [
      { title: 'Éditeur & contact', body: `InvaderQuest est un projet indépendant édité par son développeur. Pour toute question : ${CONTACT}.` },
      { title: 'Aucun compte, aucun serveur', body: 'L’application ne crée pas de compte et n’a aucun serveur vous concernant. Aucune donnée personnelle n’est collectée sur nos infrastructures. Il n’y a ni publicité, ni traceur, ni mesure d’audience.' },
      { title: 'Données stockées localement', body: 'Sont enregistrés uniquement sur votre appareil : les Invaders flashés et leur date, votre profil (pseudo, avatar, photo éventuelle), vos badges et sessions, ainsi que vos préférences (filtres, thème, langue, réglages). Ces données disparaissent si vous désinstallez l’application ou effacez ses données.' },
      { title: 'Localisation', body: 'Votre position sert à vous situer sur la carte, calculer des itinéraires et vous alerter à proximité d’un Invader. L’autorisation en arrière-plan est facultative et n’est demandée que si vous activez le Mode balade ; elle permet des alertes même application fermée, et se désactive à tout moment. Votre position n’est pas enregistrée sur un serveur.' },
      { title: 'Services tiers', body: 'Pour certaines fonctions, l’application contacte : Mapbox (recherche d’adresse — reçoit le texte saisi et une position approximative), OpenRouteService (itinéraires — reçoit les points de départ et d’arrivée), GitHub (téléchargement de la base publique des Invaders, sans donnée personnelle) et Expo (mises à jour logicielles, données techniques minimales). Ces échanges se limitent au strict nécessaire et ne servent ni à la publicité ni au profilage.' },
      { title: 'Notifications', body: 'Les notifications du Mode balade sont générées localement par votre appareil. Aucune notification push ni identifiant associé n’est utilisé.' },
      { title: 'Photos & appareil photo', body: 'Si vous choisissez ou prenez une photo comme avatar, elle reste sur votre appareil et n’est ni envoyée ni partagée automatiquement.' },
      { title: 'Partage d’image', body: 'La fonction de partage génère une image sur votre appareil et l’ouvre dans la feuille de partage du téléphone. Vous seul décidez de la partager ; l’application ne publie rien en votre nom.' },
      { title: 'Conservation & suppression', body: 'Vos données étant locales, elles restent tant que l’application est installée. Pour tout supprimer : désinstallez l’application ou effacez ses données dans les réglages du système.' },
      { title: 'Sécurité', body: 'Les données restant sur votre appareil, leur sécurité dépend de celle de votre téléphone. Les échanges avec les services tiers se font en HTTPS (chiffré).' },
      { title: 'Enfants', body: 'L’application n’est pas destinée spécifiquement aux enfants et ne collecte sciemment aucune donnée les concernant.' },
      { title: 'Modifications', body: 'Cette politique peut évoluer ; la date de mise à jour figure en haut. Les changements importants seront signalés dans l’application ou sur sa fiche App Store.' },
    ],
    footer: 'InvaderQuest est un projet indépendant, non officiel, non affilié à l’artiste Invader ni à FlashInvaders.',
  },

  en: {
    updatedLabel: 'Last updated',
    updated: 'July 2026',
    intro: 'InvaderQuest is an independent app for spotting Space Invader mosaics. This page explains what data the app handles.',
    summaryTitle: 'In short',
    summary: 'No account, no server, no ads, no tracking. Your data (flashed Invaders, profile, badges, stats) stays on your device. Only the data needed for routing and address search is sent to our mapping providers.',
    sections: [
      { title: 'Publisher & contact', body: `InvaderQuest is an independent project published by its developer. Any question: ${CONTACT}.` },
      { title: 'No account, no server', body: 'The app has no account and no server about you. No personal data is collected on our infrastructure. There are no ads, trackers or analytics.' },
      { title: 'Locally stored data', body: 'Stored only on your device: flashed Invaders and their date, your profile (nickname, avatar, optional photo), your badges and sessions, and your preferences (filters, theme, language, settings). This data is removed if you uninstall the app or clear its data.' },
      { title: 'Location', body: 'Your location is used to place you on the map, compute routes and alert you near an Invader. Background permission is optional and only requested if you enable Stroll mode; it enables alerts even when the app is closed and can be turned off at any time. Your location is not stored on a server.' },
      { title: 'Third-party services', body: 'For some features the app contacts: Mapbox (address search — receives the typed text and an approximate location), OpenRouteService (routing — receives start and end points), GitHub (download of the public Invaders database, no personal data) and Expo (software updates, minimal technical data). These exchanges are limited to what is strictly necessary and are not used for advertising or profiling.' },
      { title: 'Notifications', body: 'Stroll-mode notifications are generated locally by your device. No push notifications or related identifiers are used.' },
      { title: 'Photos & camera', body: 'If you pick or take a photo as an avatar, it stays on your device and is neither sent nor shared automatically.' },
      { title: 'Image sharing', body: 'The share feature generates an image on your device and opens it in the phone’s share sheet. Only you decide to share it; the app posts nothing on your behalf.' },
      { title: 'Retention & deletion', body: 'As your data is local, it remains as long as the app is installed. To delete everything: uninstall the app or clear its data in system settings.' },
      { title: 'Security', body: 'Since data stays on your device, its security depends on your phone’s. Exchanges with third-party services use HTTPS (encrypted).' },
      { title: 'Children', body: 'The app is not specifically directed at children and does not knowingly collect any data about them.' },
      { title: 'Changes', body: 'This policy may change; the update date is shown at the top. Significant changes will be noted in the app or on its App Store page.' },
    ],
    footer: 'InvaderQuest is an independent, unofficial project, unaffiliated with the artist Invader or FlashInvaders.',
  },

  es: {
    updatedLabel: 'Última actualización',
    updated: 'julio de 2026',
    intro: 'InvaderQuest es una aplicación independiente para localizar los mosaicos Space Invader. Esta página explica qué datos maneja la aplicación.',
    summaryTitle: 'En resumen',
    summary: 'Sin cuenta, sin servidor, sin publicidad, sin rastreo. Tus datos (Invaders fotografiados, perfil, insignias, estadísticas) permanecen en tu dispositivo. Solo se envían a nuestros proveedores de mapas los datos necesarios para calcular rutas y buscar direcciones.',
    sections: [
      { title: 'Editor y contacto', body: `InvaderQuest es un proyecto independiente publicado por su desarrollador. Para cualquier consulta: ${CONTACT}.` },
      { title: 'Sin cuenta, sin servidor', body: 'La aplicación no crea cuenta ni tiene ningún servidor sobre ti. No se recopila ningún dato personal en nuestra infraestructura. No hay publicidad, rastreadores ni analítica.' },
      { title: 'Datos almacenados localmente', body: 'Se guardan únicamente en tu dispositivo: los Invaders fotografiados y su fecha, tu perfil (apodo, avatar, foto opcional), tus insignias y sesiones, y tus preferencias (filtros, tema, idioma, ajustes). Estos datos desaparecen si desinstalas la aplicación o borras sus datos.' },
      { title: 'Ubicación', body: 'Tu ubicación sirve para situarte en el mapa, calcular rutas y avisarte cerca de un Invader. El permiso en segundo plano es opcional y solo se solicita si activas el Modo paseo; permite avisos incluso con la app cerrada y puede desactivarse en cualquier momento. Tu ubicación no se guarda en ningún servidor.' },
      { title: 'Servicios de terceros', body: 'Para algunas funciones la app contacta con: Mapbox (búsqueda de direcciones — recibe el texto introducido y una ubicación aproximada), OpenRouteService (rutas — recibe los puntos de salida y llegada), GitHub (descarga de la base pública de Invaders, sin datos personales) y Expo (actualizaciones de software, datos técnicos mínimos). Estos intercambios se limitan a lo estrictamente necesario y no se usan para publicidad ni perfilado.' },
      { title: 'Notificaciones', body: 'Las notificaciones del Modo paseo las genera localmente tu dispositivo. No se usan notificaciones push ni identificadores asociados.' },
      { title: 'Fotos y cámara', body: 'Si eliges o tomas una foto como avatar, permanece en tu dispositivo y no se envía ni se comparte automáticamente.' },
      { title: 'Compartir imagen', body: 'La función de compartir genera una imagen en tu dispositivo y la abre en el menú de compartir del teléfono. Solo tú decides compartirla; la app no publica nada en tu nombre.' },
      { title: 'Conservación y eliminación', body: 'Al ser locales, tus datos permanecen mientras la app esté instalada. Para borrarlo todo: desinstala la app o borra sus datos en los ajustes del sistema.' },
      { title: 'Seguridad', body: 'Como los datos permanecen en tu dispositivo, su seguridad depende de la de tu teléfono. Los intercambios con servicios de terceros usan HTTPS (cifrado).' },
      { title: 'Menores', body: 'La aplicación no está dirigida específicamente a menores y no recopila conscientemente ningún dato sobre ellos.' },
      { title: 'Cambios', body: 'Esta política puede cambiar; la fecha de actualización aparece arriba. Los cambios importantes se indicarán en la app o en su ficha de la App Store.' },
    ],
    footer: 'InvaderQuest es un proyecto independiente, no oficial, no afiliado al artista Invader ni a FlashInvaders.',
  },

  it: {
    updatedLabel: 'Ultimo aggiornamento',
    updated: 'luglio 2026',
    intro: 'InvaderQuest è un’applicazione indipendente per individuare i mosaici Space Invader. Questa pagina spiega quali dati l’app gestisce.',
    summaryTitle: 'In breve',
    summary: 'Nessun account, nessun server, nessuna pubblicità, nessun tracciamento. I tuoi dati (Invader flashati, profilo, badge, statistiche) restano sul tuo dispositivo. Vengono inviati ai nostri fornitori di mappe solo i dati necessari al calcolo dei percorsi e alla ricerca di indirizzi.',
    sections: [
      { title: 'Editore e contatto', body: `InvaderQuest è un progetto indipendente pubblicato dal suo sviluppatore. Per qualsiasi domanda: ${CONTACT}.` },
      { title: 'Nessun account, nessun server', body: 'L’app non crea account e non ha alcun server che ti riguarda. Nessun dato personale viene raccolto sulla nostra infrastruttura. Non ci sono pubblicità, tracker o analisi.' },
      { title: 'Dati memorizzati localmente', body: 'Memorizzati solo sul tuo dispositivo: gli Invader flashati e la loro data, il tuo profilo (nickname, avatar, foto opzionale), i tuoi badge e sessioni, e le tue preferenze (filtri, tema, lingua, impostazioni). Questi dati spariscono se disinstalli l’app o ne cancelli i dati.' },
      { title: 'Posizione', body: 'La tua posizione serve a localizzarti sulla mappa, calcolare percorsi e avvisarti vicino a un Invader. L’autorizzazione in background è facoltativa e viene richiesta solo se attivi la Modalità passeggiata; consente avvisi anche ad app chiusa e può essere disattivata in qualsiasi momento. La tua posizione non viene salvata su alcun server.' },
      { title: 'Servizi di terze parti', body: 'Per alcune funzioni l’app contatta: Mapbox (ricerca indirizzi — riceve il testo digitato e una posizione approssimativa), OpenRouteService (percorsi — riceve i punti di partenza e arrivo), GitHub (download del database pubblico degli Invader, senza dati personali) ed Expo (aggiornamenti software, dati tecnici minimi). Questi scambi sono limitati allo stretto necessario e non sono usati per pubblicità o profilazione.' },
      { title: 'Notifiche', body: 'Le notifiche della Modalità passeggiata sono generate localmente dal tuo dispositivo. Non vengono usate notifiche push né identificatori associati.' },
      { title: 'Foto e fotocamera', body: 'Se scegli o scatti una foto come avatar, resta sul tuo dispositivo e non viene inviata né condivisa automaticamente.' },
      { title: 'Condivisione immagine', body: 'La funzione di condivisione genera un’immagine sul tuo dispositivo e la apre nel menu di condivisione del telefono. Solo tu decidi di condividerla; l’app non pubblica nulla a tuo nome.' },
      { title: 'Conservazione ed eliminazione', body: 'Essendo locali, i tuoi dati restano finché l’app è installata. Per cancellare tutto: disinstalla l’app o cancella i suoi dati nelle impostazioni di sistema.' },
      { title: 'Sicurezza', body: 'Poiché i dati restano sul tuo dispositivo, la loro sicurezza dipende da quella del telefono. Gli scambi con i servizi di terze parti usano HTTPS (cifrato).' },
      { title: 'Minori', body: 'L’app non è rivolta specificamente ai minori e non raccoglie consapevolmente alcun dato che li riguardi.' },
      { title: 'Modifiche', body: 'Questa informativa può cambiare; la data di aggiornamento è indicata in alto. Le modifiche importanti saranno segnalate nell’app o nella sua scheda App Store.' },
    ],
    footer: 'InvaderQuest è un progetto indipendente, non ufficiale, non affiliato all’artista Invader né a FlashInvaders.',
  },
};

export function getPrivacyPolicy(lang) {
  const key = (lang || 'fr').slice(0, 2);
  return PRIVACY_POLICY[key] ?? PRIVACY_POLICY.fr;
}
