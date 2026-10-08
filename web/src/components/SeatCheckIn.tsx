import { useState } from 'react';
import { zoneLabel } from '../data/localTime';
import type { Booking } from '../data/types';
import { airlineOf, checkInOpensMs } from '../domain/airlines';
import { lang, locale, t } from '../i18n';
import { formatSeats, useSeats } from './useSeats';

/**
 * «Asiento y check-in» en un vuelo: el asiento que ya tiene (si sale en la reserva), cuándo abre el check-in online
 * —el momento de elegir asiento gratis o más barato— y el acceso directo a la aerolínea con el localizador a mano.
 * La app no puede ver ni cambiar asientos: eso solo lo hace la aerolínea con tu localizador.
 */
export function SeatCheckIn({ booking }: { booking: Booking }) {
  const [copied, setCopied] = useState(false);
  // De las notas y de las tarjetas de embarque adjuntas (el QR lleva el asiento de cada pasajero).
  const seats = useSeats([booking]);
  if (booking.type !== 'flight') {
    return null;
  }

  const airline = airlineOf(booking.title);
  const opens = checkInOpensMs(booking.startUtcMs, booking.title);
  const now = Date.now();
  const when = new Intl.DateTimeFormat(locale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: booking.startTz,
  }).format(new Date(opens));
  const name = airline?.name ?? t('la aerolínea');
  const url =
    airline?.url ||
    `https://www.google.com/search?q=${encodeURIComponent(`${airline?.code ?? booking.title} ${t('check-in online')}`)}&hl=${lang()}`;

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(booking.reference ?? '');
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card">
      <h3>💺 {t('Asiento y check-in')}</h3>
      <div>
        {seats.length > 0 ? (
          <>
            {seats.length === 1 ? t('Tu asiento:') : t('Vuestros asientos:')} <strong>{formatSeats(seats)}</strong>
          </>
        ) : (
          <span className="muted">{t('La reserva no dice el asiento.')}</span>
        )}
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        {booking.startUtcMs < now
          ? t('El vuelo ya ha salido.')
          : opens <= now
            ? t('El check-in online de {name} ya está abierto: es el momento de elegir o cambiar asiento.', { name })
            : t('El check-in online de {name} abre {hours} h antes: {when} (hora de {zone}). Te avisaremos.', {
                name,
                hours: Math.round((booking.startUtcMs - opens) / 3_600_000),
                when,
                zone: zoneLabel(booking.startTz),
              })}
      </div>
      <div className="actions">
        <a className="btn primary" href={url} target="_blank" rel="noreferrer">
          {t('Elegir o cambiar asiento en {name}', { name })}{' '}↗
        </a>
        {booking.reference && (
          <button className="btn" type="button" onClick={() => void copyReference()}>
            {copied ? t('Copiado ✓') : t('Copiar localizador {ref}', { ref: booking.reference })}
          </button>
        )}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {t('Los asientos libres solo los muestra la aerolínea: entra con tu localizador y el apellido.')}
      </p>
    </section>
  );
}
