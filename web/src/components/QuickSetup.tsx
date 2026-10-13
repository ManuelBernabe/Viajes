import { useEffect, useState } from 'react';
import { describeError } from '../api';
import { loadHousehold } from '../household/household';
import { inviteAndShare } from '../household/inviteShare';
import { t } from '../i18n';
import { enablePush, pushState } from '../push/push';
import { hasCalendar, subscribeToCalendar } from './CalendarSettings';
import { setupDismissed } from './SetupCard';

/** ¿Están apagados los avisos en este móvil (y se pueden encender)? null mientras se comprueba. */
function usePushOff(): [boolean | null, () => void] {
  const [off, setOff] = useState<boolean | null>(null);
  const check = () => void pushState().then((s) => setOff(s.kind === 'off'), () => setOff(false));
  useEffect(check, []);
  return [off, check];
}

/** En una reserva de vuelo: «🔔 Avisarme de cambios» si los avisos están apagados en este móvil. */
export function PushOfferButton() {
  const [off, recheck] = usePushOff();
  const [message, setMessage] = useState('');
  if (!off) {
    return message ? <p className="small">{message}</p> : null;
  }
  async function enable() {
    try {
      const state = await enablePush();
      setMessage(state.kind === 'on' ? t('Avisos activados en este móvil.') : t('Permiso denegado. Actívalo en Ajustes del iPhone → Notificaciones → Viajes.'));
    } catch (error) {
      setMessage(describeError(error));
    }
    recheck();
  }
  return (
    <button type="button" className="btn block" onClick={() => void enable()}>
      🔔 {t('Avisarme de cambios en este vuelo')}
    </button>
  );
}

/**
 * En «Hoy», si hay un vuelo en los próximos 7 días y los avisos están apagados (y la tarjeta «Pon a punto» ya se cerró,
 * para no pedirlo dos veces): ofrecerlos con un toque.
 */
export function PushOfferBanner({ flightSoon }: { flightSoon: boolean }) {
  const [off, recheck] = usePushOff();
  const [closed, setClosed] = useState(false);
  if (!flightSoon || !off || closed || !setupDismissed()) {
    return null;
  }
  return (
    <div className="card push-offer">
      <span>🔔 {t('Tienes un vuelo pronto: activa los avisos para enterarte del check-in, retrasos y cambios de puerta.')}</span>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button type="button" className="btn primary" onClick={() => void enablePush().finally(recheck)}>
          {t('Activar')}
        </button>
        <button type="button" className="btn" onClick={() => setClosed(true)}>
          {t('Ahora no')}
        </button>
      </div>
    </div>
  );
}

/** En un viaje: «📅 Al calendario» (si no está añadido en este móvil) e «👥 Invitar» (quien administra). */
export function TripQuickActions() {
  const [calendar, setCalendar] = useState(hasCalendar);
  const [admin, setAdmin] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    loadHousehold().then((home) => setAdmin(home.iAmAdmin), () => setAdmin(false));
  }, []);

  async function invite() {
    setMessage('');
    try {
      const result = await inviteAndShare();
      if (result.shared === 'copied') {
        setMessage(t('Enlace de invitación copiado: pégalo en WhatsApp o en un mensaje.'));
      } else if (result.shared === 'none') {
        setMessage(t('Enlace de invitación: {url}', { url: result.url }));
      }
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function addCalendar() {
    setMessage('');
    try {
      await subscribeToCalendar();
      setCalendar(true);
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  return (
    <>
      {!calendar && (
        <button type="button" className="btn" onClick={() => void addCalendar()}>
          📅 {t('Al calendario')}
        </button>
      )}
      {admin && (
        <button type="button" className="btn" onClick={() => void invite()}>
          👥 {t('Invitar')}
        </button>
      )}
      {message && <p className="small" style={{ flexBasis: '100%' }}>{message}</p>}
    </>
  );
}
