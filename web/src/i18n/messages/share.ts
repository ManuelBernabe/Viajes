import type { Messages } from './types';

/** Compartir el itinerario con un enlace de solo lectura. */
export const share: Messages = {
  Itinerario: { en: 'Itinerary', fr: 'Itinéraire', it: 'Itinerario' },
  'Mi itinerario de «{trip}»:': { en: 'My itinerary for “{trip}”:', fr: 'Mon itinéraire pour « {trip} » :', it: 'Il mio itinerario di «{trip}»:' },
  '¿Anular el enlace? Quien lo tenga ya no podrá ver el itinerario.': {
    en: 'Revoke the link? Anyone who has it will no longer see the itinerary.',
    fr: 'Annuler le lien ? Ceux qui l’ont ne pourront plus voir l’itinéraire.',
    it: 'Annullare il link? Chi lo ha non potrà più vedere l’itinerario.',
  },
  'Compartir itinerario': { en: 'Share itinerary', fr: 'Partager l’itinéraire', it: 'Condividi itinerario' },
  'Un enlace de solo lectura para quien no usa la app: verá las reservas día a día, con horas y lugares.': {
    en: 'A read-only link for people who don’t use the app: they’ll see the bookings day by day, with times and places.',
    fr: 'Un lien en lecture seule pour ceux qui n’utilisent pas l’app : ils verront les réservations jour par jour, avec heures et lieux.',
    it: 'Un link di sola lettura per chi non usa l’app: vedrà le prenotazioni giorno per giorno, con orari e luoghi.',
  },
  'Salen las reservas que ve todo el hogar; las privadas no.': {
    en: 'Bookings the whole household sees are included; private ones aren’t.',
    fr: 'Les réservations visibles par tout le foyer y figurent ; les privées non.',
    it: 'Compaiono le prenotazioni visibili a tutta la famiglia; quelle private no.',
  },
  'No salen localizadores, notas ni billetes.': {
    en: 'No booking codes, notes or tickets are shown.',
    fr: 'Ni références, ni notes, ni billets n’apparaissent.',
    it: 'Non compaiono codici di prenotazione, note né biglietti.',
  },
  'Desde la página se puede imprimir o guardar en PDF.': {
    en: 'The page can be printed or saved as PDF.',
    fr: 'La page peut être imprimée ou enregistrée en PDF.',
    it: 'La pagina si può stampare o salvare in PDF.',
  },
  'Se actualiza solo y puedes anularlo cuando quieras.': {
    en: 'It updates by itself and you can revoke it whenever you like.',
    fr: 'Il se met à jour tout seul et vous pouvez l’annuler quand vous voulez.',
    it: 'Si aggiorna da solo e puoi annullarlo quando vuoi.',
  },
  'Crear enlace': { en: 'Create link', fr: 'Créer le lien', it: 'Crea link' },
  Copiado: { en: 'Copied', fr: 'Copié', it: 'Copiato' },
  'Ver o guardar PDF': { en: 'View or save PDF', fr: 'Voir ou enregistrer en PDF', it: 'Vedi o salva PDF' },
  'Anular enlace': { en: 'Revoke link', fr: 'Annuler le lien', it: 'Annulla link' },
};
