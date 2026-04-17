import { describe, it, expect } from 'vitest';
import { slug, uniqueId } from '../../src/lib/slug';

describe('slug', () => {
  it('should convert text to lowercase slug', () => {
    expect(slug('Delta Lake')).toBe('delta-lake');
  });

  it('should remove parentheses', () => {
    expect(slug('Virtual Machine (VM)')).toBe('virtual-machine-vm');
  });

  it('should handle special characters', () => {
    expect(slug('ETL & Data Integration')).toBe('etl-data-integration');
  });

  it('should trim leading/trailing hyphens', () => {
    expect(slug('---test---')).toBe('test');
  });

  it('should limit to 80 characters', () => {
    const long = 'a'.repeat(100);
    expect(slug(long).length).toBeLessThanOrEqual(80);
  });

  it('should return "term" for empty input', () => {
    expect(slug('')).toBe('term');
  });
});

describe('uniqueId', () => {
  it('should return slug when not seen', () => {
    const seen = new Set<string>();
    expect(uniqueId('Delta Lake', seen)).toBe('delta-lake');
    expect(seen.has('delta-lake')).toBe(true);
  });

  it('should append counter for duplicates', () => {
    const seen = new Set<string>(['delta-lake']);
    expect(uniqueId('Delta Lake', seen)).toBe('delta-lake-1');
  });

  it('should handle multiple duplicates', () => {
    const seen = new Set<string>(['delta-lake', 'delta-lake-1']);
    expect(uniqueId('Delta Lake', seen)).toBe('delta-lake-2');
  });
});
