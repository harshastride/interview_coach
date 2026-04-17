import { describe, it, expect } from 'vitest';
import { ALL_CATEGORIES, LEVEL_LABELS, CATEGORIES_BY_LEVEL } from '../../src/constants';

describe('Constants', () => {
  describe('ALL_CATEGORIES', () => {
    it('should have 24 categories', () => {
      expect(ALL_CATEGORIES).toHaveLength(24);
    });

    it('should contain expected categories', () => {
      expect(ALL_CATEGORIES).toContain('Cloud & Internet Basics');
      expect(ALL_CATEGORIES).toContain('Azure Basics');
      expect(ALL_CATEGORIES).toContain('Delta Lake');
      expect(ALL_CATEGORIES).toContain('Power BI & Reporting');
    });

    it('should have no duplicates', () => {
      const unique = new Set(ALL_CATEGORIES);
      expect(unique.size).toBe(ALL_CATEGORIES.length);
    });
  });

  describe('LEVEL_LABELS', () => {
    it('should have labels for levels 2-5', () => {
      expect(LEVEL_LABELS[2]).toBe('Beginner');
      expect(LEVEL_LABELS[3]).toBe('Elementary');
      expect(LEVEL_LABELS[4]).toBe('Intermediate');
      expect(LEVEL_LABELS[5]).toBe('Advanced');
    });
  });

  describe('CATEGORIES_BY_LEVEL', () => {
    it('should map levels to category arrays', () => {
      expect(CATEGORIES_BY_LEVEL[2]).toContain('Cloud & Internet Basics');
      expect(CATEGORIES_BY_LEVEL[3]).toContain('SQL Fundamentals');
      expect(CATEGORIES_BY_LEVEL[5]).toContain('Apache Spark Core');
    });

    it('should cover all categories', () => {
      const allFromLevels = Object.values(CATEGORIES_BY_LEVEL).flat();
      for (const cat of ALL_CATEGORIES) {
        expect(allFromLevels).toContain(cat);
      }
    });
  });
});
