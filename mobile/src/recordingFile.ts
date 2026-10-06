import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Delete the temporary recording from the phone. It is a child's or a parent's voice, so it should not
 * stay in the phone's cache after it was uploaded or thrown away. Never throws.
 * (On the web the recording is a temporary address in the browser, which is released instead.)
 */
export function discardRecordingFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    if (Platform.OS === 'web') {
      URL.revokeObjectURL(uri);
      return;
    }
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* it is already gone, or the phone does not let us. Nothing else to do */
  }
}
