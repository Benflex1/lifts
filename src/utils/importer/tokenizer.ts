/**
 * Sniffs the delimiter from raw CSV text.
 * Checks comma, semicolon, and tab characters outside of quotes across initial lines.
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 5);
  if (lines.length === 0) return ',';

  const candidates = [',', ';', '\t'];
  let bestDelimiter = ',';
  let maxConsistentCount = 0;

  for (const delim of candidates) {
    let counts: number[] = [];
    for (const line of lines) {
      let count = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delim && !inQuotes) {
          count++;
        }
      }
      counts.push(count);
    }

    // A good delimiter has count > 0 on the header row and consistent counts
    const headerCount = counts[0] || 0;
    if (headerCount > maxConsistentCount) {
      maxConsistentCount = headerCount;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Parses raw CSV text into a 2D array of string cells according to RFC 4180.
 * Accurately handles:
 * - auto-detected or specified delimiters (comma, semicolon, tab)
 * - double-quoted fields with embedded delimiters
 * - double-quoted fields with embedded newlines
 * - escaped double-quotes ("")
 * - UTF-8 Byte Order Mark (BOM) stripping
 */
export function tokenizeCsv(text: string, customDelimiter?: string): string[][] {
  if (!text) return [];

  // Strip UTF-8 BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }

  const delimiter = customDelimiter || detectDelimiter(cleanText);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && cleanText[i + 1] === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i += 2;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if (char === '\r') {
        if (i + 1 < len && cleanText[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Push final field and row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Remove completely empty rows from the end
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 0 || (last.length === 1 && last[0].trim() === '')) {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}
