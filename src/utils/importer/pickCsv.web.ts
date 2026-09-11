const MAX_CSV_SIZE_BYTES = 50 * 1024 * 1024; // 50 MiB

export async function pickCsvFile(): Promise<{ name: string; content: string } | null> {
  if (typeof document === 'undefined') return null;

  return new Promise<{ name: string; content: string } | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/comma-separated-values,text/plain';

    let resolved = false;

    input.onchange = async () => {
      resolved = true;
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      if (file.size > MAX_CSV_SIZE_BYTES) {
        reject(new Error('CSV file exceeds the 50 MiB size limit'));
        return;
      }

      try {
        const text = await file.text();
        resolve({
          name: file.name,
          content: text,
        });
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
