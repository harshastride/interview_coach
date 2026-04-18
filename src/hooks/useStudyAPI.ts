import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../views/shared';

export interface CardReview {
  term_slug: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  last_rating: number | null;
}

export interface StreakData {
  current_streak: number;
  today_cards: number;
  today_quiz: number;
  today_time_sec: number;
  recent_activity: { activity_date: string; cards_studied: number; quiz_answered: number }[];
}

export interface Bookmark {
  term_slug: string;
  created_at: string;
}

// ── Spaced repetition ──
export function useCardReviews() {
  const [reviews, setReviews] = useState<CardReview[]>([]);
  const [dueCards, setDueCards] = useState<CardReview[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [all, due] = await Promise.all([
        fetchJson<CardReview[]>('/api/study/all-reviews'),
        fetchJson<CardReview[]>('/api/study/due-cards'),
      ]);
      setReviews(all);
      setDueCards(due);
    } catch { /* ignore */ }
  }, []);

  const submitReview = useCallback(async (term_slug: string, rating: number) => {
    try {
      await fetchJson('/api/study/review', {
        method: 'POST',
        body: JSON.stringify({ term_slug, rating }),
      });
      // Refresh reviews after submission
      fetchAll();
    } catch { /* ignore */ }
  }, [fetchAll]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { reviews, dueCards, submitReview, refreshReviews: fetchAll };
}

// ── Streaks ──
export function useStreaks() {
  const [streakData, setStreakData] = useState<StreakData | null>(null);

  const fetchStreaks = useCallback(async () => {
    try {
      const data = await fetchJson<StreakData>('/api/study/streaks');
      setStreakData(data);
    } catch { /* ignore */ }
  }, []);

  const recordActivity = useCallback(async (cards: number, quiz: number, timeSec: number) => {
    try {
      await fetchJson('/api/study/activity', {
        method: 'POST',
        body: JSON.stringify({ cards_studied: cards, quiz_answered: quiz, time_spent_sec: timeSec }),
      });
      fetchStreaks();
    } catch { /* ignore */ }
  }, [fetchStreaks]);

  useEffect(() => { fetchStreaks(); }, [fetchStreaks]);

  return { streakData, recordActivity, refreshStreaks: fetchStreaks };
}

// ── Bookmarks ──
export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkedSlugs, setBookmarkedSlugs] = useState<Set<string>>(new Set());

  const fetchBookmarks = useCallback(async () => {
    try {
      const data = await fetchJson<Bookmark[]>('/api/study/bookmarks');
      setBookmarks(data);
      setBookmarkedSlugs(new Set(data.map((b) => b.term_slug)));
    } catch { /* ignore */ }
  }, []);

  const toggleBookmark = useCallback(async (term_slug: string) => {
    try {
      const result = await fetchJson<{ bookmarked: boolean }>('/api/study/bookmarks', {
        method: 'POST',
        body: JSON.stringify({ term_slug }),
      });
      setBookmarkedSlugs((prev) => {
        const next = new Set(prev);
        if (result.bookmarked) next.add(term_slug);
        else next.delete(term_slug);
        return next;
      });
      fetchBookmarks();
    } catch { /* ignore */ }
  }, [fetchBookmarks]);

  useEffect(() => { fetchBookmarks(); }, [fetchBookmarks]);

  return { bookmarks, bookmarkedSlugs, toggleBookmark, refreshBookmarks: fetchBookmarks };
}

// ── Session State Persistence ──
export function useSessionState<T>(module: string) {
  const [state, setState] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const data = await fetchJson<T | null>(`/api/study/session-state/${module}`);
      setState(data);
    } catch { /* ignore */ }
    setLoaded(true);
  }, [module]);

  const saveState = useCallback(async (newState: T) => {
    try {
      await fetchJson(`/api/study/session-state/${module}`, {
        method: 'PUT',
        body: JSON.stringify(newState),
      });
    } catch { /* ignore */ }
  }, [module]);

  const clearState = useCallback(async () => {
    try {
      await fetchJson(`/api/study/session-state/${module}`, { method: 'DELETE' });
      setState(null);
    } catch { /* ignore */ }
  }, [module]);

  useEffect(() => { loadState(); }, [loadState]);

  return { state, loaded, saveState, clearState };
}
