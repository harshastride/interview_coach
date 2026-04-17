import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useDarkMode } from './hooks/useDarkMode';
import { Loader2 } from 'lucide-react';
import type { InterviewEntry } from './constants';

// Lazy-loaded views for code splitting
const HomeScreen = React.lazy(() => import('./views/HomeScreen'));
const LoginScreen = React.lazy(() => import('./views/LoginScreen'));
const AccessDeniedScreen = React.lazy(() => import('./views/AccessDeniedScreen'));
const FlashcardSetup = React.lazy(() => import('./views/FlashcardSetup'));
const FlashcardStudy = React.lazy(() => import('./views/FlashcardStudy'));
const InterviewSetup = React.lazy(() => import('./views/InterviewSetup'));
const InterviewSession = React.lazy(() => import('./views/InterviewSession'));

function LoadingSpinner() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-[var(--stint-bg)]">
      <Loader2 className="w-10 h-10 animate-spin text-[var(--stint-primary)]" />
      <p className="mt-4 text-sm text-[var(--stint-text-muted)]">Loading&hellip;</p>
    </div>
  );
}

export default function App() {
  const { authStatus, currentUser, handleLogout } = useAuth();
  // Dark mode must be initialized at the app level so it works on all pages
  useDarkMode();

  // Uploaded content state (fetched when authenticated)
  const [uploadedTermsRaw, setUploadedTermsRaw] = useState<{ t: string; d: string; l: number; c: string }[]>([]);
  const [uploadedInterviewRaw, setUploadedInterviewRaw] = useState<InterviewEntry[]>([]);

  // Fetch uploaded content on auth
  const refreshUploadedContent = useCallback(() => {
    fetch('/api/content/terms', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then((r) => r.json())
      .then((list: { t: string; d: string; l: number; c: string }[]) =>
        setUploadedTermsRaw(Array.isArray(list) ? list : []),
      )
      .catch(() => setUploadedTermsRaw([]));

    fetch('/api/content/interview', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then((r) => r.json())
      .then((list: (InterviewEntry & { category?: string })[]) =>
        setUploadedInterviewRaw(
          Array.isArray(list)
            ? list.map((e) => ({ ...e, category: e.category ?? 'General' }))
            : [],
        ),
      )
      .catch(() => setUploadedInterviewRaw([]));
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') refreshUploadedContent();
  }, [authStatus, refreshUploadedContent]);

  // Loading state
  if (authStatus === 'loading') return <LoadingSpinner />;

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {authStatus === 'unauthenticated' && (
            <Route path="*" element={<LoginScreen />} />
          )}
          {authStatus === 'access_denied' && (
            <Route
              path="*"
              element={<AccessDeniedScreen user={currentUser} onLogout={handleLogout} />}
            />
          )}
          {authStatus === 'authenticated' && (
            <>
              <Route
                path="/"
                element={
                  <HomeScreen
                    currentUser={currentUser}
                    onContentRefresh={refreshUploadedContent}
                    uploadedTermsRaw={uploadedTermsRaw}
                    uploadedInterviewRaw={uploadedInterviewRaw}
                  />
                }
              />
              <Route
                path="/flashcards"
                element={
                  <FlashcardSetup
                    uploadedTermsRaw={uploadedTermsRaw}
                    currentUser={currentUser}
                    onContentRefresh={refreshUploadedContent}
                  />
                }
              />
              <Route
                path="/flashcards/study"
                element={
                  <FlashcardStudy
                    uploadedTermsRaw={uploadedTermsRaw}
                    currentUser={currentUser}
                    onContentRefresh={refreshUploadedContent}
                  />
                }
              />
              <Route
                path="/quiz"
                element={
                  <FlashcardSetup
                    uploadedTermsRaw={uploadedTermsRaw}
                    currentUser={currentUser}
                    onContentRefresh={refreshUploadedContent}
                    homeChoice="quiz"
                  />
                }
              />
              <Route
                path="/quiz/study"
                element={
                  <FlashcardStudy
                    uploadedTermsRaw={uploadedTermsRaw}
                    currentUser={currentUser}
                    onContentRefresh={refreshUploadedContent}
                    homeChoice="quiz"
                  />
                }
              />
              <Route
                path="/interview"
                element={
                  <InterviewSetup
                    uploadedInterviewRaw={uploadedInterviewRaw}
                    currentUser={currentUser}
                    onContentRefresh={refreshUploadedContent}
                  />
                }
              />
              <Route
                path="/interview/session"
                element={
                  <InterviewSession
                    uploadedInterviewRaw={uploadedInterviewRaw}
                    currentUser={currentUser}
                    onContentRefresh={refreshUploadedContent}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
