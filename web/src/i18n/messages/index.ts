import { auth } from './auth';
import { common } from './common';
import { destination } from './destination';
import { documents } from './documents';
import { emergency } from './emergency';
import { guide } from './guide';
import { inbox } from './inbox';
import { journal } from './journal';
import { packing } from './packing';
import { places } from './places';
import { server } from './server';
import { settings } from './settings';
import { share } from './share';
import { travel } from './travel';
import { trips } from './trips';
import type { Messages } from './types';

export const SOURCES: Record<string, Messages> = { common, trips, inbox, settings, auth, server, guide, places, documents, travel, packing, destination, share, emergency, journal };

/** Todas juntas. Si una clave está en dos ficheros con la misma traducción, da igual; el test avisa si difieren. */
export const MESSAGES: Messages = Object.assign({}, ...Object.values(SOURCES));
