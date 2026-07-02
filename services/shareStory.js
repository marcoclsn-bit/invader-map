// services/shareStory.js — capture du visuel 9:16 en PNG + partage natif.
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { STORY_W, STORY_H } from '../components/share/ShareStory';

/**
 * Capture la vue référencée et ouvre la feuille de partage native.
 * @param ref  ref de <ShareStory>
 * @returns {Promise<'shared'|'unavailable'|'error'>}
 */
export async function captureAndShare(ref) {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    // upscale ×3 → ~1080×1920 pour une story nette
    const uri = await captureRef(ref, {
      format: 'png', quality: 1, result: 'tmpfile',
      width: STORY_W * 3, height: STORY_H * 3,
    });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'InvaderQuest' });
    return 'shared';
  } catch (e) {
    __DEV__ && console.log('[ShareStory] erreur :', e?.message);
    return 'error';
  }
}
