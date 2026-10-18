import { useEffect, useState } from 'react';
import type { Booking } from '../data/types';
import { bagDrop } from '../domain/bagDrop';
import { cachedFlight, clock, departureHint, hasFlightNumber, loadFlight, statusLabel, type FlightStatusResponse } from '../domain/flightStatus';
import { locale, t } from '../i18n';

/** El estado del vuelo, guardado al momento y del servidor cada pocos minutos mientras se mira. */
export function useFlightStatus(booking: Booking | undefined): [FlightStatusResponse | null, () => Promise<FlightStatusResponse | null>, boolean] {
  const enabled = booking !== undefined && hasFlightNumber(booking);
  const [status, setStatus] = useState<FlightStatusResponse | null>(() => (enabled && booking ? cachedFlight(booking.id) : null));
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!enabled || !booking) {
      return;
    }
    let alive = true;
    void loadFlight(booking, Date.now()).then((result) => {
      if (alive) {
        setStatus(result);
      }
    });
    const timer = setInterval(() => setTick((n) => n + 1), 3 * 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // Se vuelve a pedir si cambia la reserva (hora o título) o pasa el rato.
  }, [enabled, booking?.id, booking?.startUtcMs, booking?.title, tick]);
  // «↻ Actualizar» pregunta aunque se acabe de preguntar, y espera la respuesta para decir qué ha pasado.
  const refresh = async () => {
    const current = booking;
    if (!current || !hasFlightNumber(current)) {
      return null;
    }
    setBusy(true);
    try {
      const result = await loadFlight(current, Date.now(), true);
      setStatus(result);
      return result;
    } finally {
      setBusy(false);
    }
  };
  return [status, refresh, busy];
}

function ago(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return minutes < 1 ? t('ahora mismo') : minutes < 60 ? t('hace {n} min', { n: minutes }) : t('hace {n} h', { n: Math.round(minutes / 60) });
}

/** Si el vuelo está en la ventana en la que se sigue (desde un día antes hasta que llega): solo entonces hay estado. */
export function isTracked(booking: Booking, now = Date.now()): boolean {
  return hasFlightNumber(booking) && now >= booking.startUtcMs - 24 * 3_600_000 && now <= booking.startUtcMs + 20 * 3_600_000;
}

/**
 * Qué ha pasado con la comprobación del vuelo, para que se vea que se mira: «🛰️ Comprobado hace 5 min · AeroDataBox»,
 * «el proveedor aún no tiene datos» o el fallo del proveedor.
 */
export function FlightCheckNote({ status }: { status: FlightStatusResponse | null }) {
  if (!status?.configured) {
    return null;
  }
  if (status.problem && !status.info) {
    return <div className="small error">⚠️ {status.problem}</div>;
  }
  if (!status.fetchedMs) {
    return (
      <div className="small muted">
        🛰️ {Date.now() < status.trackingFromMs ? t('Se empezará a comprobar un día antes de salir.') : t('Comprobando el estado del vuelo…')}
      </div>
    );
  }
  return (
    <div className="small muted">
      🛰️{' '}
      {status.info
        ? t('Estado comprobado {ago}', { ago: ago(status.fetchedMs) })
        : t('El proveedor aún no tiene datos de este vuelo (comprobado {ago}).', { ago: ago(status.fetchedMs) })}
      {status.info?.source ? ` · ${status.info.source}` : ''}
    </div>
  );
}

/** Una línea para «Hoy»: «🟠 Retraso de 40 min · Puerta 5». */
export function FlightStatusLine({ booking }: { booking: Booking }) {
  const [status] = useFlightStatus(booking);
  if (!status?.configured || !status.info) {
    return null;
  }
  const label = statusLabel(status.info, status.delayMinutes);
  const hint = departureHint(status.info);
  const at = status.delayMinutes >= 15 && status.info.depActualMs === null ? clock(status.info.depEstimatedMs, booking.startTz) : null;
  return (
    <div className={`small flight-line tone-${label.tone}`}>
      {label.icon} {label.text}
      {at && ` · ${t('sale a las {time}', { time: at })}`}
      {hint && ` · ${hint}`}
    </div>
  );
}

function Leg({
  title,
  scheduled,
  expected,
  actual,
  timeZone,
  extra,
}: {
  title: string;
  scheduled: number | null;
  expected: number | null;
  actual: number | null;
  timeZone: string;
  extra: string[];
}) {
  const planned = clock(scheduled, timeZone);
  const real = clock(actual ?? expected, timeZone);
  const changed = real !== null && real !== planned;
  return (
    <div className="flight-leg">
      <div className="small muted">{title}</div>
      <div className="flight-times">
        {changed && planned ? (
          <>
            <s className="muted">{planned}</s> <strong>{real}</strong>
          </>
        ) : (
          <strong>{real ?? planned ?? '–'}</strong>
        )}
        {actual !== null && <span className="small muted"> {t('real')}</span>}
      </div>
      {extra.length > 0 && <div className="small">{extra.join(' · ')}</div>}
    </div>
  );
}

