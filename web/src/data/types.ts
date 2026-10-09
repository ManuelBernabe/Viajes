export type BookingType = 'flight' | 'hotel' | 'train' | 'car' | 'ticket' | 'other';

export const BOOKING_TYPES: readonly BookingType[] = ['flight', 'hotel', 'train', 'car', 'ticket', 'other'];

export interface Trip {
  id: string;
  title: string;
  destination: string | null;
  /** «2026-10-12», fecha local sin hora. */
  startDate: string | null;
  endDate: string | null;
  createdBy: string;
  version: number;
  deletedAtMs: number | null;
}

export type BookingVisibility = 'household' | 'private' | 'some';

export interface Booking {
  id: string;
  tripId: string;
  type: BookingType;
  title: string;
  /** «2026-10-12T10:05», hora del lugar. */
  startLocal: string;
  /** Zona IANA del lugar, «Europe/Madrid». */
  startTz: string;
  startPlace: string | null;
  endLocal: string | null;
  endTz: string | null;
  endPlace: string | null;
  /** Derivado: solo para ordenar y para «lo siguiente». */
  startUtcMs: number;
  reference: string | null;
  address: string | null;
  notes: string | null;
  /** Aviso visible hasta que alguien lo quita: «Modificada el 27/09 según correo: …». */
  changeNote: string | null;
  /** Quién la ve: todo el hogar, solo su creador (y quien administra) o personas concretas. */
  visibility: BookingVisibility;
  /** Con visibilidad «some»: ids de las personas que la ven además del creador y quien administra. */
  sharedWith: string[];
  createdBy: string;
  version: number;
  deletedAtMs: number | null;
}

export interface Attachment {
  id: string;
  bookingId: string;
  name: string;
  mime: string;
  size: number;
  qrText: string | null;
  uploaded: boolean;
  createdBy: string;
  version: number;
  deletedAtMs: number | null;
}

/** Contenido de un adjunto guardado en el móvil. Se guarda como bytes: IndexedDB los conserva en cualquier navegador. */
export interface StoredBlob {
  id: string;
  mime: string;
  size: number;
  bytes: ArrayBuffer;
}

export interface InboxAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  qrText: string | null;
}

export type InboxStatus = 'pending' | 'confirmed' | 'discarded';

/** Un correo importado desde Gmail, pendiente de convertirse en reserva. Solo los pendientes viven en el móvil. */
export interface InboxItem {
  id: string;
  fromAddress: string;
  subject: string;
  receivedMs: number;
  suggestedType: BookingType | null;
  suggestedTitle: string | null;
  suggestedStartLocal: string | null;
  suggestedStartTz: string | null;
  suggestedStartPlace: string | null;
  suggestedEndLocal: string | null;
  suggestedEndTz: string | null;
  suggestedEndPlace: string | null;
  suggestedReference: string | null;
  suggestedAddress: string | null;
  suggestedNotes?: string | null;
  bodyText: string | null;
  status: InboxStatus;
  bookingId: string | null;
  attachments: InboxAttachment[];
  version: number;
  deletedAtMs: number | null;
}

export type PlaceCategory = 'see' | 'eat' | 'drink' | 'shop' | 'nature' | 'other';

export const PLACE_CATEGORIES: readonly PlaceCategory[] = ['see', 'eat', 'drink', 'shop', 'nature', 'other'];

/** Un sitio que merece la pena en un viaje. Lo ve todo el hogar. */
export interface Place {
  id: string;
  tripId: string;
  name: string;
  category: PlaceCategory;
  notes: string | null;
  url: string | null;
  address: string | null;
  visited: boolean;
  createdBy: string;
  /** Cuándo se apuntó; 0 o ausente en los sitios de antes de guardarlo. Lo último añadido sale primero. */
  createdAtMs?: number;
  version: number;
  deletedAtMs: number | null;
}

export interface PlaceBody {
  tripId: string;
  name: string;
  category: PlaceCategory;
  notes: string | null;
  url: string | null;
  address: string | null;
  visited: boolean;
}

export interface SyncResponse {
  version: number;
  /** Todos los viajes visibles ahora; null en una sincronización ligera (sin listas): entonces no se purga nada. */
  tripIds: string[] | null;
  /** Todas las reservas visibles ahora; las locales que no estén aquí se purgan (visibilidad retirada). */
  bookingIds?: string[] | null;
  trips: Trip[];
  bookings: Booking[];
  attachments: Attachment[];
  inbox?: InboxItem[];
  places?: Place[];
  documents?: TravelDocument[];
  /** Todos los documentos visibles ahora; los locales que no estén aquí se purgan (pasados a privados). */
  documentIds?: string[] | null;
  /** Reservas que esta persona ha ocultado de sus listas. */
  hiddenBookingIds?: string[];
}

export type DocumentKind = 'passport' | 'id' | 'visa' | 'insurance' | 'vaccine' | 'license' | 'other';

export const DOCUMENT_KINDS: readonly DocumentKind[] = ['passport', 'id', 'visa', 'insurance', 'vaccine', 'license', 'other'];

/** Un documento de viaje de alguien del hogar. Sus fotos o PDF son adjuntos con `bookingId` = id del documento. */
export interface TravelDocument {
  id: string;
  person: string;
  kind: DocumentKind;
  number: string | null;
  country: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  visibility: 'household' | 'private';
  createdBy: string;
  version: number;
  deletedAtMs: number | null;
}

export type TravelDocumentBody = Omit<TravelDocument, 'id' | 'createdBy' | 'version' | 'deletedAtMs'>;

export interface TripBody {
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface BookingBody {
  tripId: string;
  type: BookingType;
  title: string;
  startLocal: string;
  startTz: string;
  startPlace: string | null;
  endLocal: string | null;
  endTz: string | null;
  endPlace: string | null;
  reference: string | null;
  address: string | null;
  notes: string | null;
  changeNote: string | null;
  visibility?: BookingVisibility;
  sharedWith?: string[];
}

export interface AttachmentBody {
  /** La reserva, o el documento de viaje, al que pertenece. */
  bookingId: string;
  name: string;
  mime: string;
  size: number;
  qrText: string | null;
}

export type Op =
  | { kind: 'put-trip'; id: string; body: TripBody }
  | { kind: 'delete-trip'; id: string }
  | { kind: 'put-booking'; id: string; body: BookingBody }
  | { kind: 'delete-booking'; id: string }
  | { kind: 'put-attachment'; id: string; body: AttachmentBody }
  | { kind: 'delete-attachment'; id: string }
  | { kind: 'put-place'; id: string; body: PlaceBody }
  | { kind: 'delete-place'; id: string }
  | { kind: 'put-document'; id: string; body: TravelDocumentBody }
  | { kind: 'delete-document'; id: string }
  | { kind: 'hide-booking'; id: string }
  | { kind: 'show-booking'; id: string };
