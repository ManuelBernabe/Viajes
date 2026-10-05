import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isImage, isPdf } from '../attachments/files';
import { renderPdf } from '../attachments/pdf';
import { useWakeLock } from '../attachments/useWakeLock';
import { deleteAttachment, getAttachment, getBlob, putBlob } from '../data/repo';
import { downloadAttachment } from '../data/syncClient';
import type { Attachment, StoredBlob } from '../data/types';
import { t } from '../i18n';

export function AttachmentViewerPage() {
  const { attachmentId = '' } = useParams();
  const navigate = useNavigate();
  useWakeLock();
  const [attachment, setAttachment] = useState<Attachment | null | undefined>(undefined);
  const [blob, setBlob] = useState<StoredBlob | null>(null);
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const pages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const meta = await getAttachment(attachmentId);
      if (!alive) {
        return;
      }
      setAttachment(meta ?? null);
      if (!meta) {
        return;
      }
      let stored = await getBlob(attachmentId);
      if (!stored) {
        setMessage(t('Bajando del servidor…'));
        try {
          const bytes = await downloadAttachment(meta);
          if (bytes) {
            stored = { id: meta.id, mime: meta.mime, size: bytes.byteLength, bytes };
            await putBlob(stored);
          } else {
            setMessage(t('El fichero aún no está en el servidor.'));
          }
        } catch {
          setMessage(t('No está en el móvil y no hay conexión para bajarlo.'));
        }
      }
      if (alive && stored) {
        setMessage('');
        setBlob(stored);
      }
    })();
    return () => {
      alive = false;
    };
  }, [attachmentId]);

  useEffect(() => {
    if (!blob) {
      return;
    }
    if (isImage(blob.mime)) {
      const url = URL.createObjectURL(new Blob([blob.bytes], { type: blob.mime }));
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (isPdf(blob.mime)) {
      let alive = true;
      setMessage(t('Preparando el PDF…'));
      renderPdf(blob.bytes).then(
        (canvases) => {
          if (!alive || !pages.current) {
            return;
          }
          pages.current.replaceChildren(...canvases);
          setMessage('');
        },
        () => setMessage(t('No se ha podido mostrar el PDF.')),
      );
      return () => {
        alive = false;
      };
    }
    setMessage(t('Este tipo de fichero no se puede mostrar aquí.'));
  }, [blob]);

  async function remove() {
    if (!attachment || !confirm(t('¿Borrar «{name}»?', { name: attachment.name }))) {
      return;
    }
    await deleteAttachment(attachment.id);
    navigate(-1);
  }

  return (
    <div className="viewer">
      <div className="topbar">
        <a className="back" href="#" onClick={(e) => { e.preventDefault(); navigate(-1); }} aria-label={t('Atrás')}>
          ‹
        </a>
        <h1>{attachment?.name ?? t('Adjunto')}</h1>
        {attachment && (
          <button className="btn small danger" onClick={() => void remove()}>
            {t('Borrar')}
          </button>
        )}
      </div>
      {attachment === null && <p className="empty">{t('Este adjunto ya no existe.')}</p>}
      {message && <p className="center muted" style={{ padding: 16 }}>{message}</p>}
      {imageUrl && <img src={imageUrl} alt={attachment?.name ?? ''} />}
      <div ref={pages} />
    </div>
  );
}
