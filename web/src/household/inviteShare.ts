import { t } from '../i18n';
import { createInvitation } from './household';

/**
 * Crea una invitación al hogar y la comparte (WhatsApp, Mensajes…). Si el móvil no puede compartir, la copia. Devuelve el
 * enlace, por si hay que enseñarlo.
 */
export async function inviteAndShare(): Promise<{ url: string; shared: 'shared' | 'copied' | 'none' }> {
  const { url } = await createInvitation();
  const text = t('Únete a mis viajes en la app Viajes: {url}', { url });
  if (navigator.share) {
    try {
      await navigator.share({ title: t('Invitación a Viajes'), text, url });
      return { url, shared: 'shared' };
    } catch {
      // Cancelado: se intenta copiar.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return { url, shared: 'copied' };
  } catch {
    return { url, shared: 'none' };
  }
}
