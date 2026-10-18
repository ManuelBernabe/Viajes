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
};
