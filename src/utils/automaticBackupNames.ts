const BACKUP_FILE_NAME = /^lifts-backup-(\d{17})\.json$/i;

// SAF lists percent-encoded content URIs, so decode the whole URI before taking the file name.
export function backupTimestampFromUri(uri: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return null;
  }
  const fileName = decoded.slice(decoded.lastIndexOf('/') + 1);
  return fileName.match(BACKUP_FILE_NAME)?.[1] ?? null;
}
