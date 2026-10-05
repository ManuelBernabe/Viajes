import { Shot } from './Shot';

/** Corpo della guida in italiano (segue GuideEs sezione per sezione). */
export function GuideIt() {
  return (
    <>
      <section className="card">
        <h3>Cos’è Viajes</h3>
        <p className="small">
          Un’app per avere sul telefono tutte le prenotazioni di un viaggio: voli, treni, hotel, auto e biglietti d’ingresso, con i loro
          biglietti e codici QR. Funziona offline, ti avvisa prima di ogni partenza e le persone della stessa «famiglia» vedono le stesse
          cose.
        </p>
      </section>

      <section className="card">
        <h3>1. Installarla sull’iPhone</h3>
        <ol className="small">
          <li>Apri in Safari il link d’invito che ti hanno mandato e crea il tuo account (email e password).</li>
          <li>
            Tocca il pulsante <strong>Condividi</strong> di Safari (il quadrato con la freccia) e scegli{' '}
            <strong>Aggiungi alla schermata Home</strong>.
          </li>
          <li>
            Da lì in poi, apri sempre Viajes <strong>dall’icona</strong>. Solo così funziona offline e può mandarti le notifiche.
          </li>
          <li>
            Quando c’è una nuova versione compare l’avviso «È disponibile una nuova versione»: tocca <strong>Aggiorna ora</strong>.
          </li>
        </ol>
        <Shot file="11-invitacion.png" caption="Il link d’invito: crea il tuo account o accedi con quello che hai già." />
      </section>

      <section className="card">
        <h3>2. Home</h3>
        <ul className="small">
          <li>
            La Home è l’<strong>elenco dei viaggi</strong>: in alto quelli <strong>in corso</strong>, poi i <strong>prossimi</strong>.
            Ogni scheda dice quante prenotazioni ha e qual è la successiva. Con <strong>Nuovo viaggio</strong> ne crei uno (titolo,
            destinazione e date).
          </li>
          <li>
            Toccando un viaggio ci entri: in alto <strong>Prossimo</strong> con i pulsanti <strong>Mostra QR</strong> e{' '}
            <strong>Vedi prenotazione</strong>; sotto tutte le prenotazioni per giorno e, alla fine, lo <strong>Storico</strong> con quelle
            già passate (attenuate e segnate come «Completata»).
          </li>
          <li>
            <strong>Storico</strong>, in fondo alla Home: i viaggi già fatti, chiusi e raggruppati per anno, segnati in arancione come
            «Completato». Si aprono allo stesso modo per consultare prenotazioni e biglietti.
          </li>
          <li>
            Se compare <strong>«N email da controllare»</strong>, sono arrivate email di prenotazione che aspettano che qualcuno le
            confermi (sezione 5).
          </li>
        </ul>
        <Shot file="01-inicio.png" caption="Home: email da controllare, il viaggio in corso, il prossimo passo e il pulsante per aprire tutte le sue prenotazioni." />
        <Shot file="14-inicio-desplegado.png" caption="Le prenotazioni del viaggio aperte per giorno, senza uscire dalla Home." />
        <Shot file="15-historico.png" caption="Lo storico in fondo: viaggi completati per anno, in arancione." />
      </section>

      <section className="card">
        <h3>3. Viaggi e prenotazioni</h3>
        <ul className="small">
          <li>
            Aprendo un viaggio vedi le sue prenotazioni per giorno, con i filtri per tipo, il pulsante{' '}
            <strong>+ Aggiungi prenotazione</strong> e quello per salvarlo sul telefono.
          </li>
          <li>
            In <strong>Nuova prenotazione</strong> scegli il tipo (volo, hotel, treno, auto, biglietto d’ingresso o altro), il titolo, la
            partenza con ora e luogo e, se vuoi, l’arrivo, il codice di prenotazione, l’indirizzo e delle note.
          </li>
          <li>
            <strong>Il modo più veloce</strong>: in «Allegati», carica il PDF del biglietto o una foto della carta d’imbarco. L’app lo legge
            e compila i campi da sola; tu controlli e tocchi <strong>Salva</strong>.
          </li>
          <li>
            Gli orari sono sempre quelli <strong>locali</strong> (l’ora di Buenos Aires per un volo che parte da Buenos Aires). L’app
            ordina tutto in base al momento reale, quindi non devi calcolare niente.
          </li>
          <li>
            Se carichi un biglietto di una prenotazione che esiste già, l’app se ne accorge e propone{' '}
            <strong>Aggiorna quella prenotazione</strong> invece di duplicarla.
          </li>
        </ul>
        <Shot file="02-viaje.png" caption="Un viaggio: le prenotazioni per giorno, «+ Aggiungi prenotazione» e il pulsante per salvarlo sul telefono." />
        <Shot file="03-nueva-reserva.png" caption="Nuova prenotazione: tipo, titolo, partenza e, sotto, gli allegati che compilano il modulo." />
      </section>

      <section className="card">
        <h3>4. Biglietti e codici QR</h3>
        <ul className="small">
          <li>
            <strong>Comando rapido «Enviar a Viajes»</strong> (iPhone): da un PDF, uno screenshot o un testo,{' '}
            <strong>Condividi → Enviar a Viajes</strong> e compare tra quelle «da controllare» con i dati già letti. Si installa da
            Impostazioni → Comando rapido iPhone: genera la tua chiave, installa il comando rapido e incolla la chiave nel suo blocco Testo.
          </li>
          <li>
            In ogni prenotazione puoi aggiungere altri allegati con <strong>+ Allega</strong> (fotocamera, Foto o File). Se uno contiene un
            QR o un codice a barre, l’app lo legge quando lo salvi e lo segna con «QR». Se il biglietto è per più passeggeri (sulla stessa
            pagina o su pagine diverse), li legge tutti e lo segna con «2 QR», «3 QR»…
          </li>
          <li>
            <strong>Mostra QR</strong> lo mostra a schermo intero su sfondo bianco, pronto per l’imbarco. Lo schermo non si spegne finché è
            aperto. Con più passeggeri compare il nome di ognuno e si passa dall’uno all’altro con i pulsanti in basso.{' '}
            <strong>Vedi originale</strong> apre il biglietto intero.
          </li>
          <li>Toccando un allegato si apre l’originale (il PDF intero, per esempio).</li>
        </ul>
        <Shot file="04-reserva.png" caption="Una prenotazione: «Mostra QR», i dati e gli allegati (il biglietto ha il segno «QR»)." />
        <Shot file="05-qr.png" caption="Mostra QR: a schermo intero per il controllo. Non serve la connessione." />
      </section>

      <section className="card">
        <h3>5. Email delle prenotazioni</h3>
        <ul className="small">
          <li>
            Le conferme che arrivano all’email della famiglia entrano da sole nell’app. Se hai una prenotazione nella tua email,
            <strong> inoltrala</strong> all’indirizzo di importazione della famiglia (chiedi a chi ti ha invitato; finisce con
            «+viajes@gmail.com»).
          </li>
          <li>
            In un paio di minuti compare nella Home come «email da controllare». Aprila, verifica i dati che l’app ha letto, scegli il
            viaggio e tocca <strong>Crea prenotazione</strong>. Gli allegati dell’email passano alla prenotazione. Se non ti interessa,{' '}
            <strong>Scarta</strong>.
          </li>
          <li>
            Se l’email è una <strong>modifica</strong> di una prenotazione già presente (un altro orario, un altro posto…), l’app la
            riconosce, applica la modifica e lascia un avviso rosso sulla prenotazione con i dettagli. Quando l’hai visto, tocca{' '}
            <strong>Ho capito, togli l’avviso</strong>.
          </li>
        </ul>
        <Shot file="07-correo.png" caption="Un’email da controllare: cosa ha letto l’app, il viaggio dove salvarla e «Crea prenotazione»." />
        <Shot file="13-aviso-cambio.png" caption="Avviso rosso su una prenotazione modificata da un’email, con il prima e il dopo." wide />
        <Shot file="06-reserva-modificada.png" caption="La prenotazione ha già il nuovo orario; l’avviso si toglie con «Ho capito»." />
      </section>

      <section className="card">
        <h3>6. Offline</h3>
        <ul className="small">
          <li>
            In ogni viaggio c’è un pulsante <strong>Salva sul telefono</strong>: scarica tutte le prenotazioni e i biglietti per vederli
            senza campo (in aereo, all’estero senza dati). Fallo prima di partire, con il Wi-Fi. Quando ha finito compare «Pronto
            offline».
          </li>
          <li>
            Quello che modifichi offline resta sul telefono e viene inviato da solo quando torna la rete. In Impostazioni →
            Sincronizzazione vedi se c’è ancora qualcosa in sospeso.
          </li>
          <li>
            <strong>Rimuovi dal telefono</strong> libera spazio quando il viaggio è passato (in Impostazioni puoi farlo anche in un colpo
            solo per tutti i viaggi passati).
          </li>
        </ul>
        <Shot file="12-sincronizacion.png" caption="Impostazioni → Sincronizzazione: quando è stata l’ultima e se c’è ancora qualcosa da inviare." wide />
      </section>

      <section className="card">
        <h3>7. Notifiche</h3>
        <ul className="small">
          <li>
            In Impostazioni → Notifiche, tocca <strong>Attiva le notifiche su questo telefono</strong> e accetta il permesso. Si fa una
            volta per telefono.
          </li>
          <li>
            Ne arrivano di tre tipi: <strong>la sera prima alle 20:00</strong> (ora locale), <strong>tre ore prima</strong> della partenza
            e <strong>subito</strong> se un’email modifica una prenotazione. Toccando la notifica si apre la prenotazione.
          </li>
          <li>
            Se non arrivano, controlla che non ci sia una modalità Full immersion attiva e che Viajes abbia il permesso in Impostazioni
            dell’iPhone → Notifiche.
          </li>
        </ul>
        <Shot file="10-avisos.png" caption="Impostazioni → Notifiche: attivare le notifiche su questo telefono." wide />
      </section>

      <section className="card">
        <h3>8. Famiglia e account</h3>
        <ul className="small">
          <li>
            Ognuno ha il suo account e la sua password. I viaggi sono della famiglia e li vedono tutti. Ogni prenotazione ha una sezione{' '}
            <strong>Chi la vede</strong>: «Tutta la famiglia», «Solo io» o «Persone specifiche» (una casella per invitato). Quelle
            dell’amministratore nascono visibili a tutta la famiglia; quelle di un invitato, solo a lui e all’amministratore, che vede
            sempre tutto. Solo chi ha creato la prenotazione o l’amministratore può cambiare chi la vede.
          </li>
          <li>
            In Impostazioni → Famiglia chiunque può <strong>Invita qualcuno</strong>: si crea un link monouso che scade dopo trenta
            giorni. Solo l’amministratore della famiglia può rimuovere membri e generare o revocare i token di Gmail e dei backup; gli
            altri vedono quelle sezioni senza pulsanti.
          </li>
          <li>
            <strong>Password dimenticata</strong>: nella schermata di accesso, <strong>Hai dimenticato la password?</strong> → scrivi la
            tua email → in un paio di minuti arriva un’email con un link (la manda lo script Gmail della famiglia). Può generarlo anche
            l’amministratore con <strong>Password</strong> accanto a quella persona in Impostazioni → Famiglia. Il link vale una volta e
            dura 24 ore: aprendolo scegli una nuova password ed entri direttamente, e vieni disconnesso dagli altri dispositivi.
          </li>
          <li>
            In Impostazioni → Account puoi <strong>Cambia password</strong> e, se perdi il telefono, toccare{' '}
            <strong>Esci da tutti i dispositivi</strong> da un altro: entro un minuto il telefono perso non ha più accesso.
          </li>
          <li>
            <strong>Esci</strong> cancella la copia di questo telefono (viaggi, biglietti e modifiche non inviate). Di solito non serve mai
            uscire.
          </li>
        </ul>
        <Shot file="09-hogar.png" caption="Impostazioni → Famiglia: chi ne fa parte e «Invita qualcuno»." wide />
        <Shot file="08-ajustes.png" caption="Impostazioni: account, sincronizzazione, famiglia, notifiche, email, spazio, aiuto e versione." />
      </section>

      <section className="card">
        <h3>Consigli per il viaggio</h3>
        <ul className="small">
          <li>Prima di partire: ogni viaggio «Pronto offline», notifiche attive e un’occhiata a «Prossimo».</li>
          <li>Al controllo: apri la prenotazione e tocca <strong>Mostra QR</strong>. Non serve la connessione.</li>
          <li>Se arriva un’email con un cambio d’orario, fidati dell’avviso rosso: la prenotazione ha già il nuovo orario.</li>
        </ul>
      </section>
    </>
  );
}
