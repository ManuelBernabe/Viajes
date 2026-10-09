import { useState } from 'react';
import { useSession } from '../app/SessionContext';
import { extractWithAi } from '../attachments/aiExtract';
import { getBlob, listAttachments, saveBooking } from '../data/repo';
import { downloadAttachment } from '../data/syncClient';
import type { Booking } from '../data/types';
import { baggageOf, withBaggage } from '../domain/baggage';
import { t } from '../i18n';

async function saveNotes(booking: Booking, notes: string | null, email: string) {
  await saveBooking(
    {
      tripId: booking.tripId, type: booking.type, title: booking.title, startLocal: booking.startLocal, startTz: booking.startTz,
      startPlace: booking.startPlace, endLocal: booking.endLocal, endTz: booking.endTz, endPlace: booking.endPlace,
      reference: booking.reference, address: booking.address, notes, changeNote: booking.changeNote,
      visibility: booking.visibility ?? 'household', sharedWith: booking.sharedWith ?? [],
    },
    email,
    booking.id,
  );
}

/**
 * «🧳 Equipaje» de un vuelo o tren: lo que dice la reserva (maletas facturadas y de mano). Si no lo dice, se puede leer
 * del billete adjunto con IA o apuntarlo a mano. Se guarda en las notas («Equipaje: …»), así lo ve todo el hogar.
 */
export function BaggageLine({ booking }: { booking: Booking }) {
  const session = useSession();
  const baggage = baggageOf(booking.notes);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(baggage ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save(value: string | null) {
    await saveNotes(booking, withBaggage(booking.notes, value), session.email ?? '');
    setEditing(false);
  }

  async function readTicket() {
    setBusy(true);
    setMessage('');
    try {
      const files = (await listAttachments(booking.id)).filter((a) => a.deletedAtMs === null && (a.mime === 'application/pdf' || a.mime.startsWith('image/')));
      if (files.length === 0) {
        setMessage(t('La reserva no tiene billete adjunto. Apúntalo a mano.'));
        return;
      }
      for (const file of files) {
        const bytes = (await getBlob(file.id))?.bytes ?? (await downloadAttachment(file));
        if (!bytes) {
          continue;
        }
        const result = await extractWithAi(bytes, file.mime, file.name);
        if (result.status === 'unavailable' || result.status === 'offline') {
          setMessage(result.status === 'offline' ? t('Sin conexión: no se puede leer ahora.') : t('La lectura con IA no está configurada.'));
          return;
        }
        const found = result.status === 'ok' ? baggageOf(result.extraction.notes) : null;
        if (found) {
          await save(found);
          return;
        }
      }
      setMessage(t('El billete no dice el equipaje. Míralo en la web de la aerolínea y apúntalo.'));
    } catch {
      setMessage(t('No se ha podido leer el billete.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="baggage">
      {editing ? (
        <form
          className="row"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void save(text);
          }}
        >
          <input className="grow" value={text} autoFocus onChange={(e) => setText(e.target.value)} placeholder={t('2 × 23 kg por pasajero')} aria-label={t('Maletas')} />
          <button className="btn primary" type="submit">
            {t('Guardar')}
          </button>
        </form>
      ) : (
        <>
          <div>
            🧳 {baggage ? (<><span className="muted">{t('Equipaje:')}</span> <strong>{baggage}</strong></>) : <span className="muted">{t('La reserva no dice el equipaje.')}</span>}
          </div>
          <div className="row small" style={{ gap: 14, marginTop: 4 }}>
            {!baggage && (
              <button type="button" className="linklike" disabled={busy} onClick={() => void readTicket()}>
                {busy ? t('Leyendo…') : t('Leer del billete')}
              </button>
            )}
            <button
              type="button"
              className="linklike"
              onClick={() => {
                setText(baggage ?? '');
                setEditing(true);
              }}
            >
              {baggage ? t('Cambiar') : t('Apuntar')}
            </button>
          </div>
        </>
      )}
      {message && <p className="small muted" style={{ marginBottom: 0 }}>{message}</p>}
    </div>
  );
}
