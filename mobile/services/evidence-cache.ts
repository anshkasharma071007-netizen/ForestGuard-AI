import { uuid } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';

let cache: Directory | undefined;

export async function cacheEvidence(bytes: Uint8Array) {
  if (!cache) {
    const directory = new Directory(Paths.cache, 'citizen-evidence');
    // Clear previews left behind if the previous app process was terminated.
    if (directory.exists) directory.delete();
    directory.create();
    cache = directory;
  }
  const file = new File(cache, uuid.v4());
  try {
    await file.write(bytes);
    return { uri: file.uri, release: () => removeEvidence(file) };
  } catch (error) {
    removeEvidence(file);
    throw error;
  }
}

function removeEvidence(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    if (__DEV__) console.warn('Could not remove a temporary photograph preview.');
  }
}
