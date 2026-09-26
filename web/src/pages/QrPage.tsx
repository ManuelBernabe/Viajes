import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { drawQr } from '../attachments/qr';
import { useWakeLock } from '../attachments/useWakeLock';
import { timeOf, zoneLabel } from '../data/localTime';
import { getBooking, listAttachments } from '../data/repo';
import { useLiveQuery } from '../data/useLive';

export function QrPage() {
  const { bookingId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const wakeLock = useWakeLock();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawError, setDrawError] = useState('');

  const data = useLiveQuery(async () => {
    const booking = await getBooking(bookingId);
    const withQr = (await listAttachments(bookingId)).filter((a) => a.qrText);
    return { booking, withQr };
  }, [bookingId]);

  const selectedId = params.get('a');
  const current = data?.withQr.find((a) => a.id === selectedId) ?? data?.withQr[0];

  useEffect(() => {
    if (!current?.qrText || !canvas.current) {
      return;
    }
    const size = Math.round(Math.min(window.innerWidth * 0.92, window.innerHeight * 0.7) * (window.devicePixelRatio || 1));
    drawQr(canvas.current, current.qrText, size).then(
      () => setDrawError(''),
      () => setDrawError('No se ha podido dibujar el QR. Abre el original.'),
    );
  }, [current?.id, current?.qrText]);

  if (!data) {
    return <div className="qr-page">Cargando…</div>;
  }

  return (
    <div className="qr-page">
      <div className="row" style={{ width: '100%' }}>
        <button className="btn small" onClick={() => navigate(-1)}>
          Cerrar
        </button>
        <div className="grow center">
          {data.booking && (
            <>
              <strong>{data.booking.title}</strong>
              <div className="small">
                {timeOf(data.booking.startLocal)} hora de {zoneLabel(data.booking.startTz)}
                {data.booking.startPlace && ` · ${data.booking.startPlace}`}
              </div>
            </>
          )}
        </div>
      </div>

      {current ? (
        <>
          <canvas ref={canvas} className="qr-canvas" />
          {drawError && <p className="error">{drawError}</p>}
          <div className="small muted center">{current.name}</div>
          {data.withQr.length > 1 && (
            <div className="chips" style={{ marginTop: 8 }}>
              {data.withQr.map((a, index) => (
                <button key={a.id} className={a.id === current.id ? 'on' : ''} onClick={() => setParams({ a: a.id })}>
                  {index + 1} · {a.name}
                </button>
              ))}
            </div>
          )}
          <div className="actions">
            <Link className="btn" to={`/attachments/${current.id}`}>
              Ver original
            </Link>
          </div>
        </>
      ) : (
        <p className="empty">Esta reserva no tiene ningún QR leído.</p>
      )}

      <p className="small muted center" style={{ marginTop: 'auto' }}>
        Sube el brillo al máximo. {wakeLock === 'activo' ? 'La pantalla no se apagará.' : ''}
      </p>
    </div>
  );
}
