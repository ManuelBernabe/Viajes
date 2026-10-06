import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../app/SessionContext';
import { formatSize } from '../attachments/files';
import { AccountSecurity } from '../components/AccountSecurity';
import { AiSettings } from '../components/AiSettings';
import { BackupSettings } from '../components/BackupSettings';
import { HouseholdSettings } from '../components/HouseholdSettings';
import { LanguageSettings } from '../components/LanguageSettings';
import { ShareShortcut } from '../components/ShareShortcut';
import { CalendarSettings } from '../components/CalendarSettings';
import { LockSettings } from '../lock/LockSettings';
import { ImportTokens } from '../components/ImportTokens';
import { PushSettings } from '../components/PushSettings';
import { dropBlobs } from '../data/offline';
import { listTrips } from '../data/repo';
import { syncNow, useSyncStatus } from '../data/syncClient';
import { loadHousehold } from '../household/household';
import { t } from '../i18n';
import { useLiveQuery } from '../data/useLive';
import { checkForUpdate } from '../UpdatePrompt';
import { sortTrips, todayLocal } from '../domain/agenda';
import { describeServer, formatBuild, type ServerVersion } from '../platform/version';

const APP_VERSION = formatBuild(new Date(__BUILD_AT__), __BUILD_COMMIT__);

function ago(ms: number | null): string {
  if (!ms) {
    return t('nunca');
  }
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) {
    return t('ahora mismo');
  }
  if (minutes < 60) {
    return t('hace {n} min', { n: minutes });
  }
  return t('hace {n} h', { n: Math.floor(minutes / 60) });
}

export function SettingsPage() {
  const session = useSession();
  const sync = useSyncStatus();
  const [storage, setStorage] = useState('');
  const [server, setServer] = useState(t('consultando…'));
  const [updateCheck, setUpdateCheck] = useState<'checking' | string>('');

  async function searchUpdate() {
    setUpdateCheck('checking');
    const result = await checkForUpdate();
    setUpdateCheck(
      result === 'new'
        ? t('Hay una versión nueva: pulsa «Actualizar ahora».')
        : result === 'latest'
          ? t('Ya tienes la última versión.')
          : result === 'offline'
            ? t('Sin conexión: no se ha podido comprobar.')
            : t('Este navegador no instala actualizaciones: recarga la página.'),
    );
  }
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
        setStorage(
          estimate.quota
            ? t('{used} de {quota} disponibles', { used: formatSize(estimate.usage), quota: formatSize(estimate.quota) })
            : formatSize(estimate.usage),
        );
      }
    });
    api<ServerVersion>('/api/version').then(
      (info) => setServer(describeServer(info, new Date())),
      () => setServer(t('sin respuesta')),
    );
  }, []);

  async function freePast() {
    let removed = 0;
    for (const trip of past) {
      removed += await dropBlobs(trip.id);
    }
    setMessage(removed ? t('Quitados {n} ficheros de viajes pasados.', { n: removed }) : t('No había nada que quitar.'));
  }

  async function signOut() {
    if (sync.pending > 0 && !confirm(t('Hay {n} cambios sin enviar que se perderán. ¿Cerrar sesión igualmente?', { n: sync.pending }))) {
      return;
    }
    if (!confirm(t('Al cerrar sesión se borra la copia de este móvil. ¿Seguir?'))) {
      return;
    }
    await session.signOut();
  }

  return (
    <main className="page">
      <div className="topbar">
        <h1>{t('Ajustes')}</h1>
      </div>

      <section className="card">
        <h3>{t('Cuenta')}</h3>
        <p>{session.email}</p>
        <button className="btn block" onClick={() => void signOut()}>
          {t('Cerrar sesión')}
        </button>
        <AccountSecurity onSignedOutEverywhere={() => session.signOut()} />
      </section>

      <section className="card">
        <h3>{t('Sincronización')}</h3>
        <p className="small">
          {t('Última: {when} · Pendientes: {n}', { when: ago(sync.lastAt), n: sync.pending })}
          {sync.incomplete ? ` · ⚠️ ${t('incompleta (¿sin conexión?)')}` : ''}
        </p>
        <button className="btn block" disabled={sync.running} onClick={() => void syncNow()}>
          {sync.running ? t('Sincronizando…') : t('Sincronizar ahora')}
        </button>
      </section>

      <LanguageSettings />

      <HouseholdSettings />

      <PushSettings />

      <LockSettings />

      <CalendarSettings />

      <ShareShortcut />

      <ImportTokens admin={admin} />

      <AiSettings />

      <BackupSettings admin={admin} />

      <section className="card">
        <h3>{t('Espacio en el móvil')}</h3>
        <p className="small">{storage || t('No disponible')}</p>
        <button className="btn block" onClick={() => void freePast()} disabled={past.length === 0}>
          {t('Quitar del móvil los adjuntos de viajes pasados')}
        </button>
        {message && <p className="muted small">{message}</p>}
      </section>

      <section className="card">
        <h3>{t('Ayuda')}</h3>
        <p className="small muted">{t('Cómo instalar la app, añadir reservas, usar los QR sin conexión, los correos y los avisos.')}</p>
        <Link to="/ayuda" className="btn primary block">
          💬 {t('Pregunta a la guía')}
        </Link>
        <Link to="/guia" className="btn block" style={{ marginTop: 8 }}>
          {t('Guía de uso')}
        </Link>
      </section>

      <section className="card">
        <h3>{t('Versión')}</h3>
        <p className="small">{t('App: {version}', { version: APP_VERSION })}</p>
        <p className="small">{t('Servidor: {server}', { server })}</p>
        <button className="btn block" type="button" disabled={updateCheck === 'checking'} onClick={() => void searchUpdate()}>
          {updateCheck === 'checking' ? t('Buscando…') : t('Buscar actualizaciones')}
        </button>
        {updateCheck && updateCheck !== 'checking' && <p className="small muted">{updateCheck}</p>}
        <Link to="/diag" className="small">
          {t('Página de diagnóstico')}
        </Link>
      </section>
    </main>
  );
}
