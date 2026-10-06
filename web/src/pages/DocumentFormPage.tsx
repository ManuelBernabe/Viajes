import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { useSession } from '../app/SessionContext';
import { renderPdf } from '../attachments/pdf';
import { shrinkForReading } from '../attachments/shrink';
import { countryName } from '../ocr/mrz';
import { readMrzFromImage } from '../ocr/readMrz';
import { readFiles, useAttachFiles, type ReadFile } from '../attachments/useAttachFiles';
import { AttachmentThumbs } from '../components/AttachmentThumbs';
import { deleteDocument, getBlob, getDocument, listAttachments, listDocuments, saveDocument } from '../data/repo';
import { DOCUMENT_KINDS, type DocumentKind, type TravelDocumentBody } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { DOCUMENT_INFO } from '../domain/documents';
import { fillFromRead, type DocumentRead } from '../domain/documentRead';
import { locale, t } from '../i18n';

/** Pasaporte, DNI y carné de conducir: nunca salen del móvil para leerlos. */
const IDENTITY_KINDS: ReadonlySet<string> = new Set(['passport', 'id', 'license']);

const EMPTY: TravelDocumentBody = {
  person: '',
  kind: 'passport',
  number: null,
  country: null,
  issuedDate: null,
  expiryDate: null,
  notes: null,
  visibility: 'household',
};

