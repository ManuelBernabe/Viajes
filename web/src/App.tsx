import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './app/ErrorBoundary';
import { Layout } from './app/Layout';
import { SessionProvider, useSession } from './app/SessionContext';
import { LoginPage } from './auth/LoginPage';
import { DiagPage } from './diag/DiagPage';
import { AttachmentViewerPage } from './pages/AttachmentViewerPage';
import { BookingFormPage } from './pages/BookingFormPage';
import { BookingPage } from './pages/BookingPage';
import { GuidePage } from './pages/GuidePage';
import { TodayPage } from './pages/TodayPage';
import { TripsPage } from './pages/TripsPage';
import { HelpChatPage } from './pages/HelpChatPage';
import { DocumentFormPage } from './pages/DocumentFormPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { InboxItemPage } from './pages/InboxItemPage';
import { InboxPage } from './pages/InboxPage';
import { InvitationPage } from './pages/InvitationPage';
import { PlacesPage } from './pages/PlacesPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { QrPage } from './pages/QrPage';
import { SettingsPage } from './pages/SettingsPage';
import { TripFormPage } from './pages/TripFormPage';
import { TripPage } from './pages/TripPage';
import { UpdatePrompt } from './UpdatePrompt';
import { AppLock } from './lock/AppLock';
import { ScrollButtons } from './components/ScrollButtons';
import './app/theme.css';
import { t } from './i18n';

/** Con el desplazamiento en un contenedor interior, cada pantalla nueva empieza arriba (el navegador ya no lo hace solo). */
function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    document.querySelector('.shell > .scroll')?.scrollTo({ top: 0 });
  }, [location.pathname]);
  return null;
}

function Gate() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') {
    return <main className="page no-tabs center muted">{t('Abriendo…')}</main>;
  }
  // El enlace de invitación, el de cambiar la contraseña y la guía se abren con o sin sesión: la propia página decide qué pedir.
  if (
    location.pathname.startsWith('/invitacion/') ||
    location.pathname.startsWith('/restablecer/') ||
    (location.pathname === '/guia' && session.status !== 'in')
  ) {
    return (
      <Routes>
        <Route path="/invitacion/:token" element={<InvitationPage />} />
        <Route path="/restablecer/:userId/:token" element={<ResetPasswordPage />} />
        <Route path="/guia" element={<GuidePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  if (session.status === 'out') {
    return <LoginPage />;
  }
  return (
    <>
      <AppLock />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TodayPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/new" element={<TripFormPage />} />
          <Route path="/trips/:tripId" element={<TripPage />} />
          <Route path="/trips/:tripId/edit" element={<TripFormPage />} />
          <Route path="/trips/:tripId/places" element={<PlacesPage />} />
          <Route path="/trips/:tripId/bookings/new" element={<BookingFormPage />} />
          <Route path="/bookings/:bookingId" element={<BookingPage />} />
          <Route path="/bookings/:bookingId/edit" element={<BookingFormPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/guia" element={<GuidePage />} />
          <Route path="/ayuda" element={<HelpChatPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/inbox/:itemId" element={<InboxItemPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/new" element={<DocumentFormPage />} />
          <Route path="/documents/:documentId" element={<DocumentFormPage />} />
        </Route>
        <Route path="/bookings/:bookingId/qr" element={<QrPage />} />
        <Route path="/attachments/:attachmentId" element={<AttachmentViewerPage />} />
        <Route path="/diag" element={<DiagPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ErrorBoundary>
          <div className="shell">
            <div className="scroll">
              <ScrollToTop />
              <Gate />
            </div>
            <ScrollButtons />
          </div>
        </ErrorBoundary>
        <UpdatePrompt />
      </SessionProvider>
    </BrowserRouter>
  );
}
