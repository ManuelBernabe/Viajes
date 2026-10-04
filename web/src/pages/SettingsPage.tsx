import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../app/SessionContext';
import { formatSize } from '../attachments/files';
import { AccountSecurity } from '../components/AccountSecurity';
import { AiSettings } from '../components/AiSettings';
import { BackupSettings } from '../components/BackupSettings';
import { HouseholdSettings } from '../components/HouseholdSettings';
import { ShareShortcut } from '../components/ShareShortcut';
import { ImportTokens } from '../components/ImportTokens';
import { PushSettings } from '../components/PushSettings';
import { dropBlobs } from '../data/offline';
import { listTrips } from '../data/repo';
import { syncNow, useSyncStatus } from '../data/syncClient';
import { loadHousehold } from '../household/household';
import { useLiveQuery } from '../data/useLive';
import { sortTrips, todayLocal } from '../domain/agenda';
import { describeServer, formatBuild, type ServerVersion } from '../platform/version';

const APP_VERSION = formatBuild(new Date(__BUILD_AT__), __BUILD_COMMIT__);

function ago(ms: number | null): string {
  if (!ms) {
    return 'nunca';
  }
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) {
    return 'ahora mismo';
  }
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  return `hace ${Math.floor(minutes / 60)} h`;
}

export function SettingsPage() {
  const session = useSession();
  const sync = useSyncStatus();
  const [storage, setStorage] = useState('');
  const [server, setServer] = useState('consultando…');
  const [message, setMessage] = useState('');
  const trips = useLiveQuery(listTrips, []);
  // Los tokens y la gestión de miembros solo los toca quien administra el hogar; hasta saberlo, se esconden.
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    loadHousehold().then((home) => setAdmin(home.iAmAdmin), () => setAdmin(false));
  }, []);
  const past = trips ? sortTrips(trips, todayLocal()).past : [];

  useEffect(() => {
    navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage !== undefined) {
        setStorage(`${formatSize(estimate.usage)}${estimate.quota ? ` de ${formatSize(estimate.quota)} disponibles` : ''}`);
      }
    });
    api<ServerVersion>('/api/version').then(
      (info) => setServer(describeServer(info, new Date())),
      () => setServer('sin respuesta'),
    );
  }, []);

  async function freePast() {
    let removed = 0;
    for (const trip of past) {
      removed += await dropBlobs(trip.id);
    }
    setMessage(removed ? `Quitados ${removed} ficheros de viajes pasados.` : 'No había nada que quitar.');
  }

  async function signOut() {
    if (sync.pending > 0 && !confirm(`Hay ${sync.pending} cambios sin enviar que se perderán. ¿Cerrar sesión igualmente?`)) {
      return;
    }
    if (!confirm('Al cerrar sesión se borra la copia de este móvil. ¿Seguir?')) {
      return;
    }
    await session.signOut();
  }

  return (
    <main className="page">
      <div className="topbar">
        <h1>Ajustes</h1>
      </div>

      <section className="card">
        <h3>Cuenta</h3>
        <p>{session.email}</p>
        <button className="btn block" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
        <AccountSecurity onSignedOutEverywhere={() => session.signOut()} />
      </section>

      <section className="card">
        <h3>Sincronización</h3>
        <p className="small">
          Última: {ago(sync.lastAt)} · Pendientes: {sync.pending}
          {sync.incomplete ? ' · ⚠️ incompleta (¿sin conexión?)' : ''}
        </p>
        <button className="btn block" disabled={sync.running} onClick={() => void syncNow()}>
          {sync.running ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </section>

      <HouseholdSettings />

      <PushSettings />

      <ShareShortcut />

      <ImportTokens admin={admin} />

      <AiSettings />

      <BackupSettings admin={admin} />

      <section className="card">
        <h3>Espacio en el móvil</h3>
        <p className="small">{storage || 'No disponible'}</p>
        <button className="btn block" onClick={() => void freePast()} disabled={past.length === 0}>
          Quitar del móvil los adjuntos de viajes pasados
        </button>
        {message && <p className="muted small">{message}</p>}
      </section>

      <section className="card">
        <h3>Ayuda</h3>
        <p className="small muted">Cómo instalar la app, añadir reservas, usar los QR sin conexión, los correos y los avisos.</p>
        <Link to="/guia" className="btn block">
          Guía de uso
        </Link>
      </section>

      <section className="card">
        <h3>Versión</h3>
        <p className="small">App: {APP_VERSION}</p>
        <p className="small">Servidor: {server}</p>
        <Link to="/diag" className="small">
          Página de diagnóstico
        </Link>
      </section>
    </main>
  );
}
