import { downloadAttachment } from '../data/syncClient';
import { getBlob, updateAttachment } from '../data/repo';
import type { Attachment } from '../data/types';
import { isImage, isPdf } from './files';
import { splitQrCodes } from './qrText';

/** Adjuntos ya releídos en esta sesión: la relectura de lo guardado con la versión anterior se hace una sola vez. */
const rescanned = new Set<string>();

/**
 * Los adjuntos guardados antes de leer varios QR por fichero solo tienen el primero. El fichero se
 * vuelve a leer (del móvil o del servidor) y, si salen más códigos, se guardan.
 */
export async function rescan(attachments: readonly Attachment[]): Promise<void> {
  for (const attachment of attachments) {
    if (rescanned.has(attachment.id) || !(isPdf(attachment.mime) || isImage(attachment.mime))) {
      continue;
    }
    rescanned.add(attachment.id);
    // Del móvil si está guardado; si no, se baja (sin red simplemente no se relee).
    const stored = await getBlob(attachment.id);
    const bytes = stored?.bytes ?? (attachment.uploaded ? await downloadAttachment(attachment).catch(() => null) : null);
    if (!bytes) {
      continue;
    }
    const text = await (await import('./qr')).readQr(bytes, stored?.mime || attachment.mime);
    if (text && splitQrCodes(text).length > splitQrCodes(attachment.qrText).length) {
      await updateAttachment(attachment.id, { qrText: text });
    }
  }
}

