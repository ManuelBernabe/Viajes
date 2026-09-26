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