/** «Estado del vuelo» en la reserva: salida y llegada (programado → previsto/real), terminal, puerta, mostradores y cinta. */
export function FlightStatusCard({ booking }: { booking: Booking }) {
  const [status, refresh, busy] = useFlightStatus(booking);
  const [note, setNote] = useState('');
  if (booking.type === 'flight' && !hasFlightNumber(booking)) {
    return (
      <section className="card">
        <h3 style={{ margin: 0 }}>🛰️ {t('Estado del vuelo')}</h3>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {t(
            'Para seguir retrasos, puerta y cinta, la reserva necesita el número de vuelo: ponlo en el título con «Editar» (por ejemplo «IB 3170 MAD → LHR»).',
          )}
        </p>
      </section>
    );
  }
  if (!hasFlightNumber(booking) || !status?.configured) {
    return null;
  }
  const info = status.info;
  const before = status.fetchedMs;

  /** Pide al proveedor y dice qué ha pasado: comprobado ahora, o por qué no (se acaba de comprobar, sin conexión…). */
  async function update() {
    setNote('');
    const result = await refresh();
    const now = Date.now();
    if (!result) {
      setNote(t('Sin conexión: no se ha podido actualizar.'));
    } else if (result.fetchedMs && result.fetchedMs !== before && now - result.fetchedMs < 60_000) {
      setNote(result.info ? t('Comprobado ahora mismo.') : t('Comprobado ahora mismo: el proveedor aún no tiene datos de este vuelo.'));
    } else if (result.problem) {
      setNote(`⚠️ ${result.problem}`);
    } else if (result.refreshAfterMs && result.refreshAfterMs > now) {
      setNote(
        t(
          'Ya se comprobó {ago}. Para no gastar el cupo del proveedor, se puede volver a pedir en {m} min (los cambios importantes te llegan como aviso).',
          {
            ago: ago(result.fetchedMs ?? now),
            m: Math.max(1, Math.ceil((result.refreshAfterMs - now) / 60_000)),
          },
        ),
      );
    } else {
      setNote(t('El proveedor no ha respondido; prueba en un rato.'));
    }
  }
  const arrivalTz = booking.endTz ?? booking.startTz;
  const label = info ? statusLabel(info, status.delayMinutes) : null;
  const from = new Intl.DateTimeFormat(locale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: booking.startTz,
  }).format(new Date(status.trackingFromMs));

  return (
    <section className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>🛰️ {t('Estado del vuelo')}</h3>
        {label && (
          <span className={`badge tone-${label.tone}`}>
            {label.icon} {label.text}
          </span>
        )}
      </div>
      {!info && Date.now() < status.trackingFromMs && (
        <p className="small muted">
          {t('Se empieza a seguir el {flight} un día antes de salir: {when}. Te avisaremos si cambia la puerta, la hora o se cancela.', {
            flight: status.flight,
            when: from,
          })}
        </p>
      )}
      {!info && Date.now() >= status.trackingFromMs && (
        <p className="small muted">{status.problem ? `⚠️ ${status.problem}` : t('Aún no hay datos de este vuelo.')}</p>
      )}
      {info && (
        <div className="flight-legs">
          <Leg
            title={`${t('Salida')}${info.origin ? ` · ${info.origin}` : ''}`}
            scheduled={info.depScheduledMs}
            expected={info.depEstimatedMs}
            actual={info.depActualMs}
            timeZone={booking.startTz}
            extra={[
              info.depTerminal && t('Terminal {t}', { t: info.depTerminal }),
              info.depGate && t('Puerta {g}', { g: info.depGate }),
            ].filter((x): x is string => Boolean(x))}
          />
          <Leg
            title={`${t('Llegada')}${info.destination ? ` · ${info.destination}` : ''}`}
            scheduled={info.arrScheduledMs}
            expected={info.arrEstimatedMs}
            actual={info.arrActualMs}
            timeZone={arrivalTz}
            extra={[
              info.arrTerminal && t('Terminal {t}', { t: info.arrTerminal }),
              info.arrGate && t('Puerta {g}', { g: info.arrGate }),
              info.baggage && t('Cinta {b}', { b: info.baggage }),
            ].filter((x): x is string => Boolean(x))}
          />
        </div>
      )}
      <BagDropLine booking={booking} status={status} now={Date.now()} />
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="small muted">
          {status.fetchedMs ? t('Actualizado {ago}', { ago: ago(status.fetchedMs) }) : ''}
          {info?.source ? ` · ${info.source}` : ''}
        </span>
        {isTracked(booking) && (
          <button className="btn small" type="button" disabled={busy} onClick={() => void update()}>
            {busy ? t('Comprobando…') : `↻ ${t('Actualizar')}`}
          </button>
        )}
      </div>
      {note && (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          {note}
        </p>
      )}
    </section>
  );
}

/**
 * Los mostradores de facturación el día del vuelo: dónde están (si el proveedor lo sabe) y si se puede facturar ya:
 * «🛄 Mostradores 10-14 · Facturación abierta: cierra a las 20:31 (en 40 min)». Las horas son las habituales, aproximadas.
 */
export function BagDropLine({ booking, status, now }: { booking: Booking; status: FlightStatusResponse | null; now: number }) {
  const info = status?.configured ? status.info : null;
  if (booking.type !== 'flight' || info?.status === 'cancelled' || info?.depActualMs) {
    return null;
  }
  const drop = bagDrop(booking.startUtcMs, booking.title, status?.international, now);
  if (!drop) {
    return null;
  }
  const at = (ms: number) => clock(ms, booking.startTz) ?? '';
  const desk = info?.checkInDesk ? `${t('Mostradores {d}', { d: info.checkInDesk })} · ` : '';
  const text =
    drop.state === 'soon'
      ? t('Facturación: abre hacia las {open} (en {wait}) y cierra a las {close}', {
          open: at(drop.opensMs),
          wait: waitText(drop.opensMs - now),
          close: at(drop.closesMs),
        })
      : drop.state === 'closed'
        ? t('Facturación cerrada (cerraba hacia las {close}); habla con la aerolínea si aún no has facturado', { close: at(drop.closesMs) })
        : t('Facturación abierta: cierra hacia las {close} (en {wait})', { close: at(drop.closesMs), wait: waitText(drop.closesMs - now) });
  return (
    <div className={`bagdrop bagdrop-${drop.state}`}>
      🛄 {desk}
      {text}
      <span className="muted"> · {t('horario aproximado')}</span>
    </div>
  );
}

function waitText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}
