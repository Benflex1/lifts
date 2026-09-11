/**
 * Month names mapping for textual dates (e.g. "15 Jul 2024, 09:30").
 */
const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Robustly parses a date/time string from various fitness trackers into a standard ISO 8601 string.
 * Supports:
 * - ISO timestamps: "2024-03-15T10:30:00.000Z", "2024-03-15 10:30:00"
 * - Hevy / textual: "15 Jul 2024, 09:30", "Jul 15, 2024, 9:30 AM"
 * - European dot: "15.03.2024 10:30", "15.03.2024"
 * - Slash formats: "15/03/2024 10:30", "03/15/2024 10:30"
 * - FitNotes date-only: "2024-07-01"
 */
export function parseWorkoutDate(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) {
    return new Date().toISOString();
  }

  const raw = dateStr.trim();

  // 1. Direct native parse attempt (works for standard ISO, RFC2822, and some textual formats)
  const nativeTimestamp = Date.parse(raw);
  if (!Number.isNaN(nativeTimestamp)) {
    return new Date(nativeTimestamp).toISOString();
  }

  // 2. Textual format with month name: "15 Jul 2024, 09:30" or "Jul 15, 2024, 09:30"
  const textMatch = raw.match(
    /(?:(\d{1,2})\s+([a-zA-Z]+)|([a-zA-Z]+)\s+(\d{1,2})),?\s+(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?/i
  );
  if (textMatch) {
    const day = parseInt(textMatch[1] || textMatch[4], 10);
    const monthStr = (textMatch[2] || textMatch[3]).toLowerCase();
    const year = parseInt(textMatch[5], 10);
    let hour = textMatch[6] ? parseInt(textMatch[6], 10) : 10;
    const min = textMatch[7] ? parseInt(textMatch[7], 10) : 0;
    const sec = textMatch[8] ? parseInt(textMatch[8], 10) : 0;
    const ampm = textMatch[9]?.toLowerCase();

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    const month = MONTH_MAP[monthStr];
    if (month !== undefined) {
      const d = new Date(Date.UTC(year, month, day, hour, min, sec));
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
  }

  // 3. Dot format: "15.03.2024 10:30" or "15.03.2024"
  const dotMatch = raw.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10) - 1;
    const year = parseInt(dotMatch[3], 10);
    const hour = dotMatch[4] ? parseInt(dotMatch[4], 10) : 10;
    const min = dotMatch[5] ? parseInt(dotMatch[5], 10) : 0;
    const sec = dotMatch[6] ? parseInt(dotMatch[6], 10) : 0;
    const d = new Date(Date.UTC(year, month, day, hour, min, sec));
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // 4. Slash format: could be DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (slashMatch) {
    let partA = parseInt(slashMatch[1], 10);
    let partB = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    const hour = slashMatch[4] ? parseInt(slashMatch[4], 10) : 10;
    const min = slashMatch[5] ? parseInt(slashMatch[5], 10) : 0;
    const sec = slashMatch[6] ? parseInt(slashMatch[6], 10) : 0;

    // If partA > 12, it must be day
    let day = partA;
    let month = partB - 1;
    if (partA <= 12 && partB > 12) {
      // partB must be day
      day = partB;
      month = partA - 1;
    }

    const d = new Date(Date.UTC(year, month, day, hour, min, sec));
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // 5. Fallback to current date
  return new Date().toISOString();
}

/**
 * Parses workout duration strings into total seconds.
 * Supports:
 * - "1h 15m", "1h 15m 30s", "45m", "1h"
 * - HH:MM:SS, MM:SS ("01:15:30", "45:00")
 * - Numeric strings ("3600" -> 3600, "45" -> 2700 if interpreted as minutes)
 */
export function parseDurationSeconds(
  str?: string | null,
  unitHint?: 'seconds' | 'minutes' | 'auto'
): number {
  if (!str || !str.trim()) return 3600; // default 1 hour
  const raw = str.trim();

  // Pure digits: check unit hint first
  if (/^\d+$/.test(raw)) {
    const num = parseInt(raw, 10);
    if (unitHint === 'seconds') return num;
    if (unitHint === 'minutes') return num * 60;
    // Default auto heuristic: if small (< 300), treat as minutes; otherwise seconds
    return num > 300 ? num : num * 60;
  }

  // Clock format: "01:15:00" or "45:00"
  if (/^\d+:\d+(:\d+)?$/.test(raw)) {
    const parts = raw.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }

  // Textual: "1h 15m 30s"
  let total = 0;
  const hours = raw.match(/(\d+)\s*h/i);
  const mins = raw.match(/(\d+)\s*m/i);
  const secs = raw.match(/(\d+)\s*s/i);

  if (hours) total += parseInt(hours[1], 10) * 3600;
  if (mins) total += parseInt(mins[1], 10) * 60;
  if (secs) total += parseInt(secs[1], 10);

  return total > 0 ? total : 3600;
}
