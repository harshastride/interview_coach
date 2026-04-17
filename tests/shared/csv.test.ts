import { describe, it, expect } from 'vitest';
import { parseCSV } from '../../src/lib/csv';

describe('parseCSV', () => {
  it('should parse simple CSV', () => {
    const result = parseCSV('a,b,c\n1,2,3');
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('should handle quoted fields with commas', () => {
    const result = parseCSV('"hello, world",test');
    expect(result).toEqual([['hello, world', 'test']]);
  });

  it('should trim whitespace', () => {
    const result = parseCSV(' a , b , c ');
    expect(result).toEqual([['a', 'b', 'c']]);
  });

  it('should handle empty input', () => {
    const result = parseCSV('');
    expect(result).toEqual([['']]);
  });

  it('should handle multiple rows', () => {
    const result = parseCSV('term,definition,level,category\nDelta Lake,Storage layer,5,Delta Lake');
    expect(result).toHaveLength(2);
    expect(result[1][0]).toBe('Delta Lake');
  });
});
