import type { Messages } from './types';

/** Vuelos y trenes con escala, en una sola tarjeta. */
export const connections: Messages = {
  '1 escala': { en: '1 stop', fr: '1 escale', it: '1 scalo' },
  '{n} escalas': { en: '{n} stops', fr: '{n} escales', it: '{n} scali' },
  'Escala en {place}': { en: 'Layover in {place}', fr: 'Escale à {place}', it: 'Scalo a {place}' },
  ajustada: { en: 'tight', fr: 'serrée', it: 'stretto' },
  QR: { en: 'QR', fr: 'QR', it: 'QR' },
  Hecho: { en: 'Done', fr: 'Fait', it: 'Fatto' },
  'llegada a las {time}': { en: 'arriving at {time}', fr: 'arrivée à {time}', it: 'arrivo alle {time}' },
  'llegada {time}': { en: 'arrives {time}', fr: 'arrivée {time}', it: 'arrivo {time}' },
  'sale en {time}': { en: 'departs in {time}', fr: 'départ dans {time}', it: 'parte tra {time}' },
  'vía {places}': { en: 'via {places}', fr: 'via {places}', it: 'via {places}' },
  'Duración total {time}': { en: 'Total {time}', fr: 'Durée totale {time}', it: 'Durata totale {time}' },
  // Estado del vuelo: «↻ Actualizar» y mostradores de facturación.
  'Sin conexión: no se ha podido actualizar.': {
    en: 'Offline: could not update.',
    fr: 'Hors ligne : mise à jour impossible.',
    it: 'Offline: impossibile aggiornare.',
  },
  'Comprobado ahora mismo.': { en: 'Checked just now.', fr: 'Vérifié à l’instant.', it: 'Controllato adesso.' },
  'Comprobado ahora mismo: el proveedor aún no tiene datos de este vuelo.': {
    en: 'Checked just now: the provider has no data for this flight yet.',
    fr: 'Vérifié à l’instant : le fournisseur n’a pas encore de données sur ce vol.',
    it: 'Controllato adesso: il fornitore non ha ancora dati su questo volo.',
  },
  'Ya se comprobó {ago}. Para no gastar el cupo del proveedor, se puede volver a pedir en {m} min (los cambios importantes te llegan como aviso).': {
    en: 'Already checked {ago}. To save the provider quota you can ask again in {m} min (important changes reach you as notifications).',
    fr: 'Déjà vérifié {ago}. Pour ménager le quota du fournisseur, vous pourrez redemander dans {m} min (les changements importants arrivent en notification).',
    it: 'Già controllato {ago}. Per non consumare la quota del fornitore puoi richiederlo tra {m} min (i cambi importanti arrivano come notifica).',
  },
  'El proveedor no ha respondido; prueba en un rato.': {
    en: 'The provider did not respond; try again in a while.',
    fr: 'Le fournisseur n’a pas répondu ; réessayez plus tard.',
    it: 'Il fornitore non ha risposto; riprova tra poco.',
  },
  'Facturación: abre hacia las {open} (en {wait}) y cierra a las {close}': {
    en: 'Bag drop: opens around {open} (in {wait}) and closes at {close}',
    fr: 'Enregistrement des bagages : ouvre vers {open} (dans {wait}) et ferme à {close}',
    it: 'Check-in bagagli: apre verso le {open} (tra {wait}) e chiude alle {close}',
  },
  'Facturación cerrada (cerraba hacia las {close}); habla con la aerolínea si aún no has facturado': {
    en: 'Bag drop closed (closed around {close}); talk to the airline if you have not checked in yet',
    fr: 'Enregistrement fermé (vers {close}) ; adressez-vous à la compagnie si vous n’avez pas encore enregistré',
    it: 'Check-in chiuso (verso le {close}); parla con la compagnia se non hai ancora fatto il check-in',
  },
  'Facturación abierta: cierra hacia las {close} (en {wait})': {
    en: 'Bag drop open: closes around {close} (in {wait})',
    fr: 'Enregistrement ouvert : ferme vers {close} (dans {wait})',
    it: 'Check-in bagagli aperto: chiude verso le {close} (tra {wait})',
  },
  'horario aproximado': { en: 'approximate times', fr: 'horaires approximatifs', it: 'orari indicativi' },
};
