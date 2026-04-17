import { useState, useEffect, useCallback } from 'react';

export type AuthStatus = 'loading' | 'unauthenticated' | 'access_denied' | 'authenticated';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  isAllowed: boolean;
}

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

export function useAuth() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  // Check session on mount
  useEffect(() => {
    fetch('/api/auth/me', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; user?: AuthUser }) => {
        if (data.authenticated && data.user?.isAllowed) {
          setCurrentUser(data.user);
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

  return { authStatus, currentUser, handleLogout };
}
