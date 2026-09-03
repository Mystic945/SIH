import { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { I18nProvider } from '@/i18n';
import { Navbar } from '@/components/Navbar';
import { Footer, LoadingState } from '@/components/shared';
import { ScrollProgress } from '@/components/ui/motion-primitives';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import StaffLogin from '@/pages/StaffLogin';
import Centres from '@/pages/Centres';
import CentreSchedule from '@/pages/CentreSchedule';
import BookSlot from '@/pages/BookSlot';
import MyTokens from '@/pages/MyTokens';
import TokenTracker from '@/pages/TokenTracker';
import TrackLookup from '@/pages/TrackLookup';
import Grievances from '@/pages/Grievances';
import Alerts from '@/pages/Alerts';
import Profile from '@/pages/Profile';
import Transparency from '@/pages/Transparency';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminSchedule from '@/pages/admin/AdminSchedule';
import AdminGrievances from '@/pages/admin/AdminGrievances';
import AdminAnalytics from '@/pages/admin/AdminAnalytics';

/** Blocks a route until auth resolves, then redirects by role. */
function Protected({
  children,
  role,
}: {
  children: JSX.Element;
  role: 'FARMER' | 'STAFF';
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState />;
  if (!user) {
    return <Navigate to={role === 'STAFF' ? '/staff-login' : '/login'} state={{ from: location }} replace />;
  }
  if (role === 'FARMER' && user.role !== 'FARMER') return <Navigate to="/admin" replace />;
  if (role === 'STAFF' && user.role === 'FARMER') return <Navigate to="/my-tokens" replace />;

  return children;
}

/**
 * React Router keeps the previous scroll offset across navigations, which lands
 * the user halfway down a fresh page. Jump to the top on every route change.
 * `behavior: 'auto'` overrides the global smooth scrolling, which would
 * otherwise animate the whole page height on each transition.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

/**
 * Page transitions.
 *
 * AnimatePresence only tracks its DIRECT children, so the keyed motion element
 * must wrap <Routes> rather than sit inside each route. With `mode="wait"` and a
 * non-motion direct child, the outgoing tree never reports its exit and the
 * incoming route never mounts — the URL changes while the old page stays on
 * screen. Keeping the motion.main here is what makes route changes actually
 * render.
 */
function AppRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="min-h-[70vh]"
      >
        <Routes location={location}>
          {/* ---- public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/staff-login" element={<StaffLogin />} />
          <Route path="/centres" element={<Centres />} />
          <Route path="/centres/:id" element={<CentreSchedule />} />
          <Route path="/track" element={<TrackLookup />} />
          <Route path="/track/:tokenCode" element={<TrackLookup />} />
          <Route path="/transparency" element={<Transparency />} />

          {/* ---- farmer */}
          <Route path="/book" element={<Protected role="FARMER"><BookSlot /></Protected>} />
          <Route path="/my-tokens" element={<Protected role="FARMER"><MyTokens /></Protected>} />
          <Route path="/tokens/:id" element={<Protected role="FARMER"><TokenTracker /></Protected>} />
          <Route path="/grievances" element={<Protected role="FARMER"><Grievances /></Protected>} />
          <Route path="/alerts" element={<Protected role="FARMER"><Alerts /></Protected>} />
          <Route path="/profile" element={<Protected role="FARMER"><Profile /></Protected>} />

          {/* ---- centre staff */}
          <Route path="/admin" element={<Protected role="STAFF"><AdminDashboard /></Protected>} />
          <Route path="/admin/schedule" element={<Protected role="STAFF"><AdminSchedule /></Protected>} />
          <Route path="/admin/grievances" element={<Protected role="STAFF"><AdminGrievances /></Protected>} />
          <Route path="/admin/analytics" element={<Protected role="STAFF"><AdminAnalytics /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.main>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <ScrollToTop />
          <ScrollProgress />
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <div className="flex-1">
              <Suspense fallback={<LoadingState />}>
                <AppRoutes />
              </Suspense>
            </div>
            <Footer />
          </div>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3800,
              style: {
                borderRadius: '0.85rem',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--card-foreground))',
                border: '1px solid hsl(var(--border))',
                fontWeight: 500,
                maxWidth: '30rem',
              },
            }}
          />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
