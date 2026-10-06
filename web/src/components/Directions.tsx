import type { Booking } from '../data/types';
import { destinationOf, directionsUrls, isAppleDevice } from '../domain/directions';
import { t } from '../i18n';

/** «Cómo llegar»: abre la ruta en Apple Maps (en el iPhone) o Google Maps, desde donde estés hasta la reserva. */
export function Directions({ booking, small = false }: { booking: Booking; small?: boolean }) {
  const destination = destinationOf(booking);
  if (!destination) {
    return null;
  }
  const urls = directionsUrls(destination);
  const size = small ? ' small' : '';
  return isAppleDevice() ? (
    <>
      <a className={`btn${size}`} href={urls.apple} target="_blank" rel="noreferrer">
        🧭 {t('Cómo llegar')}
      </a>
      <a className={`btn${size}`} href={urls.google} target="_blank" rel="noreferrer">
        Google Maps
      </a>
    </>
  ) : (
    <a className={`btn${size}`} href={urls.google} target="_blank" rel="noreferrer">
      🧭 {t('Cómo llegar')}
    </a>
  );
}
