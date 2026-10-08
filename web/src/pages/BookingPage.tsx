import { useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { useSession } from '../app/SessionContext';
import { useAttachFiles } from '../attachments/useAttachFiles';
import { Alternatives } from '../components/Alternatives';
import { AttachmentThumbs } from '../components/AttachmentThumbs';
import { Directions } from '../components/Directions';
import { FlightStatusCard } from '../components/FlightStatus';
import { SeatCheckIn } from '../components/SeatCheckIn';
import { formatLongDay } from '../data/localTime';
import { deleteBooking, getBooking, hiddenBookings, listAttachments, saveBooking, setBookingHidden } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { TYPE_INFO } from '../domain/agenda';
import { t } from '../i18n';
import { TimeAt } from '../components/TimeAt';
import { applyFixes as saveFixes, useAutoFix } from '../components/useAutoFix';
import { useFlightStatus } from '../components/FlightStatus';
import { formatSeats, useSeats } from '../components/useSeats';

export function BookingPage() {
  const { bookingId = '' } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const booking = useLiveQuery(() => getBooking(bookingId), [bookingId]);
  const attachments = useLiveQuery(() => listAttachments(bookingId), [bookingId]);
  const { attach, progress } = useAttachFiles(session.email ?? '');
  const fileInput = useRef<HTMLInputElement>(null);
  const isHidden = useLiveQuery(async () => (await hiddenBookings()).has(bookingId), [bookingId]);
  const [flight] = useFlightStatus(booking ?? undefined);
  // Asientos: de las notas y de las tarjetas de embarque adjuntas (su QR lleva el de cada pasajero).
  const seats = useSeats(booking ? [booking] : []);
  // Lo que se puede arreglar con seguridad se arregla solo; lo que no, se avisa.
  const fixes = useAutoFix(booking, flight);

  if (booking === undefined || attachments === undefined) {
    return <main className="page muted">{t('Cargando…')}</main>;
  }
  if (!booking) {
    return (
      <main className="page">
        <div className="topbar">
          <BackLink to="/" />
          <h1>{t('Reserva')}</h1>
        </div>
        <p className="empty">{t('Esta reserva ya no existe.')}</p>
      </main>
    );
  }

  const info = TYPE_INFO[booking.type];
  const hasQr = attachments.some((a) => a.qrText);

  /** Quita el aviso de modificación; la reserva queda como está. */
  async function acknowledge() {
    const b = booking!;
    await saveBooking(
      {
        tripId: b.tripId, type: b.type, title: b.title, startLocal: b.startLocal, startTz: b.startTz, startPlace: b.startPlace,
        endLocal: b.endLocal, endTz: b.endTz, endPlace: b.endPlace, reference: b.reference, address: b.address, notes: b.notes, changeNote: null,
        visibility: b.visibility ?? 'household', sharedWith: b.sharedWith ?? [],
      },
      session.email ?? '',
      b.id,
    );
  }

  async function applyFixes() {
    if (fixes) {
      await saveFixes(booking!, fixes, session.email ?? '');
    }
  }

  async function remove() {
    if (!confirm(t('¿Borrar «{name}»?', { name: booking!.title }))) {
      return;
    }
    const tripId = booking!.tripId;
    await deleteBooking(bookingId);
    navigate(`/trips/${tripId}`, { replace: true });
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={`/trips/${booking.tripId}`} />
        <h1>
          {info.icon} {booking.title}
        </h1>
        <Link className="btn small" to={`/bookings/${bookingId}/edit`}>
          {t('Editar')}
        </Link>
      </div>

      {booking.changeNote && (
        <div className="notice danger" style={{ whiteSpace: 'pre-line' }}>
          <strong>⚠️ {booking.changeNote}</strong>
          <button className="btn small" style={{ marginTop: 8 }} type="button" onClick={() => void acknowledge()}>
            {t('Entendido, quitar el aviso')}
          </button>
        </div>
      )}

      {fixes && (
        <div className="notice danger">
          <strong>⚠️ {t('Hay datos de esta reserva que no cuadran:')}</strong>
          {fixes.lines.map((line) => (
            <div key={line}>• {line}</div>
          ))}
          {(fixes.startPlace || fixes.endLocal) && (
            <button className="btn small primary" style={{ marginTop: 8 }} type="button" onClick={() => void applyFixes()}>
              {t('Corregir')}
            </button>
          )}
        </div>
      )}

      {hasQr && (
        <Link className="btn primary block" to={`/bookings/${bookingId}/qr`}>
          {t('Ver QR')}
        </Link>
      )}

      <dl className="detail card">
        <dt>{info.startLabel}</dt>
        <dd>
          {formatLongDay(booking.startLocal)} · <TimeAt local={booking.startLocal} tz={booking.startTz} />
          {booking.startPlace && <div>{booking.startPlace}</div>}
        </dd>
        {booking.endLocal && (
          <>
            <dt>{info.endLabel}</dt>
            <dd>
              {formatLongDay(booking.endLocal)} · <TimeAt local={booking.endLocal} tz={booking.endTz ?? booking.startTz} />
              {booking.endPlace && <div>{booking.endPlace}</div>}
            </dd>
          </>
        )}
        {(booking.visibility ?? 'household') !== 'household' && (
          <>
            <dt>{t('Quién la ve')}</dt>
            <dd>{booking.visibility === 'private' ? t('Solo quien la creó y quien administra') : t('Personas concretas ({n}) además de quien la creó y quien administra', { n: (booking.sharedWith ?? []).length })}</dd>
          </>
        )}
        {seats.length > 0 && (
          <>
            <dt>{seats.length === 1 ? t('Asiento') : t('Asientos')}</dt>
            <dd>
              <strong className="time-big">{formatSeats(seats)}</strong>
            </dd>
          </>
        )}
        {booking.reference && (
          <>
            <dt>{t('Localizador')}</dt>
            <dd>{booking.reference}</dd>
          </>
        )}
        {booking.address && (
          <>
            <dt>{t('Dirección')}</dt>
            <dd>
              <a href={`https://maps.apple.com/?q=${encodeURIComponent(booking.address)}`}>{booking.address}</a>
            </dd>
          </>
        )}
        {booking.notes && (
          <>
            <dt>{t('Notas')}</dt>
            <dd>{booking.notes}</dd>
          </>
        )}
      </dl>

      <div className="actions" style={{ marginTop: 12 }}>
        <Directions booking={booking} />
      </div>

      <FlightStatusCard booking={booking} />
      <SeatCheckIn booking={booking} />

      <Alternatives booking={booking} />

      <h2>{t('Adjuntos')}</h2>
      <AttachmentThumbs attachments={attachments} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) {
            void attach(bookingId, e.target.files).then(() => {
              if (fileInput.current) {
                fileInput.current.value = '';
              }
            });
          }
        }}
      />
      <button className="btn block" type="button" disabled={progress.busy} onClick={() => fileInput.current?.click()}>
        {progress.busy ? progress.message : t('+ Adjuntar (cámara, Fotos o Archivos)')}
      </button>
      {!progress.busy && progress.message && <p className="error small">{progress.message}</p>}

      <div className="spacer" />
      <button className="btn block" type="button" onClick={() => void setBookingHidden(bookingId, !isHidden)}>
        {isHidden ? `👁 ${t('Mostrar en mis listas')}` : `🙈 ${t('Ocultar de mis listas')}`}
      </button>
      <p className="small muted" style={{ marginTop: 4 }}>
        {isHidden
          ? t('Está oculta para ti: no sale en Inicio, en «Lo siguiente» ni en tu calendario, y no te llegan sus avisos. Los demás la siguen viendo.')
          : t('Ocultarla solo cambia lo que ves tú; los demás la siguen viendo.')}
      </p>
      <button className="btn danger block" onClick={() => void remove()}>
        {t('Borrar reserva')}
      </button>
    </main>
  );
}
