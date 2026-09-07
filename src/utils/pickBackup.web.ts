import { MAX_BACKUP_SIZE_BYTES } from './backup';

export async function pickBackupJson(): Promise<string | null> {
  if (typeof document === 'undefined') return null;

  return new Promise<string | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    let resolved = false;

    input.onchange = async () => {
      resolved = true;
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      if (file.size > MAX_BACKUP_SIZE_BYTES) {
        reject(new Error('Backup file exceeds the 50 MiB size limit'));
        return;
      }

      try {
        const text = await file.text();
        resolve(text);
      } catch (e) {
        reject(e);
      }
    };

    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!resolved && (!input.files || input.files.length === 0)) {
            resolve(null);
          }
        }, 500);
      },
      { once: true }
    );

    input.click();
  });
}
