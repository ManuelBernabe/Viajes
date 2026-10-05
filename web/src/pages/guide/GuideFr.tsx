import { Shot } from './Shot';

/** Corps du guide en français (suit GuideEs section par section). */
export function GuideFr() {
  return (
    <>
      <section className="card">
        <h3>Viajes, c’est quoi ?</h3>
        <p className="small">
          Une app pour avoir sur ton téléphone toutes les réservations d’un voyage : vols, trains, hôtels, voitures et billets d’entrée,
          avec leurs billets et leurs QR codes. Elle marche hors connexion, te prévient avant chaque départ, et les personnes du même
          « foyer » voient la même chose.
        </p>
      </section>

      <section className="card">
        <h3>1. L’installer sur l’iPhone</h3>
        <ol className="small">
          <li>Ouvre dans Safari le lien d’invitation qu’on t’a envoyé et crée ton compte (e-mail et mot de passe).</li>
          <li>
            Touche le bouton <strong>Partager</strong> de Safari (le carré avec la flèche) et choisis <strong>Sur l’écran d’accueil</strong>.
          </li>
          <li>
            Ensuite, ouvre toujours Viajes <strong>depuis l’icône</strong>. C’est la seule façon pour qu’elle marche hors connexion et
            puisse t’envoyer des notifications.
          </li>
          <li>
            Quand il y a une nouvelle version, un message « Nouvelle version disponible » apparaît : touche{' '}
            <strong>Mettre à jour</strong>.
          </li>
        </ol>
        <Shot file="11-invitacion.png" caption="Le lien d’invitation : crée ton compte ou connecte-toi avec celui que tu as déjà." />
      </section>

      <section className="card">
        <h3>2. Accueil</h3>
        <ul className="small">
          <li>
            L’accueil, c’est la <strong>liste des voyages</strong> : en haut ceux <strong>en cours</strong>, puis les{' '}
            <strong>prochains</strong>. Chaque carte indique combien de réservations il contient et laquelle est la suivante. Avec{' '}
            <strong>Nouveau voyage</strong>, tu en crées un (titre, destination et dates).
          </li>
          <li>
            En touchant un voyage, tu entres dedans : en haut <strong>À suivre</strong> avec ses boutons <strong>Voir le QR</strong> et{' '}
            <strong>Voir la réservation</strong> ; en dessous toutes les réservations par jour et, à la fin, l’<strong>Historique</strong>{' '}
            avec celles qui sont passées (grisées et marquées « Effectuée »).
          </li>
          <li>
            <strong>Historique</strong>, en bas de l’accueil : les voyages déjà faits, repliés et regroupés par année, marqués
            « Effectué » en orange. Ils s’ouvrent pareil pour consulter leurs réservations et leurs billets.
          </li>
          <li>
            Si tu vois <strong>« N e-mails à vérifier »</strong>, des e-mails de réservation sont arrivés et attendent que quelqu’un les
            confirme (partie 5).
          </li>
        </ul>
        <Shot file="01-inicio.png" caption="Accueil : e-mails à vérifier, le voyage en cours, la suite et le bouton pour déplier toutes ses réservations." />
        <Shot file="14-inicio-desplegado.png" caption="Les réservations du voyage dépliées par jour, sans quitter l’accueil." />
        <Shot file="15-historico.png" caption="L’historique en bas : les voyages effectués par année, en orange." />
      </section>

      <section className="card">
        <h3>3. Voyages et réservations</h3>
        <ul className="small">
          <li>
            En ouvrant un voyage, tu vois ses réservations par jour, avec des filtres par type, le bouton{' '}
            <strong>+ Ajouter une réservation</strong> et celui pour l’enregistrer sur le téléphone.
          </li>
          <li>
            Dans <strong>Nouvelle réservation</strong>, tu choisis le type (vol, hôtel, train, voiture, billet d’entrée ou autre), le titre,
            le départ avec son heure et son lieu, et si tu veux l’arrivée, la référence de réservation, l’adresse et des notes.
          </li>
          <li>
            <strong>Le plus rapide</strong> : dans « Pièces jointes », ajoute le PDF du billet ou une photo de la carte d’embarquement.
            L’app le lit et remplit les champs toute seule ; tu n’as qu’à vérifier et toucher <strong>Enregistrer</strong>.
          </li>
          <li>
            Les heures sont toujours les <strong>heures locales</strong> (l’heure de Buenos Aires pour un vol qui part de Buenos Aires).
            L’app trie tout selon le moment réel, donc tu n’as rien à calculer.
          </li>
          <li>
            Si tu ajoutes le billet d’une réservation qui existe déjà, l’app s’en rend compte et propose{' '}
            <strong>Mettre à jour cette réservation</strong> au lieu de la dupliquer.
          </li>
        </ul>
        <Shot file="02-viaje.png" caption="Un voyage : ses réservations par jour, « + Ajouter une réservation » et le bouton pour l’enregistrer sur le téléphone." />
        <Shot file="03-nueva-reserva.png" caption="Nouvelle réservation : type, titre, départ et, en bas, les pièces jointes qui remplissent le formulaire." />
      </section>

      <section className="card">
        <h3>4. Billets et QR codes</h3>
        <ul className="small">
          <li>
            <strong>Raccourci « Enviar a Viajes »</strong> (iPhone) : depuis un PDF, une capture d’écran ou un texte,{' '}
            <strong>Partager → Enviar a Viajes</strong>, et ça apparaît dans « à vérifier » avec les infos déjà lues. Il s’installe depuis
            Réglages → Raccourci iPhone : génère ta clé, installe le raccourci et colle la clé dans son bloc Texte.
          </li>
          <li>
            Dans chaque réservation, tu peux ajouter d’autres pièces jointes avec <strong>+ Joindre</strong> (appareil photo, Photos ou
            Fichiers). S’il y a un QR code ou un code-barres, l’app le lit à l’enregistrement et la marque « QR ». Si le billet concerne
            plusieurs passagers (sur la même page ou sur des pages différentes), elle les lit tous et la marque « 2 QR », « 3 QR »…
          </li>
          <li>
            <strong>Voir le QR</strong> l’affiche en plein écran sur fond blanc, prêt pour l’embarquement. L’écran ne se met pas en veille
            tant qu’il est ouvert. Avec plusieurs passagers, le nom de chacun s’affiche et tu passes de l’un à l’autre avec les boutons du
            bas. <strong>Voir l’original</strong> ouvre le billet complet.
          </li>
          <li>En touchant une pièce jointe, l’original s’ouvre (le PDF complet, par exemple).</li>
        </ul>
        <Shot file="04-reserva.png" caption="Une réservation : « Voir le QR », les infos et les pièces jointes (le billet porte la marque « QR »)." />
        <Shot file="05-qr.png" caption="Voir le QR : en plein écran pour le contrôle. Pas besoin de connexion." />
      </section>

      <section className="card">
        <h3>5. E-mails de réservation</h3>
        <ul className="small">
          <li>
            Les confirmations qui arrivent sur l’adresse e-mail du foyer entrent toutes seules dans l’app. Si tu as une réservation dans ta
            propre boîte, <strong>transfère-la</strong> à l’adresse d’import du foyer (demande à la personne qui t’a invité ; elle se termine
            par « +viajes@gmail.com »).
          </li>
          <li>
            En une ou deux minutes, elle apparaît sur l’accueil comme « e-mail à vérifier ». Ouvre-le, vérifie les infos que l’app a lues,
            choisis le voyage et touche <strong>Créer la réservation</strong>. Les pièces jointes de l’e-mail passent dans la réservation.
            Si ça ne t’intéresse pas, <strong>Ignorer</strong>.
          </li>
          <li>
            Si l’e-mail est une <strong>modification</strong> d’une réservation existante (autre heure, autre siège…), l’app la reconnaît,
            applique le changement et laisse un avertissement rouge sur la réservation avec le détail. Quand tu l’as vu, touche{' '}
            <strong>Compris, retirer l’avertissement</strong>.
          </li>
        </ul>
        <Shot file="07-correo.png" caption="Un e-mail à vérifier : ce que l’app a lu, le voyage où l’enregistrer et « Créer la réservation »." />
        <Shot file="13-aviso-cambio.png" caption="Avertissement rouge sur une réservation modifiée par un e-mail, avec l’avant et l’après." wide />
        <Shot file="06-reserva-modificada.png" caption="La réservation a déjà la nouvelle heure ; l’avertissement se retire avec « Compris »." />
      </section>

      <section className="card">
        <h3>6. Hors connexion</h3>
        <ul className="small">
          <li>
            Chaque voyage a un bouton <strong>Enregistrer sur le téléphone</strong> : il télécharge toutes ses réservations et ses billets
            pour les voir sans réseau (dans l’avion, à l’étranger sans données). Fais-le avant de partir, en Wi-Fi. Une fois fini, il
            affiche « Prêt hors connexion ».
          </li>
          <li>
            Ce que tu modifies hors connexion est gardé sur le téléphone et envoyé tout seul quand le réseau revient. Dans Réglages →
            Synchronisation, tu vois s’il reste quelque chose en attente.
          </li>
          <li>
            <strong>Retirer du téléphone</strong> libère de la place une fois le voyage passé (dans Réglages, tu peux aussi le faire d’un
            coup pour tous les voyages passés).
          </li>
        </ul>
        <Shot file="12-sincronizacion.png" caption="Réglages → Synchronisation : la date de la dernière et s’il reste quelque chose à envoyer." wide />
      </section>

      <section className="card">
        <h3>7. Notifications</h3>
        <ul className="small">
          <li>
            Dans Réglages → Notifications, touche <strong>Activer les notifications sur ce téléphone</strong> et accepte l’autorisation. À
            faire une fois par téléphone.
          </li>
          <li>
            Il y en a trois types : <strong>la veille à 20 h</strong> (heure locale), <strong>trois heures avant</strong> le départ et{' '}
            <strong>immédiatement</strong> si un e-mail modifie une réservation. En touchant la notification, la réservation s’ouvre.
          </li>
          <li>
            Si elles n’arrivent pas, vérifie qu’aucun mode Concentration n’est activé et que Viajes est autorisée dans les Réglages de
            l’iPhone → Notifications.
          </li>
        </ul>
        <Shot file="10-avisos.png" caption="Réglages → Notifications : activer les notifications sur ce téléphone." wide />
      </section>

      <section className="card">
        <h3>8. Foyer et comptes</h3>
        <ul className="small">
          <li>
            Chacun a son compte et son mot de passe. Les voyages appartiennent au foyer et tout le monde les voit. Chaque réservation a une
            partie <strong>Qui la voit</strong> : « Tout le foyer », « Moi seulement » ou « Certaines personnes » (une case par invité).
            Celles de l’administrateur sont visibles par tout le foyer dès leur création ; celles d’un invité, seulement par lui et
            l’administrateur, qui voit toujours tout. Seul l’auteur de la réservation ou l’administrateur peut changer qui la voit.
          </li>
          <li>
            Dans Réglages → Foyer, tout le monde peut <strong>Inviter quelqu’un</strong> : ça crée un lien à usage unique qui expire au
            bout de trente jours. Seul l’administrateur du foyer peut retirer des membres et générer ou révoquer les jetons Gmail et de
            sauvegarde ; les autres voient ces parties sans boutons.
          </li>
          <li>
            <strong>Mot de passe oublié</strong> : sur l’écran de connexion, <strong>Mot de passe oublié ?</strong> → saisis ton e-mail →
            en une ou deux minutes, tu reçois un e-mail avec un lien (envoyé par le script Gmail du foyer). L’administrateur peut aussi le
            générer avec <strong>Mot de passe</strong> à côté de la personne dans Réglages → Foyer. Le lien ne sert qu’une fois et dure
            24 heures : en l’ouvrant, tu choisis un nouveau mot de passe et tu entres directement, et tu es déconnecté de tes autres
            appareils.
          </li>
          <li>
            Dans Réglages → Compte, tu peux <strong>Changer le mot de passe</strong> et, si tu perds ton téléphone, toucher{' '}
            <strong>Se déconnecter de tous les appareils</strong> depuis un autre : en une minute, le téléphone perdu n’a plus accès.
          </li>
          <li>
            <strong>Se déconnecter</strong> efface la copie de ce téléphone (voyages, billets et modifications non envoyées). En temps
            normal, pas besoin de te déconnecter.
          </li>
        </ul>
        <Shot file="09-hogar.png" caption="Réglages → Foyer : qui en fait partie et « Inviter quelqu’un »." wide />
        <Shot file="08-ajustes.png" caption="Réglages : compte, synchronisation, foyer, notifications, e-mail, espace, aide et version." />
      </section>

      <section className="card">
        <h3>Conseils pour le voyage</h3>
        <ul className="small">
          <li>Avant de partir : chaque voyage « Prêt hors connexion », notifications activées et un coup d’œil à « À suivre ».</li>
          <li>Au contrôle : ouvre la réservation et touche <strong>Voir le QR</strong>. Pas besoin de connexion.</li>
          <li>Si un e-mail de changement d’heure arrive, fais confiance à l’avertissement rouge : la réservation a déjà la nouvelle heure.</li>
        </ul>
      </section>
    </>
  );
}
