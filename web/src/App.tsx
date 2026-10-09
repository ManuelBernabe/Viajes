import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { Layout } from "./app/Layout";
import { SessionProvider, useSession } from "./app/SessionContext";
import { LoginPage } from "./auth/LoginPage";
import { BookingPage } from "./pages/BookingPage";
import { TodayPage } from "./pages/TodayPage";
import { TripsPage } from "./pages/TripsPage";
import { TripPage } from "./pages/TripPage";
import { UpdatePrompt } from "./UpdatePrompt";
import { AppLock } from "./lock/AppLock";
import { ScrollButtons } from "./components/ScrollButtons";
import "./app/theme.css";
import { t } from "./i18n";

// Lo que no hace falta al abrir la app (formularios, lector de PDF y QR, pasaportes, ajustes…) se carga al entrar ahí.
const DiagPage = lazy(() =>
  import("./diag/DiagPage").then((m) => ({ default: m.DiagPage })),
);
const AttachmentViewerPage = lazy(() =>
  import("./pages/AttachmentViewerPage").then((m) => ({
    default: m.AttachmentViewerPage,
  })),
);
const BookingFormPage = lazy(() =>
  import("./pages/BookingFormPage").then((m) => ({
    default: m.BookingFormPage,
  })),
);
const GuidePage = lazy(() =>
  import("./pages/GuidePage").then((m) => ({ default: m.GuidePage })),
);
const HelpChatPage = lazy(() =>
  import("./pages/HelpChatPage").then((m) => ({ default: m.HelpChatPage })),
);
const DocumentFormPage = lazy(() =>
  import("./pages/DocumentFormPage").then((m) => ({
    default: m.DocumentFormPage,
  })),
);
const DocumentsPage = lazy(() =>
  import("./pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
);
const InboxItemPage = lazy(() =>
  import("./pages/InboxItemPage").then((m) => ({ default: m.InboxItemPage })),
);
const InboxPage = lazy(() =>
  import("./pages/InboxPage").then((m) => ({ default: m.InboxPage })),
);
const InvitationPage = lazy(() =>
  import("./pages/InvitationPage").then((m) => ({ default: m.InvitationPage })),
);
const DestinationPage = lazy(() =>
  import("./pages/DestinationPage").then((m) => ({
    default: m.DestinationPage,
  })),
);
const EmergencyPage = lazy(() =>
  import("./pages/EmergencyPage").then((m) => ({ default: m.EmergencyPage })),
);
const JournalPage = lazy(() =>
  import("./pages/JournalPage").then((m) => ({ default: m.JournalPage })),
);
const PackingPage = lazy(() =>
  import("./pages/PackingPage").then((m) => ({ default: m.PackingPage })),
);
const SharePage = lazy(() =>
  import("./pages/SharePage").then((m) => ({ default: m.SharePage })),
);
const PlacesPage = lazy(() =>
  import("./pages/PlacesPage").then((m) => ({ default: m.PlacesPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const QrPage = lazy(() =>
  import("./pages/QrPage").then((m) => ({ default: m.QrPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const TripFormPage = lazy(() =>
  import("./pages/TripFormPage").then((m) => ({ default: m.TripFormPage })),
);

/** Con el desplazamiento en un contenedor interior, cada pantalla nueva empieza arriba (el navegador ya no lo hace solo). */
function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    document.querySelector(".shell > .scroll")?.scrollTo({ top: 0 });
  }, [location.pathname]);
  return null;
}

function Gate() {
  const session = useSession();
  const location = useLocation();
  if (session.status === "loading") {
    return <main className="page no-tabs center muted">{t("Abriendo…")}</main>;
  }
  // El enlace de invitación, el de cambiar la contraseña y la guía se abren con o sin sesión: la propia página decide qué pedir.
  if (
    location.pathname.startsWith("/invitacion/") ||
    location.pathname.startsWith("/restablecer/") ||
    (location.pathname === "/guia" && session.status !== "in")
  ) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/invitacion/:token" element={<InvitationPage />} />
          <Route
            path="/restablecer/:userId/:token"
            element={<ResetPasswordPage />}
          />
          <Route path="/guia" element={<GuidePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }
  if (session.status === "out") {
    return <LoginPage />;
  }
  return (
    <>
      <AppLock />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<TodayPage />} />
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/emergency" element={<EmergencyPage />} />
            <Route path="/trips/new" element={<TripFormPage />} />
            <Route path="/trips/:tripId" element={<TripPage />} />
            <Route path="/trips/:tripId/edit" element={<TripFormPage />} />
            <Route path="/trips/:tripId/places" element={<PlacesPage />} />
            <Route path="/trips/:tripId/packing" element={<PackingPage />} />
            <Route path="/trips/:tripId/journal" element={<JournalPage />} />
            <Route path="/trips/:tripId/info" element={<DestinationPage />} />
            <Route path="/trips/:tripId/share" element={<SharePage />} />
            <Route
              path="/trips/:tripId/bookings/new"
              element={<BookingFormPage />}
            />
            <Route path="/bookings/:bookingId" element={<BookingPage />} />
            <Route
              path="/bookings/:bookingId/edit"
              element={<BookingFormPage />}
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/guia" element={<GuidePage />} />
            <Route path="/ayuda" element={<HelpChatPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/inbox/:itemId" element={<InboxItemPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/new" element={<DocumentFormPage />} />
            <Route
              path="/documents/:documentId"
              element={<DocumentFormPage />}
            />
          </Route>
          <Route path="/bookings/:bookingId/qr" element={<QrPage />} />
          <Route
            path="/attachments/:attachmentId"
            element={<AttachmentViewerPage />}
          />
          <Route path="/diag" element={<DiagPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function Loading() {
  return <main className="page muted">{t("Cargando…")}</main>;
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
