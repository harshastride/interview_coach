/** Parse a CSV string into a 2D array of trimmed strings. Handles quoted fields. */
export function parseCSV(text: string): string[][] {
  return text
    .trim()
    .split('\n')
    .map((line) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else current += char;
      }
      result.push(current.trim());
      return result;
    });
}
