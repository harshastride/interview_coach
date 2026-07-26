import { useState, useEffect, useCallback } from 'react';

export type AuthStatus = 'loading' | 'unauthenticated' | 'access_denied' | 'authenticated';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  isAllowed: boolean;
  requestStatus?: 'pending' | 'approved' | 'rejected';
}

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

const CACHE_KEY = 'stint-bootstrap-cache';

function getCachedBootstrap(): BootstrapData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cache valid for 5 minutes
    if (Date.now() - parsed._ts > 5 * 60 * 1000) return null;
    return parsed;
  } catch { return null; }
}

function setCachedBootstrap(data: BootstrapData) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, _ts: Date.now() })); }
  catch {}
}

interface BootstrapData {
  terms: { t: string; d: string; l: number; c: string }[];
  interview: { question: string; ideal_answer: string; role: string; company: string; category?: string }[];
}

export function useAuth() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);

  // Stale-while-revalidate: show cached data instantly, refresh in background
  useEffect(() => {
    const cached = getCachedBootstrap();
    if (cached) {
      // Instant render from cache
      setBootstrapData({ terms: cached.terms, interview: cached.interview });
    }

    fetch('/api/auth/bootstrap', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; user?: AuthUser; terms?: any[]; interview?: any[] }) => {
        if (data.authenticated && data.user?.isAllowed) {
          setCurrentUser(data.user);
          const bd = {
            terms: Array.isArray(data.terms) ? data.terms : [],
            interview: Array.isArray(data.interview) ? data.interview : [],
          };
          setBootstrapData(bd);
          setCachedBootstrap(bd);
          setAuthStatus('authenticated');
        } else if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          setAuthStatus('access_denied');
        } else {
          setAuthStatus('unauthenticated');
        }
      })
      .catch(() => setAuthStatus('unauthenticated'));
  }, []);

  // Establish an EventSource connection if access is denied, so the user lands on the home page automatically once approved (via server-sent events)
  useEffect(() => {
    if (authStatus !== 'access_denied') return;

    const eventSource = new EventSource('/api/auth/stream-status');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'approved') {
          // Re-fetch bootstrap data to fully load terms and interviews once allowed,
          // but do NOT change authStatus yet so the candidate sees the completed steps first
          fetch('/api/auth/bootstrap', {
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
          })
            .then((r) => r.json())
            .then((res: { authenticated?: boolean; user?: AuthUser; terms?: any[]; interview?: any[] }) => {
              if (res.authenticated && res.user?.isAllowed) {
                setCurrentUser(res.user);
                const bd = {
                  terms: Array.isArray(res.terms) ? res.terms : [],
                  interview: Array.isArray(res.interview) ? res.interview : [],
                };
                setBootstrapData(bd);
                setCachedBootstrap(bd);
              }
            })
            .catch(() => {});
        } else if (data.status === 'rejected') {
          setCurrentUser((prev) => prev ? { ...prev, requestStatus: 'rejected' } : null);
        }
      } catch (err) {
        console.error('Error parsing SSE event data:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE connection lost. Reconnecting...');
    };

    return () => {
      eventSource.close();
    };
  }, [authStatus]);

  const enterApp = useCallback(() => {
    setAuthStatus('authenticated');
  }, []);

  const handleLogout = useCallback(() => {
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: FETCH_HEADERS,
    }).then(() => {
      setAuthStatus('unauthenticated');
      setCurrentUser(null);
      window.location.href = '/';
    });
  }, []);

  return { authStatus, currentUser, handleLogout, bootstrapData, enterApp };
}
