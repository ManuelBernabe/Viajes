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

export interface SyncResponse {
  version: number;
  tripIds: string[];
  trips: Trip[];
  bookings: Booking[];
  attachments: Attachment[];
}

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
}

export interface AttachmentBody {
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
  | { kind: 'delete-attachment'; id: string };
