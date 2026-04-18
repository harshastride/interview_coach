import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useDarkMode } from './hooks/useDarkMode';
import { Loader2 } from 'lucide-react';
import type { InterviewEntry } from './constants';
import Sidebar from './components/Sidebar';
import AdminPanel from './components/AdminPanel';

// Lazy-loaded views — prefetch on idle for instant navigation
const homeImport = () => import('./views/HomeScreen');
const flashcardSetupImport = () => import('./views/FlashcardSetup');
const flashcardStudyImport = () => import('./views/FlashcardStudy');
const interviewSetupImport = () => import('./views/InterviewSetup');
const interviewSessionImport = () => import('./views/InterviewSession');

const HomeScreen = React.lazy(homeImport);
const LoginScreen = React.lazy(() => import('./views/LoginScreen'));
const AccessDeniedScreen = React.lazy(() => import('./views/AccessDeniedScreen'));
const FlashcardSetup = React.lazy(flashcardSetupImport);
const FlashcardStudy = React.lazy(flashcardStudyImport);
const InterviewSetup = React.lazy(interviewSetupImport);
const InterviewSession = React.lazy(interviewSessionImport);

// Prefetch all routes after initial load (during idle time)
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    requestIdleCallback?.(() => {
      flashcardSetupImport();
      interviewSetupImport();
      flashcardStudyImport();
      interviewSessionImport();
    });
  }, { once: true });
}

function LoadingSpinner() {
  return (
    <div className="h-screen flex items-center justify-center bg-[var(--stint-bg)]">
      <div className="w-8 h-8 border-3 border-[var(--stint-border)] border-t-[var(--stint-primary)] rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const { authStatus, currentUser, handleLogout, bootstrapData } = useAuth();
  useDarkMode();

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [uploadedTermsRaw, setUploadedTermsRaw] = useState<{ t: string; d: string; l: number; c: string }[]>([]);
  const [uploadedInterviewRaw, setUploadedInterviewRaw] = useState<InterviewEntry[]>([]);

  // Use bootstrap data (arrives with auth — no extra round trips)
  useEffect(() => {
    if (bootstrapData) {
      setUploadedTermsRaw(bootstrapData.terms);
      setUploadedInterviewRaw(
        bootstrapData.interview.map((e) => ({ ...e, category: e.category ?? 'General' })),
      );
    }
  }, [bootstrapData]);

  // Manual refresh (for admin uploads) — still uses separate calls
  const refreshUploadedContent = useCallback(() => {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    const opts = { credentials: 'include' as const, headers };
    Promise.all([
      fetch('/api/content/terms', opts).then((r) => r.json()).catch(() => []),
      fetch('/api/content/interview', opts).then((r) => r.json()).catch(() => []),
    ]).then(([terms, interview]) => {
      setUploadedTermsRaw(Array.isArray(terms) ? terms : []);
      setUploadedInterviewRaw(
        Array.isArray(interview)
          ? interview.map((e: InterviewEntry & { category?: string }) => ({ ...e, category: e.category ?? 'General' }))
          : [],
      );
    });
  }, []);

  // Loading state
  if (authStatus === 'loading') return <LoadingSpinner />;

  return (
    <BrowserRouter>
      {/* Sidebar + AdminPanel render outside Routes (they're not route elements) */}
      {authStatus === 'authenticated' && (
        <>
          <Sidebar
            currentUser={currentUser}
            canUpload={currentUser?.role === 'admin' || currentUser?.role === 'manager'}
            onLogout={handleLogout}
            onOpenAdmin={() => setShowAdminPanel(true)}
          />
          {showAdminPanel && (
            <AdminPanel
              onClose={() => setShowAdminPanel(false)}
              currentUser={currentUser}
              onContentRefresh={refreshUploadedContent}
            />
          )}
        </>
      )}
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
