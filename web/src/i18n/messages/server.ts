import type { Messages } from './types';

/**
 * Traducciones: server. Mensajes de error que manda el servidor en español (ProblemDetails `detail` o texto plano),
 * copiados tal cual de server/Viajes.Api. Se traducen con translateServer() en describeError().
 */
export const server: Messages = {
  'Demasiados intentos: la cuenta queda bloqueada 15 minutos. Si no recuerdas la contraseña, pulsa «¿Has olvidado la contraseña?» y te llegará un enlace por correo; con él entras sin esperar.': {
    en: 'Too many attempts: the account is locked for 15 minutes. If you can’t remember your password, tap “Forgot your password?” and you’ll get a link by email; with it you can sign in without waiting.',
    fr: 'Trop de tentatives : le compte est bloqué pendant 15 minutes. Si tu ne te souviens plus du mot de passe, touche « Mot de passe oublié ? » et tu recevras un lien par e-mail ; avec lui, tu entres sans attendre.',
    it: 'Troppi tentativi: l’account resta bloccato per 15 minuti. Se non ricordi la password, tocca «Hai dimenticato la password?» e ti arriverà un link via email; con quello entri senza aspettare.',
  },
  'El adjunto necesita nombre y tipo.': {
    en: 'The attachment needs a name and type.',
    fr: 'La pièce jointe doit avoir un nom et un type.',
    it: 'L’allegato deve avere nome e tipo.',
  },
  'El adjunto se ha borrado.': {
    en: 'The attachment has been deleted.',
    fr: 'La pièce jointe a été supprimée.',
    it: 'L’allegato è stato eliminato.',
  },
  'El archivo supera los 25 MB.': {
    en: 'The file is over 25 MB.',
    fr: 'Le fichier dépasse 25 Mo.',
    it: 'Il file supera i 25 MB.',
  },
  'El correo supera los 25 MB.': {
    en: 'The email is over 25 MB.',
    fr: 'L’e-mail dépasse 25 Mo.',
    it: 'L’email supera i 25 MB.',
  },
  'El código de registro no es válido.': {
    en: 'The sign-up code isn’t valid.',
    fr: 'Le code d’inscription n’est pas valide.',
    it: 'Il codice di registrazione non è valido.',
  },
  'El email no es válido.': {
    en: 'The email isn’t valid.',
    fr: 'L’e-mail n’est pas valide.',
    it: 'L’email non è valida.',
  },
  'El fichero supera los 20 MB.': {
    en: 'The file is over 20 MB.',
    fr: 'Le fichier dépasse 20 Mo.',
    it: 'Il file supera i 20 MB.',
  },
  'El viaje necesita un título (hasta 200 caracteres).': {
    en: 'The trip needs a title (up to 200 characters).',
    fr: 'Le voyage doit avoir un titre (200 caractères max.).',
    it: 'Il viaggio deve avere un titolo (fino a 200 caratteri).',
  },
  'El viaje se ha borrado.': {
    en: 'The trip has been deleted.',
    fr: 'Le voyage a été supprimé.',
    it: 'Il viaggio è stato eliminato.',
  },
  'Email o contraseña incorrectos.': {
    en: 'Wrong email or password.',
    fr: 'E-mail ou mot de passe incorrect.',
    it: 'Email o password errati.',
  },
  'Ese identificador ya está en uso.': {
    en: 'That ID is already in use.',
    fr: 'Cet identifiant est déjà utilisé.',
    it: 'Questo identificativo è già in uso.',
  },
  'Ese tipo de archivo no se puede leer: comparte un PDF, una imagen o un texto.': {
    en: 'That file type can’t be read: share a PDF, an image or some text.',
    fr: 'Ce type de fichier ne peut pas être lu : partage un PDF, une image ou un texte.',
    it: 'Questo tipo di file non si può leggere: condividi un PDF, un’immagine o un testo.',
  },
  'Esta persona ya está en otro hogar con más gente: no se puede borrar su cuenta desde aquí.': {
    en: 'This person is already in another household with other people: their account can’t be deleted from here.',
    fr: 'Cette personne fait déjà partie d’un autre foyer avec d’autres membres : son compte ne peut pas être supprimé d’ici.',
    it: 'Questa persona fa già parte di un’altra famiglia con altre persone: il suo account non si può eliminare da qui.',
  },
  'Estado desconocido.': {
    en: 'Unknown status.',
    fr: 'État inconnu.',
    it: 'Stato sconosciuto.',
  },
  'Este enlace no es válido, ha caducado o ya se ha usado. Pide otro a quien administra tu hogar.': {
    en: 'This link isn’t valid, has expired or has already been used. Ask your household admin for another one.',
    fr: 'Ce lien n’est pas valide, a expiré ou a déjà été utilisé. Demandes-en un autre à la personne qui gère ton foyer.',
    it: 'Questo link non è valido, è scaduto o è già stato usato. Chiedine un altro a chi gestisce la tua famiglia.',
  },
  'Falta el tamaño del fichero.': {
    en: 'The file size is missing.',
    fr: 'La taille du fichier est manquante.',
    it: 'Manca la dimensione del file.',
  },
  'Falta el tamaño del mensaje.': {
    en: 'The message size is missing.',
    fr: 'La taille du message est manquante.',
    it: 'Manca la dimensione del messaggio.',
  },
  'Falta el token de copia de seguridad.': {
    en: 'The backup token is missing.',
    fr: 'Le jeton de sauvegarde est manquant.',
    it: 'Manca il token di backup.',
  },
  'Falta el token de importación.': {
    en: 'The import token is missing.',
    fr: 'Le jeton d’importation est manquant.',
    it: 'Manca il token di importazione.',
  },
  'Falta el token.': {
    en: 'The token is missing.',
    fr: 'Le jeton est manquant.',
    it: 'Manca il token.',
  },
  'Fichero mal codificado.': {
    en: 'Badly encoded file.',
    fr: 'Fichier mal encodé.',
    it: 'File codificato male.',
  },
  'Gmail no validó el remitente (DKIM/SPF).': {
    en: 'Gmail didn’t validate the sender (DKIM/SPF).',
    fr: 'Gmail n’a pas validé l’expéditeur (DKIM/SPF).',
    it: 'Gmail non ha convalidato il mittente (DKIM/SPF).',
  },
  'La clave del atajo no es válida. Genera una nueva en Ajustes → Atajo de iPhone.': {
    en: 'The shortcut key isn’t valid. Generate a new one in Settings → iPhone Shortcut.',
    fr: 'La clé du raccourci n’est pas valide. Génères-en une nouvelle dans Réglages → Raccourci iPhone.',
    it: 'La chiave della scorciatoia non è valida. Generane una nuova in Impostazioni → Comando rapido iPhone.',
  },
  'La contraseña necesita al menos 10 caracteres, con mayúsculas, minúsculas y números.': {
    en: 'The password needs at least 10 characters, with upper case, lower case and numbers.',
    fr: 'Le mot de passe doit comporter au moins 10 caractères, avec majuscules, minuscules et chiffres.',
    it: 'La password deve avere almeno 10 caratteri, con maiuscole, minuscole e numeri.',
  },
  'La invitación no es válida, ha caducado o ya se ha usado.': {
    en: 'The invitation isn’t valid, has expired or has already been used.',
    fr: 'L’invitation n’est pas valide, a expiré ou a déjà été utilisée.',
    it: 'L’invito non è valido, è scaduto o è già stato usato.',
  },
  'La lectura con IA no está configurada en el servidor.': {
    en: 'AI reading isn’t set up on the server.',
    fr: 'La lecture par IA n’est pas configurée sur le serveur.',
    it: 'La lettura con IA non è configurata sul server.',
  },
  'La llegada necesita fecha, hora y una zona horaria válida.': {
    en: 'The arrival needs a date, a time and a valid time zone.',
    fr: 'L’arrivée doit avoir une date, une heure et un fuseau horaire valide.',
    it: 'L’arrivo deve avere data, ora e un fuso orario valido.',
  },
  'La marca debe tener entre 1 y 100 caracteres.': {
    en: 'The mark must be between 1 and 100 characters.',
    fr: 'La marque doit comporter entre 1 et 100 caractères.',
    it: 'Il segno deve avere tra 1 e 100 caratteri.',
  },
  'La reserva necesita un título (hasta 200 caracteres).': {
    en: 'The booking needs a title (up to 200 characters).',
    fr: 'La réservation doit avoir un titre (200 caractères max.).',
    it: 'La prenotazione deve avere un titolo (fino a 200 caratteri).',
  },
  'La reserva se ha borrado.': {
    en: 'The booking has been deleted.',
    fr: 'La réservation a été supprimée.',
    it: 'La prenotazione è stata eliminata.',
  },
  'La salida necesita fecha y hora («2026-10-12T10:05»).': {
    en: 'The departure needs a date and time (“2026-10-12T10:05”).',
    fr: 'Le départ doit avoir une date et une heure (« 2026-10-12T10:05 »).',
    it: 'La partenza deve avere data e ora («2026-10-12T10:05»).',
  },
  'Las fechas van como «2026-10-12».': {
    en: 'Dates go like “2026-10-12”.',
    fr: 'Les dates s’écrivent comme « 2026-10-12 ».',
    it: 'Le date vanno scritte come «2026-10-12».',
  },
  'Los avisos no están configurados en el servidor.': {
    en: 'Notifications aren’t set up on the server.',
    fr: 'Les notifications ne sont pas configurées sur le serveur.',
    it: 'Le notifiche non sono configurate sul server.',
  },
  'No existe o no tienes acceso.': {
    en: 'It doesn’t exist or you don’t have access.',
    fr: 'Cela n’existe pas ou tu n’y as pas accès.',
    it: 'Non esiste o non hai accesso.',
  },
  'No existe.': {
    en: 'It doesn’t exist.',
    fr: 'Cela n’existe pas.',
    it: 'Non esiste.',
  },
  'No ha llegado ningún archivo. Usa «Enviar a Viajes» desde el menú Compartir de un PDF, una imagen o un texto.': {
    en: 'No file arrived. Use “Send to Viajes” from the Share menu of a PDF, an image or some text.',
    fr: 'Aucun fichier n’est arrivé. Utilise « Envoyer à Viajes » depuis le menu Partager d’un PDF, d’une image ou d’un texte.',
    it: 'Non è arrivato nessun file. Usa «Invia a Viajes» dal menu Condividi di un PDF, un’immagine o un testo.',
  },
  'No puedes quitarte a ti mismo del hogar que administras.': {
    en: 'You can’t remove yourself from the household you manage.',
    fr: 'Tu ne peux pas te retirer toi-même du foyer que tu gères.',
    it: 'Non puoi rimuovere te stesso dalla famiglia che gestisci.',
  },
  'No se ha encontrado ninguna reserva en el correo.': {
    en: 'No booking was found in the email.',
    fr: 'Aucune réservation n’a été trouvée dans l’e-mail.',
    it: 'Nessuna prenotazione trovata nell’email.',
  },
  'No se ha encontrado ninguna reserva en el documento.': {
    en: 'No booking was found in the document.',
    fr: 'Aucune réservation n’a été trouvée dans le document.',
    it: 'Nessuna prenotazione trovata nel documento.',
  },
  'No se ha podido borrar la cuenta.': {
    en: 'The account couldn’t be deleted.',
    fr: 'Impossible de supprimer le compte.',
    it: 'Non è stato possibile eliminare l’account.',
  },
  'No se ha podido crear la cuenta. Inténtalo de nuevo.': {
    en: 'The account couldn’t be created. Please try again.',
    fr: 'Impossible de créer le compte. Réessaie.',
    it: 'Non è stato possibile creare l’account. Riprova.',
  },
  'No se puede leer el correo.': {
    en: 'The email can’t be read.',
    fr: 'Impossible de lire l’e-mail.',
    it: 'Impossibile leggere l’email.',
  },
  'Para crear una cuenta hace falta un enlace de invitación.': {
    en: 'You need an invitation link to create an account.',
    fr: 'Il faut un lien d’invitation pour créer un compte.',
    it: 'Per creare un account serve un link di invito.',
  },
  'Para tu propia cuenta usa «Cambiar contraseña» en Ajustes.': {
    en: 'For your own account, use “Change password” in Settings.',
    fr: 'Pour ton propre compte, utilise « Changer le mot de passe » dans Réglages.',
    it: 'Per il tuo account usa «Cambia password» in Impostazioni.',
  },
  'Petición no válida.': {
    en: 'Invalid request.',
    fr: 'Requête non valide.',
    it: 'Richiesta non valida.',
  },
  'Solo quien administra el hogar puede borrar cuentas.': {
    en: 'Only the household admin can delete accounts.',
    fr: 'Seule la personne qui gère le foyer peut supprimer des comptes.',
    it: 'Solo chi gestisce la famiglia può eliminare account.',
  },
  'Solo quien administra el hogar puede crear tokens.': {
    en: 'Only the household admin can create tokens.',
    fr: 'Seule la personne qui gère le foyer peut créer des jetons.',
    it: 'Solo chi gestisce la famiglia può creare token.',
  },
  'Solo quien administra el hogar puede generar enlaces para cambiar la contraseña.': {
    en: 'Only the household admin can create password reset links.',
    fr: 'Seule la personne qui gère le foyer peut générer des liens pour changer le mot de passe.',
    it: 'Solo chi gestisce la famiglia può generare link per cambiare la password.',
  },
  'Solo quien administra el hogar puede quitar miembros.': {
    en: 'Only the household admin can remove members.',
    fr: 'Seule la personne qui gère le foyer peut retirer des membres.',
    it: 'Solo chi gestisce la famiglia può rimuovere membri.',
  },
  'Solo quien administra el hogar puede revocar tokens.': {
    en: 'Only the household admin can revoke tokens.',
    fr: 'Seule la personne qui gère le foyer peut révoquer des jetons.',
    it: 'Solo chi gestisce la famiglia può revocare token.',
  },
  'Suscripción incompleta.': {
    en: 'Incomplete subscription.',
    fr: 'Abonnement incomplet.',
    it: 'Iscrizione incompleta.',
  },
  'Tipo de reserva desconocido.': {
    en: 'Unknown booking type.',
    fr: 'Type de réservation inconnu.',
    it: 'Tipo di prenotazione sconosciuto.',
  },
  'Tipo de token desconocido.': {
    en: 'Unknown token type.',
    fr: 'Type de jeton inconnu.',
    it: 'Tipo di token sconosciuto.',
  },
  'Token no válido o revocado.': {
    en: 'Invalid or revoked token.',
    fr: 'Jeton non valide ou révoqué.',
    it: 'Token non valido o revocato.',
  },
  'Token no válido para copias de seguridad.': {
    en: 'Token not valid for backups.',
    fr: 'Jeton non valide pour les sauvegardes.',
    it: 'Token non valido per i backup.',
  },
  'Visibilidad desconocida.': {
    en: 'Unknown visibility.',
    fr: 'Visibilité inconnue.',
    it: 'Visibilità sconosciuta.',
  },
  'Ya existe una cuenta con ese email.': {
    en: 'There’s already an account with that email.',
    fr: 'Un compte existe déjà avec cet e-mail.',
    it: 'Esiste già un account con questa email.',
  },
  'Zona horaria de salida desconocida.': {
    en: 'Unknown departure time zone.',
    fr: 'Fuseau horaire de départ inconnu.',
    it: 'Fuso orario di partenza sconosciuto.',
  },
  '✓ Enviado a Viajes: lo tienes en «por revisar».': {
    en: '✓ Sent to Viajes: you’ll find it in “to review”.',
    fr: '✓ Envoyé à Viajes : tu le trouveras dans « à vérifier ».',
    it: '✓ Inviato a Viajes: lo trovi in «da rivedere».',
  },
  'Esta cuenta ya tiene viajes en su propio hogar. Bórralos o usa otra cuenta para unirte.': {
    en: 'This account already has trips in its own household. Delete them or use another account to join.',
    fr: 'Ce compte a déjà des voyages dans son propre foyer. Supprime-les ou utilise un autre compte pour rejoindre.',
    it: 'Questo account ha già dei viaggi nella propria famiglia. Eliminali o usa un altro account per unirti.',
  },
  'La petición no viene de la propia app.': {
    en: 'The request doesn’t come from the app itself.',
    fr: 'La requête ne provient pas de l’app elle-même.',
    it: 'La richiesta non proviene dall’app stessa.',
  },
};
