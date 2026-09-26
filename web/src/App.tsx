import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './app/Layout';
import { SessionProvider, useSession } from './app/SessionContext';
import { LoginPage } from './auth/LoginPage';
import { DiagPage } from './diag/DiagPage';
import { AttachmentViewerPage } from './pages/AttachmentViewerPage';
import { BookingFormPage } from './pages/BookingFormPage';
import { BookingPage } from './pages/BookingPage';
import { GuidePage } from './pages/GuidePage';
import { HomePage } from './pages/HomePage';
import { InboxItemPage } from './pages/InboxItemPage';
import { InboxPage } from './pages/InboxPage';
import { InvitationPage } from './pages/InvitationPage';
import { QrPage } from './pages/QrPage';
import { SettingsPage } from './pages/SettingsPage';
import { TripFormPage } from './pages/TripFormPage';
import { TripPage } from './pages/TripPage';
import { UpdatePrompt } from './UpdatePrompt';
import './app/theme.css';

function Gate() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') {
    return <main className="page no-tabs center muted">Abriendo…</main>;
  }
  // El enlace de invitación y la guía se abren con o sin sesión: la propia página decide qué pedir.
  if (location.pathname.startsWith('/invitacion/') || (location.pathname === '/guia' && session.status !== 'in')) {
    return (
      <Routes>
        <Route path="/invitacion/:token" element={<InvitationPage />} />
        <Route path="/guia" element={<GuidePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  if (session.status === 'out') {
    return <LoginPage />;
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/trips/new" element={<TripFormPage />} />
        <Route path="/trips/:tripId" element={<TripPage />} />
        <Route path="/trips/:tripId/edit" element={<TripFormPage />} />
        <Route path="/trips/:tripId/bookings/new" element={<BookingFormPage />} />
        <Route path="/bookings/:bookingId" element={<BookingPage />} />
        <Route path="/bookings/:bookingId/edit" element={<BookingFormPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/guia" element={<GuidePage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/inbox/:itemId" element={<InboxItemPage />} />
      </Route>
      <Route path="/bookings/:bookingId/qr" element={<QrPage />} />
      <Route path="/attachments/:attachmentId" element={<AttachmentViewerPage />} />
      <Route path="/diag" element={<DiagPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Gate />
        <UpdatePrompt />
      </SessionProvider>
    </BrowserRouter>
  );
}