/** Alta y edición de un documento de viaje, con sus fotos o PDF. */
export function DocumentFormPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const existing = useLiveQuery(() => (documentId ? getDocument(documentId) : Promise.resolve(null)), [documentId]);
  const people = useLiveQuery(async () => [...new Set((await listDocuments()).map((d) => d.person.trim()))].sort(), []);
  const files = useLiveQuery(() => (documentId ? listAttachments(documentId) : Promise.resolve([])), [documentId]);
  const { attachRead, progress } = useAttachFiles(session.email ?? '');
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<TravelDocumentBody>(EMPTY);
  const [loaded, setLoaded] = useState(!documentId);
  const [pending, setPending] = useState<ReadFile[]>([]);
  const [error, setError] = useState('');
  const [reading, setReading] = useState('');
  /** La última foto o PDF añadido, para volver a leerlo (o leerlo con IA si se acepta). */
  const [lastPhoto, setLastPhoto] = useState<{ bytes: ArrayBuffer; mime: string } | null>(null);
  const [aiOffer, setAiOffer] = useState(false);
  /** Si se ha elegido el tipo a mano, la lectura de la foto no lo cambia. */
  const kindTouched = useRef(false);
  /** El formulario de ahora mismo, para rellenar sobre lo último escrito aunque la lectura tarde. */
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    if (existing && !loaded) {
      const { person, kind, number, country, issuedDate, expiryDate, notes, visibility } = existing;
      setForm({ person, kind, number, country, issuedDate, expiryDate, notes, visibility });
      setLoaded(true);
    }
  }, [existing, loaded]);

  if (documentId && (existing === undefined || files === undefined)) {
    return <main className="page muted">{t('Cargando…')}</main>;
  }
  if (documentId && !existing) {
    return (
      <main className="page">
        <div className="topbar">
          <BackLink to="/documents" />
          <h1>{t('Documento')}</h1>
        </div>
        <p className="empty">{t('Este documento ya no existe.')}</p>
      </main>
    );
  }

  const set = (change: Partial<TravelDocumentBody>) => setForm((current) => ({ ...current, ...change }));
  const text = (value: string) => value.trim() || null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!form.person.trim()) {
      setError(t('Di de quién es el documento.'));
      return;
    }
    const saved = await saveDocument(
      {
        ...form,
        person: form.person.trim(),
        number: text(form.number ?? ''),
        country: text(form.country ?? ''),
        notes: text(form.notes ?? ''),
        issuedDate: form.issuedDate || null,
        expiryDate: form.expiryDate || null,
      },
      session.email ?? '',
      documentId,
    );
    if (pending.length > 0) {
      await attachRead(saved.id, pending);
    }
    navigate('/documents', { replace: true });
  }

  async function remove() {
    if (documentId && confirm(t('¿Borrar este documento y sus fotos?'))) {
      await deleteDocument(documentId);
      navigate('/documents', { replace: true });
    }
  }

  /** Rellena con lo leído (solo lo vacío) y dice cómo ha ido. */
  function applyRead(read: DocumentRead, note?: string) {
    const { form: next, filled } = fillFromRead(formRef.current, read, kindTouched.current);
    setForm(next);
    const checked = read.mrzChecked ? ` ${note ?? t('El número y la caducidad están comprobados con la banda de lectura del documento.')}` : '';
    setReading(filled > 0 ? `✓ ${t('Datos leídos de la foto: revísalos antes de guardar.')}${checked}` : t('No se ha leído nada nuevo de la foto.'));
  }

  /**
   * Pasaporte, DNI o carné: se lee en el propio móvil la banda de abajo (MRZ), sin mandar la foto a ningún sitio.
   * Un PDF se convierte antes en imagen (su primera página).
   */
  async function readOnDevice(bytes: ArrayBuffer, mime: string) {
    setReading(`🔒 ${t('Leyendo la foto en el móvil (no sale de aquí)…')}`);
    try {
      let image = { bytes, mime };
      if (mime === 'application/pdf') {
        const [page] = await renderPdf(bytes, { maxPages: 1, width: 2200 });
        const blob = page ? await new Promise<Blob | null>((resolve) => page.toBlob(resolve, 'image/png')) : null;
        if (!blob) {
          throw new Error('pdf');
        }
        image = { bytes: await blob.arrayBuffer(), mime: 'image/png' };
      }
      const mrz = await readMrzFromImage(image.bytes, image.mime, (fraction) =>
        setReading(`🔒 ${t('Leyendo la foto en el móvil (no sale de aquí)…')} ${Math.round(fraction * 100)}%`),
      );
      if (!mrz) {
        setReading(
          t(
            'No se ha podido leer la banda de abajo (las líneas con «<<<»). Haz otra foto de cerca, de frente y con buena luz, o rellena los datos a mano.',
          ),
        );
        return;
      }
      applyRead(
        {
          kind: mrz.kind,
          givenNames: mrz.givenNames || null,
          surnames: mrz.surnames || null,
          number: mrz.number || null,
          country: countryName(mrz.issuer, locale()),
          issuedDate: null,
          expiryDate: mrz.expiryDate,
          mrzChecked: true,
        },
        // Si el número no es seguro, se deja en blanco y se dice: la caducidad sí está comprobada.
        mrz.number ? undefined : t('El número no se ha podido leer con seguridad: escríbelo a mano.'),
      );
    } catch {
      setReading(t('No se ha podido leer la foto en el móvil (¿sin conexión la primera vez?). Rellena los datos a mano.'));
    }
  }

  /** Seguros, visados, vacunas…: con la IA del servidor, solo si se pide (la foto sale del móvil). */
  async function readWithAi(bytes: ArrayBuffer, mime: string) {
    setAiOffer(false);
    setReading(t('Leyendo el documento…'));
    try {
      const small = await shrinkForReading(bytes, mime);
      const response = await fetch('/api/documents/read', {
        method: 'POST',
        body: new Blob([small.bytes], { type: small.mime }),
        headers: { 'Content-Type': small.mime },
      });
      if (!response.ok) {
        setReading(
          response.status === 503
            ? t('La lectura automática no está activada en el servidor: rellena los datos a mano.')
            : t('No se ha podido leer el documento. Prueba con otra foto, de frente y con buena luz.'),
        );
        return;
      }
      applyRead((await response.json()) as DocumentRead);
    } catch {
      setReading(t('Sin conexión: no se ha podido leer la foto. Rellena los datos a mano.'));
    }
  }

  /** Según el tipo: los documentos de identidad, en el móvil; los demás, se ofrece la IA. */
  async function readDocument(bytes: ArrayBuffer, mime: string) {
    setLastPhoto({ bytes, mime });
    if (IDENTITY_KINDS.has(formRef.current.kind)) {
      await readOnDevice(bytes, mime);
    } else {
      setReading('');
      setAiOffer(true);
    }
  }

  async function onFiles(list: FileList) {
    const read = await readFiles(list);
    if (documentId) {
      await attachRead(documentId, read);
    } else {
      // Documento nuevo: las fotos se guardan con él al pulsar «Guardar».
      setPending([...pending, ...read]);
    }
    if (fileInput.current) {
      fileInput.current.value = '';
    }
    const first = read.find((r) => !r.error && (r.mime.startsWith('image/') || r.mime === 'application/pdf'));
    if (first) {
      await readDocument(first.bytes, first.mime);
    }
  }

  /** Volver a leer: la última foto añadida o, en un documento guardado, su primera foto. */
  async function readAgain() {
    if (lastPhoto) {
      await readDocument(lastPhoto.bytes, lastPhoto.mime);
      return;
    }
    const first = (files ?? []).find((f) => f.mime.startsWith('image/') || f.mime === 'application/pdf');
    const blob = first ? await getBlob(first.id) : undefined;
    if (blob) {
      await readDocument(blob.bytes, blob.mime);
    }
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to="/documents" />
        <h1>{documentId ? t('Editar documento') : t('Nuevo documento')}</h1>
      </div>
      <form onSubmit={(e) => void submit(e)}>
        <h2 style={{ marginTop: 0 }}>{t('Fotos o PDF')}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          {t(
            'Haz una foto de la página de los datos, con las líneas de abajo («<<<») bien visibles: la app rellena el resto. La foto de un pasaporte o DNI se lee en el propio móvil.',
          )}
        </p>
        <AttachmentThumbs attachments={files ?? []} />
        {pending.length > 0 && (
          <ul className="small">
            {pending.map((p, i) => (
              <li key={i} className={p.error ? 'error' : ''}>
                {p.error ?? p.file.name}
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) {
              void onFiles(e.target.files);
            }
          }}
        />
        <button className="btn block" type="button" disabled={progress.busy} onClick={() => fileInput.current?.click()}>
          {progress.busy ? progress.message : `📷 ${t('+ Adjuntar (cámara, Fotos o Archivos)')}`}
        </button>
        {!progress.busy && progress.message && <p className="error small">{progress.message}</p>}
        {((files ?? []).length > 0 || lastPhoto) && !reading && !aiOffer && (
          <button className="btn small" type="button" style={{ marginTop: 8 }} onClick={() => void readAgain()}>
            🔍 {t('Leer los datos de la foto')}
          </button>
        )}
        {aiOffer && lastPhoto && (
          <div className="notice small" style={{ marginTop: 8 }}>
            <div>
              {t(
                'Para leer este documento, la foto se envía al servicio de IA del servidor. Los pasaportes, DNI y carnés nunca se envían: se leen en el móvil.',
              )}
            </div>
            <div className="actions" style={{ marginTop: 6 }}>
              <button className="btn small primary" type="button" onClick={() => void readWithAi(lastPhoto.bytes, lastPhoto.mime)}>
                🤖 {t('Leer con IA')}
              </button>
              <button className="btn small" type="button" onClick={() => setAiOffer(false)}>
                {t('No, lo relleno yo')}
              </button>
            </div>
          </div>
        )}
        {reading && <p className="small notice">{reading}</p>}

        <div className="field">
          <label htmlFor="person">{t('De quién es')}</label>
          <input
            id="person"
            list="people"
            value={form.person}
            onChange={(e) => set({ person: e.target.value })}
            placeholder={t('Nombre')}
            autoFocus={!documentId}
          />
          <datalist id="people">
            {(people ?? []).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label>{t('Tipo')}</label>
          <div className="chips" role="radiogroup" aria-label={t('Tipo')}>
            {DOCUMENT_KINDS.map((kind: DocumentKind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                className={form.kind === kind ? 'on' : ''}
                onClick={() => {
                  kindTouched.current = true;
                  set({ kind });
                }}
              >
                {DOCUMENT_INFO[kind].icon} {DOCUMENT_INFO[kind].label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="number">{t('Número')}</label>
          <input id="number" value={form.number ?? ''} onChange={(e) => set({ number: e.target.value })} autoCapitalize="characters" />
        </div>
        <div className="field">
          <label htmlFor="country">{t('País')}</label>
          <input id="country" value={form.country ?? ''} onChange={(e) => set({ country: e.target.value })} placeholder={t('España')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          <div className="field">
            <label htmlFor="issued">{t('Expedido')}</label>
            <input
              id="issued"
              type="date"
              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
              value={form.issuedDate ?? ''}
              onChange={(e) => set({ issuedDate: e.target.value || null })}
            />
          </div>
          <div className="field">
            <label htmlFor="expiry">{t('Caduca')}</label>
            <input
              id="expiry"
              type="date"
              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
              value={form.expiryDate ?? ''}
              onChange={(e) => set({ expiryDate: e.target.value || null })}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="notes">{t('Notas')}</label>
          <textarea
            id="notes"
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder={t('Póliza, teléfono de asistencia, vacunas…')}
          />
        </div>

        <label className="row small" style={{ gap: 10, margin: '6px 0 12px' }}>
          <input
            type="checkbox"
            checked={form.visibility === 'private'}
            onChange={(e) => set({ visibility: e.target.checked ? 'private' : 'household' })}
          />
          <span>
            {t('Solo para mí')} <span className="muted">· {t('si no, lo ve todo el hogar. Solo lo puede cambiar quien lo apuntó.')}</span>
          </span>
        </label>

        {error && <p className="error">{error}</p>}
        <button className="btn primary block" type="submit" style={{ marginTop: 16 }}>
          {t('Guardar')}
        </button>
      </form>
      {documentId && (
        <>
          <div className="spacer" />
          <button className="btn danger block" type="button" onClick={() => void remove()}>
            {t('Borrar documento')}
          </button>
        </>
      )}
    </main>
  );
}
