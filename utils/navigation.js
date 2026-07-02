import { Linking, Platform } from 'react-native';

export async function openNavigationApp(app, lat, lng) {
  // Android : « Apple Plans » n'existe pas → Google Maps (natif puis repli web).
  if (Platform.OS === 'android') {
    Linking.openURL(`google.navigation:q=${lat},${lng}&mode=w`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`).catch(() => {}),
    );
    return;
  }
  if (app === 'apple') {
    Linking.openURL(`maps://?daddr=${lat},${lng}&dirflg=w`).catch(() => {});
  } else {
    const canUseNative = await Linking.canOpenURL('comgooglemaps://');
    const url = canUseNative
      ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=walking`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    Linking.openURL(url).catch(() => {});
  }
}

export async function openInstagramTag(id) {
  if (!id || !/^[\w]+$/.test(id)) return;
  const appUrl = `instagram://tag?name=${id}`;
  const webUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(id)}/`;
  const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
  Linking.openURL(canOpen ? appUrl : webUrl).catch(() => Linking.openURL(webUrl));
}
