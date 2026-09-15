import { setAccessScope } from '../lib/accessScope';
import { useState, useEffect, useCallback } from 'react';

export type AuthStatus = 'loading' | 'unauthenticated' | 'access_denied' | 'authenticated';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  isAllowed: boolean;
  domainId?: number;
  domainName?: string;
  accessScope?: string;
  request?: { status:string;domain_id:number;domain_name:string } | null;
}

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

interface BootstrapData {
  terms: { id?: number; t: string; d: string; l: number; c: string }[];
  interview: { question: string; ideal_answer: string; role: string; company: string; category?: string }[];
}

export function useAuth() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);

  // Stale-while-revalidate: show cached data instantly, refresh in background
  useEffect(() => {
    sessionStorage.removeItem('stint-bootstrap-cache');
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
          setAccessScope(data.user.accessScope??'');
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

  const handleLogout = useCallback(() => {
    setAccessScope('');
    sessionStorage.removeItem('stint-bootstrap-cache');
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

  return { authStatus, currentUser, handleLogout, bootstrapData };
}
