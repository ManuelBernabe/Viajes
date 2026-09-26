import { useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { useSession } from '../app/SessionContext';
import { useAttachFiles } from '../attachments/useAttachFiles';
import { AttachmentThumbs } from '../components/AttachmentThumbs';
import { formatLongDay, timeOf, zoneLabel } from '../data/localTime';
import { deleteBooking, getBooking, listAttachments, saveBooking } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { TYPE_INFO } from '../domain/agenda';

export function BookingPage() {
  const { bookingId = '' } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const booking = useLiveQuery(() => getBooking(bookingId), [bookingId]);
  const attachments = useLiveQuery(() => listAttachments(bookingId), [bookingId]);
  const { attach, progress } = useAttachFiles(session.email ?? '');
  const fileInput = useRef<HTMLInputElement>(null);

  if (booking === undefined || attachments === undefined) {
    return <main className="page muted">Cargando…</main>;
  }
  if (!booking) {
    return (
      <main className="page">
        <div className="topbar">
          <BackLink to="/" />
          <h1>Reserva</h1>
        </div>
        <p className="empty">Esta reserva ya no existe.</p>
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
      },
      session.email ?? '',
      b.id,
    );
  }

  async function remove() {
    if (!confirm(`¿Borrar «${booking!.title}»?`)) {
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
          Editar
        </Link>
      </div>

      {booking.changeNote && (
        <div className="notice danger">
          <strong>⚠️ {booking.changeNote}</strong>
          <button className="btn small" style={{ marginTop: 8 }} type="button" onClick={() => void acknowledge()}>
            Entendido, quitar el aviso
          </button>
        </div>
      )}

      {hasQr && (
        <Link className="btn primary block" to={`/bookings/${bookingId}/qr`}>
          Ver QR
        </Link>
      )}

      <dl className="detail card">
        <dt>{info.startLabel}</dt>
        <dd>
          {formatLongDay(booking.startLocal)} · {timeOf(booking.startLocal)} hora de {zoneLabel(booking.startTz)}
          {booking.startPlace && <div>{booking.startPlace}</div>}
        </dd>
        {booking.endLocal && (
          <>
            <dt>{info.endLabel}</dt>
            <dd>
              {formatLongDay(booking.endLocal)} · {timeOf(booking.endLocal)} hora de {zoneLabel(booking.endTz ?? booking.startTz)}
              {booking.endPlace && <div>{booking.endPlace}</div>}
            </dd>
          </>
        )}
        {booking.reference && (
          <>
            <dt>Localizador</dt>
            <dd>{booking.reference}</dd>
          </>
        )}
        {booking.address && (
          <>
            <dt>Dirección</dt>
            <dd>
              <a href={`https://maps.apple.com/?q=${encodeURIComponent(booking.address)}`}>{booking.address}</a>
            </dd>
          </>
        )}
        {booking.notes && (
          <>
            <dt>Notas</dt>
            <dd>{booking.notes}</dd>
          </>
        )}
      </dl>

      <h2>Adjuntos</h2>
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
        {progress.busy ? progress.message : '+ Adjuntar (cámara, Fotos o Archivos)'}
      </button>
      {!progress.busy && progress.message && <p className="error small">{progress.message}</p>}

      <div className="spacer" />
      <button className="btn danger block" onClick={() => void remove()}>
        Borrar reserva
      </button>
    </main>
  );
}
