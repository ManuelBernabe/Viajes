import { auth } from './auth';
import { common } from './common';
import { guide } from './guide';
import { inbox } from './inbox';
import { places } from './places';
import { server } from './server';
import { settings } from './settings';
import { trips } from './trips';
import type { Messages } from './types';

export const SOURCES: Record<string, Messages> = { common, trips, inbox, settings, auth, server, guide, places };

/** Todas juntas. Si una clave está en dos ficheros con la misma traducción, da igual; el test avisa si difieren. */
export const MESSAGES: Messages = Object.assign({}, ...Object.values(SOURCES));
