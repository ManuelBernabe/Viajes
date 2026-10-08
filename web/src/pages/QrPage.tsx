import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { parseBoardingPass } from '../attachments/bcbp';
import { rescan } from '../attachments/rescan';
import { drawQr } from '../attachments/qr';
import { splitQrCodes } from '../attachments/qrCodes';
import { useWakeLock } from '../attachments/useWakeLock';
import { getBooking, listAttachments } from '../data/repo';
import type { Attachment } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { t } from '../i18n';
import { TimeAt } from '../components/TimeAt';

/** Un QR para enseñar: un adjunto puede traer varios (uno por pasajero). */
interface QrEntry {
  key: string;
  attachment: Attachment;
  code: string;
  label: string;
}

function entriesOf(attachments: readonly Attachment[]): QrEntry[] {
  const entries: QrEntry[] = [];
  for (const attachment of attachments) {
    const codes = splitQrCodes(attachment.qrText);
    codes.forEach((code, index) => {
      // En las tarjetas de embarque el propio código lleva el nombre del pasajero.
      const passenger = parseBoardingPass(code)?.passenger;
      entries.push({ key: `${attachment.id}:${index}`, attachment, code, label: passenger || t('Pasajero {n}', { n: index + 1 }) });
    });
  }
  // Con un solo código por adjunto, la etiqueta útil es el nombre del fichero.
  if (entries.every((e, _index, all) => all.filter((o) => o.attachment.id === e.attachment.id).length === 1)) {
    return entries.map((e) => ({ ...e, label: parseBoardingPass(e.code)?.passenger || e.attachment.name }));
  }
  return entries;
}

type QrSize = 'small' | 'normal' | 'large';

const QR_SIZE_KEY = 'viajes:qr-tamano';

function savedQrSize(): QrSize {
  try {
    const value = localStorage.getItem(QR_SIZE_KEY);
    return value === 'small' || value === 'large' ? value : 'normal';
  } catch {
    return 'normal';
  }
}

/**
 * Lado del QR en pantalla (px CSS). «Normal» ronda los 5 cm en un iPhone, como en las apps de las aerolíneas: a pantalla
 * completa los lectores de las puertas de embarque suelen fallar porque el código no les cabe o les deslumbra.
 */
function qrCssSize(size: QrSize): number {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const max = Math.min(width * 0.92, height * 0.6);
  const target = size === 'small' ? 190 : size === 'normal' ? 250 : 330;
  return Math.round(Math.min(target, max));
}

export function QrPage() {
  const { bookingId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const wakeLock = useWakeLock();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawError, setDrawError] = useState('');

  const data = useLiveQuery(async () => {
    const booking = await getBooking(bookingId);
    const attachments = await listAttachments(bookingId);
    return { booking, attachments, entries: entriesOf(attachments.filter((a) => a.qrText)) };
  }, [bookingId]);

  useEffect(() => {
    if (data) {
      void rescan(data.attachments).catch(() => undefined);
    }
  }, [data]);

  const selected = params.get('q') ?? (params.get('a') ? `${params.get('a')}:0` : null);
  const current = data?.entries.find((e) => e.key === selected) ?? data?.entries[0];

  const [qrSize, setQrSizeState] = useState<QrSize>(savedQrSize);
  function setQrSize(next: QrSize) {
    setQrSizeState(next);
    try {
      localStorage.setItem(QR_SIZE_KEY, next);
    } catch {
      // Sin almacenamiento: vuelve al normal la próxima vez.
    }
  }

  useEffect(() => {
    if (!current || !canvas.current) {
      return;
    }
    const css = qrCssSize(qrSize);
    drawQr(canvas.current, current.code, Math.round(css * (window.devicePixelRatio || 1)), css).then(
      () => setDrawError(''),
      () => setDrawError(t('No se ha podido dibujar el QR. Abre el original.')),
    );
  }, [current?.key, current?.code, qrSize]);

  if (!data) {
    return <div className="qr-page">{t('Cargando…')}</div>;
  }

  const total = data.entries.length;
  const position = current ? data.entries.indexOf(current) : -1;

  return (
    <div className="qr-page">
      <div className="row" style={{ width: '100%' }}>
        <button className="btn small" onClick={() => navigate(-1)}>
          {t('Cerrar')}
        </button>
        <div className="grow center">
          {data.booking && (
            <>
              <strong>{data.booking.title}</strong>
              <div className="small">
                <TimeAt local={data.booking.startLocal} tz={data.booking.startTz} />
                {data.booking.startPlace && ` · ${data.booking.startPlace}`}
              </div>
            </>
          )}
        </div>
      </div>

      {current ? (
        <>
          {total > 1 && (
            <div className="center" style={{ fontWeight: 600 }}>
              {current.label} · {t('{n} de {total}', { n: position + 1, total })}
            </div>
          )}
          <canvas ref={canvas} className="qr-canvas" />
          {drawError && <p className="error">{drawError}</p>}
          {total === 1 && <div className="small muted center">{current.label}</div>}
          {total > 1 && (
            <div className="chips" style={{ marginTop: 8 }}>
              {data.entries.map((entry, index) => (
                <button key={entry.key} className={entry.key === current.key ? 'on' : ''} onClick={() => setParams({ q: entry.key }, { replace: true })}>
                  {index + 1} · {entry.label}
                </button>
              ))}
            </div>
          )}
          <div className="qr-sizes" role="group" aria-label={t('Tamaño del QR')}>
            {(['small', 'normal', 'large'] as const).map((option) => (
              <button key={option} type="button" className={qrSize === option ? 'on' : ''} onClick={() => setQrSize(option)}>
                {option === 'small' ? t('Pequeño') : option === 'normal' ? t('Normal') : t('Grande')}
              </button>
            ))}
          </div>
          <p className="small muted center">{t('Si el lector no lo coge, prueba otro tamaño y sube el brillo.')}</p>
          <div className="actions">
            <Link className="btn" to={`/attachments/${current.attachment.id}`}>
              {t('Ver original')}
            </Link>
          </div>
        </>
      ) : (
        <p className="empty">{t('Esta reserva no tiene ningún QR leído.')}</p>
      )}

      <p className="small muted center" style={{ marginTop: 'auto' }}>
        {t('Sube el brillo al máximo.')} {wakeLock === 'activo' ? t('La pantalla no se apagará.') : ''}
      </p>
    </div>
  );
}
