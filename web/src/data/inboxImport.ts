import { readQr } from '../attachments/qr';
import { addAttachment, getInboxItem } from './repo';
import { downloadInboxAttachment, setInboxStatus } from './syncClient';

/** Los adjuntos del correo pasan a ser adjuntos normales de la reserva (con su QR) y el borrador se cierra como confirmado. */
export async function importInboxAttachments(
  inboxItemId: string,
  bookingId: string,
  createdBy: string,
  onProgress?: (message: string) => void,
): Promise<void> {
  const item = await getInboxItem(inboxItemId);
  if (!item) {
    return;
  }
  for (const attachment of item.attachments) {
    onProgress?.(`Trayendo ${attachment.name}…`);
    const bytes = await downloadInboxAttachment(item.id, attachment.id);
    const qrText = attachment.qrText ?? (await readQr(bytes, attachment.mime));
    await addAttachment({ bookingId, name: attachment.name, mime: attachment.mime, size: bytes.byteLength, qrText }, bytes, createdBy);
  }
  await setInboxStatus(item.id, 'confirmed', bookingId);
}
