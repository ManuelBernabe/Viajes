import type { Messages } from './types';

/** El tiempo, el resumen de mañana y el estado de los vuelos. */
export const travel: Messages = {
  Despejado: { en: 'Clear', fr: 'Dégagé', it: 'Sereno' },
  'Casi despejado': { en: 'Mostly clear', fr: 'Plutôt dégagé', it: 'Quasi sereno' },
  'Nubes y claros': { en: 'Partly cloudy', fr: 'Éclaircies', it: 'Parzialmente nuvoloso' },
  Nublado: { en: 'Cloudy', fr: 'Nuageux', it: 'Nuvoloso' },
  Niebla: { en: 'Fog', fr: 'Brouillard', it: 'Nebbia' },
  Llovizna: { en: 'Drizzle', fr: 'Bruine', it: 'Pioviggine' },
  Lluvia: { en: 'Rain', fr: 'Pluie', it: 'Pioggia' },
  'Lluvia fuerte': { en: 'Heavy rain', fr: 'Forte pluie', it: 'Pioggia forte' },
  Nieve: { en: 'Snow', fr: 'Neige', it: 'Neve' },
  Tormenta: { en: 'Thunderstorm', fr: 'Orage', it: 'Temporale' },
  'Tiempo variable': { en: 'Changeable', fr: 'Variable', it: 'Variabile' },
  'El tiempo': { en: 'Weather', fr: 'Météo', it: 'Meteo' },
  'lluvia {n} %': { en: 'rain {n}%', fr: 'pluie {n} %', it: 'pioggia {n}%' },
  'Previsión de Open-Meteo para donde dormís cada noche. Llega hasta 16 días por delante.': {
    en: 'Open-Meteo forecast for where you sleep each night. It covers up to 16 days ahead.',
    fr: 'Prévisions Open-Meteo pour l’endroit où vous dormez chaque nuit. Jusqu’à 16 jours à l’avance.',
    it: 'Previsioni Open-Meteo per dove dormite ogni notte. Fino a 16 giorni in anticipo.',
  },
};
