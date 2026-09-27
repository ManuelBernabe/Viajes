/**
 * Viajes · importación desde Gmail.
 *
 * Cada minuto busca los correos con la etiqueta «Viajes», envía cada uno completo (formato RFC 822) a la app
 * y le cambia la etiqueta a «Viajes/Importado». Si la app falla, le pone «Viajes/Error» y no lo reintenta.
 *
 * Configuración (Configuración del proyecto → Propiedades del script):
 *   VIAJES_URL    = https://viajes-production-82cb.up.railway.app
 *   VIAJES_TOKEN  = el token generado en Ajustes → Importar desde Gmail
 *
 * Activador: función `importarViajes`, basado en tiempo, cada minuto.
 */

const ETIQUETA = 'Viajes';
const ETIQUETA_OK = 'Viajes/Importado';
const ETIQUETA_ERROR = 'Viajes/Error';

function importarViajes() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('VIAJES_URL');
  const token = props.getProperty('VIAJES_TOKEN');
  if (!url || !token) {
    throw new Error('Faltan VIAJES_URL o VIAJES_TOKEN en las propiedades del script.');
  }

  const pendiente = etiqueta(ETIQUETA);
  const importado = etiqueta(ETIQUETA_OK);
  const error = etiqueta(ETIQUETA_ERROR);

  const hilos = pendiente.getThreads(0, 20);
  for (const hilo of hilos) {
    let todoBien = true;
    for (const mensaje of hilo.getMessages()) {
      try {
        const respuesta = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/api/inbox/import', {
          method: 'post',
          contentType: 'message/rfc822',
          headers: { Authorization: 'Bearer ' + token },
          payload: mensaje.getRawContent(),
          muteHttpExceptions: true,
        });
        const codigo = respuesta.getResponseCode();
        if (codigo !== 200) {
          console.error('La app rechazó el correo «' + mensaje.getSubject() + '»: ' + codigo + ' ' + respuesta.getContentText());
          todoBien = false;
        }
      } catch (e) {
        console.error('No se pudo enviar «' + mensaje.getSubject() + '»: ' + e);
        todoBien = false;
      }
    }
    hilo.removeLabel(pendiente);
    hilo.addLabel(todoBien ? importado : error);
  }
}

function etiqueta(nombre) {
  return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
}

/**
 * Copia de seguridad en Google Drive.
 *
 * Descarga de la app un zip con todo (base de datos, billetes y claves) y lo guarda en la carpeta
 * «Viajes - copias de seguridad» de tu Drive. Conserva las 14 copias más recientes.
 *
 * Configuración (Propiedades del script):
 *   VIAJES_URL           = la misma de arriba
 *   VIAJES_BACKUP_TOKEN  = el token generado en Ajustes → Copias de seguridad → «Generar token de copia para Drive»
 *
 * Activador: función `copiaDeSeguridad`, basado en tiempo, temporizador diario, entre las 3 y las 4 de la madrugada.
 */

const CARPETA_COPIAS = 'Viajes - copias de seguridad';
const COPIAS_A_CONSERVAR = 14;

function copiaDeSeguridad() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('VIAJES_URL');
  const token = props.getProperty('VIAJES_BACKUP_TOKEN');
  if (!url || !token) {
    throw new Error('Faltan VIAJES_URL o VIAJES_BACKUP_TOKEN en las propiedades del script.');
  }

  const respuesta = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/api/backup', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (respuesta.getResponseCode() !== 200) {
    throw new Error('La app no devolvió la copia: ' + respuesta.getResponseCode() + ' ' + respuesta.getContentText());
  }

  const carpeta = carpetaDeCopias();
  const nombre = 'viajes-' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd-HHmm') + '.zip';
  const fichero = carpeta.createFile(respuesta.getBlob().setName(nombre));
  console.log('Copia guardada: ' + nombre + ' (' + Math.round(fichero.getSize() / 1024) + ' KB)');

  // Se conservan las más recientes; el resto van a la papelera de Drive.
  const ficheros = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    ficheros.push(it.next());
  }
  ficheros.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  ficheros.slice(COPIAS_A_CONSERVAR).forEach((f) => f.setTrashed(true));
}

function carpetaDeCopias() {
  const existentes = DriveApp.getFoldersByName(CARPETA_COPIAS);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CARPETA_COPIAS);
}
