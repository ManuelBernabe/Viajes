import type { Messages } from './types';

/** Traducciones: common. Clave = el texto en español tal y como aparece en el código. */
export const common: Messages = {
  'Subir arriba del todo': { en: 'Scroll to top', fr: 'Remonter en haut', it: 'Torna in cima' },
  'Bajar hasta el final': { en: 'Scroll to bottom', fr: 'Descendre en bas', it: 'Vai in fondo' },
  Acercar: { en: 'Zoom in', fr: 'Zoomer', it: 'Ingrandisci' },
  Alejar: { en: 'Zoom out', fr: 'Dézoomer', it: 'Rimpicciolisci' },
  'No se ha podido completar. Inténtalo de nuevo.': {
    en: 'It could not be completed. Please try again.',
    fr: 'Impossible de terminer. Réessaie.',
    it: 'Non è stato possibile completare. Riprova.',
  },
  'Sin conexión. Inténtalo cuando tengas cobertura.': {
    en: 'No connection. Try again when you have signal.',
    fr: 'Pas de connexion. Réessaie quand tu auras du réseau.',
    it: 'Nessuna connessione. Riprova quando avrai campo.',
  },
};
