import type { Booking } from '../data/types';

/**
 * A dónde hay que ir para una reserva: al aeropuerto o la estación de salida, al hotel, a la recogida del coche, al
 * sitio de la entrada… Un código de aeropuerto («AEP») se busca como «AEP Airport», que los mapas entienden.
 */
export function destinationOf(booking: Pick<Booking, 'type' | 'title' | 'startPlace' | 'address'>): string | null {
  const place = booking.startPlace?.trim() || null;
  const address = booking.address?.trim() || null;
  switch (booking.type) {
    case 'flight':
      return place ? (/^[A-Z]{3}$/i.test(place) ? `${place.toUpperCase()} Airport` : place) : null;
    case 'train':
      return place;
    case 'hotel':
      // Con el nombre del hotel delante, el mapa acierta más que solo con la calle.
      return address ? (place && !address.toLowerCase().includes(place.toLowerCase()) ? `${place}, ${address}` : address) : place;
    default:
      return address ?? place;
  }
}

export function isAppleDevice(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent);
}

/** Enlaces de «Cómo llegar» desde donde estés: Apple Maps (en el iPhone) y Google Maps. */
export function directionsUrls(destination: string): { apple: string; google: string } {
  const q = encodeURIComponent(destination);
  return {
    apple: `https://maps.apple.com/?daddr=${q}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}
