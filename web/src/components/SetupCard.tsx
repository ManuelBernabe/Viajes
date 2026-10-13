import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { loadHousehold } from '../household/household';
import { inviteAndShare } from '../household/inviteShare';
import { t } from '../i18n';
import { enablePush, pushState } from '../push/push';
import { hasCalendar, subscribeToCalendar } from './CalendarSettings';
import { ShareShortcut } from './ShareShortcut';

type StepId = 'push' | 'calendar' | 'shortcut' | 'family';

interface Step {
  id: StepId;
  icon: string;
  title: string;
  detail: string;
  done: boolean;
}

const DISMISSED = 'viajes:puesta-a-punto-cerrada';

/** ¿Se cerró la tarjeta «Pon a punto» en este móvil? */
export function setupDismissed(): boolean {
  return dismissed();
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
}

/** Lo que falta por preparar en este móvil y en el hogar. Null mientras se comprueba. */
async function loadSteps(): Promise<Step[]> {
  const [push, tokens, home] = await Promise.all([
    pushState().catch(() => null),
    api<{ scope?: string; revokedMs: number | null }[]>('/api/import-tokens/').catch(() => []),
    loadHousehold().catch(() => null),
  ]);
  const steps: Step[] = [];
  if (push && push.kind !== 'unsupported') {
    steps.push({
      id: 'push',
      icon: '🔔',
      title: t('Activa los avisos'),
      detail: t('Check-in abierto, retrasos y cambios de puerta, y la víspera de cada viaje.'),
      done: push.kind === 'on',
    });
  }
  steps.push({
    id: 'calendar',
    icon: '📅',
    title: t('Viajes en el calendario del iPhone'),
    detail: t('Tus reservas aparecen solas en el calendario, con su hora.'),
    done: hasCalendar() || tokens.some((k) => k.scope === 'calendar' && !k.revokedMs),
  });
  steps.push({
    id: 'shortcut',
    icon: '✉️',
    title: t('Envía reservas desde Mail'),
    detail: t('Con el atajo «Enviar a Viajes», cualquier confirmación se manda a la app desde Compartir.'),
    done: tokens.some((k) => k.scope === 'share' && !k.revokedMs),
  });
  if (home?.iAmAdmin) {
    steps.push({
      id: 'family',
      icon: '👨‍👩‍👧',
      title: t('Invita a quien viaja contigo'),
      detail: t('Verá los viajes y las reservas que compartas, en su propio móvil.'),
      done: home.members.length > 1 || home.invitations.length > 0,
    });
  }
  return steps;
}

/**
 * «Pon a punto Viajes» en «Hoy»: lo que conviene preparar una vez (avisos, calendario, atajo de Mail, invitar), cada cosa
 * con su botón aquí mismo, para no tener que buscarla en Ajustes. Desaparece cuando está todo o si se cierra.
 */
export function SetupCard() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [hidden, setHidden] = useState(dismissed);
  const [open, setOpen] = useState<StepId | null>(null);
  const [busy, setBusy] = useState<StepId | null>(null);
  const [message, setMessage] = useState('');

  async function refresh() {
    setSteps(await loadSteps());
  }

  useEffect(() => {
    if (!hidden) {
      void refresh();
    }
  }, [hidden]);

  if (hidden || !steps || steps.every((s) => s.done)) {
    return null;
  }

  async function act(step: Step) {
    setMessage('');
    if (step.id === 'shortcut') {
      setOpen(open === 'shortcut' ? null : 'shortcut');
      return;
    }
    setBusy(step.id);
    try {
      if (step.id === 'push') {
        const state = await enablePush();
        if (state.kind === 'denied') {
          setMessage(t('Permiso denegado. Actívalo en Ajustes del iPhone → Notificaciones → Viajes.'));
        }
      } else if (step.id === 'calendar') {
        await subscribeToCalendar();
      } else if (step.id === 'family') {
        const result = await inviteAndShare();
        if (result.shared === 'copied') {
          setMessage(t('Enlace de invitación copiado: pégalo en WhatsApp o en un mensaje.'));
        } else if (result.shared === 'none') {
          setMessage(t('Enlace de invitación: {url}', { url: result.url }));
        }
      }
      await refresh();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }

  function close() {
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Sin almacenamiento: se cierra solo hasta la próxima vez.
    }
    setHidden(true);
  }

  const done = steps.filter((s) => s.done).length;
  return (
    <section className="card setup-card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>✨ {t('Pon a punto Viajes')}</h3>
        <button type="button" className="setup-close" aria-label={t('Cerrar')} onClick={close}>
          ✕
        </button>
      </div>
      <div className="setup-progress" aria-hidden="true">
        <span style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </div>
      <p className="small muted" style={{ margin: '4px 0 6px' }}>
        {t('{done} de {total} listos', { done, total: steps.length })}
      </p>
      <ul className="setup-steps">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? 'done' : ''}>
            <span className="setup-icon">{step.done ? '✅' : step.icon}</span>
            <div className="grow">
              <strong>{step.title}</strong>
              {!step.done && <div className="small muted">{step.detail}</div>}
            </div>
            {!step.done && (
              <button type="button" className="btn primary small-btn" disabled={busy !== null} onClick={() => void act(step)}>
                {busy === step.id ? '…' : step.id === 'shortcut' ? (open === 'shortcut' ? t('Ocultar') : t('Cómo')) : step.id === 'family' ? t('Invitar') : step.id === 'calendar' ? t('Añadir') : t('Activar')}
              </button>
            )}
            {step.id === 'shortcut' && open === 'shortcut' && !step.done && (
              <div className="setup-panel">
                <ShareShortcut />
                <button type="button" className="linklike small" onClick={() => void refresh()}>
                  {t('Ya lo tengo')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {message && <p className="small">{message}</p>}
    </section>
  );
}
