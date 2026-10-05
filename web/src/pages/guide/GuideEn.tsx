import { Shot } from './Shot';

/** Guide body in English (follows GuideEs section by section). */
export function GuideEn() {
  return (
    <>
      <section className="card">
        <h3>What Viajes is</h3>
        <p className="small">
          An app to keep every booking for a trip on your phone: flights, trains, hotels, cars and tickets, with their boarding passes and QR
          codes. It works offline, reminds you before each departure, and everyone in the same “household” sees the same thing.
        </p>
      </section>

      <section className="card">
        <h3>1. Install it on your iPhone</h3>
        <ol className="small">
          <li>Open the invitation link you were sent in Safari and create your account (email and password).</li>
          <li>
            Tap Safari’s <strong>Share</strong> button (the square with the arrow) and choose <strong>Add to Home Screen</strong>.
          </li>
          <li>
            From then on, always open Viajes <strong>from the icon</strong>. That’s the only way it works offline and can send you
            notifications.
          </li>
          <li>
            When there’s a new version you’ll see a “New version available” notice: tap <strong>Update now</strong>.
          </li>
        </ol>
        <Shot file="11-invitacion.png" caption="The invitation link: create your account or sign in with the one you already have." />
      </section>

      <section className="card">
        <h3>2. Home</h3>
        <ul className="small">
          <li>
            Home is the <strong>list of trips</strong>: the ones <strong>in progress</strong> at the top, then the{' '}
            <strong>upcoming</strong> ones. Each card shows how many bookings it has and which one is next. Use <strong>New trip</strong>{' '}
            to create one (title, destination and dates).
          </li>
          <li>
            Tap a trip to open it: at the top, <strong>Up next</strong> with its <strong>Show QR</strong> and{' '}
            <strong>View booking</strong> buttons; below, all the bookings by day and, at the end, the <strong>History</strong> with the
            ones already past (dimmed and marked “Done”).
          </li>
          <li>
            <strong>History</strong>, at the bottom of Home: past trips, collapsed and grouped by year, marked “Done” in orange. They open
            just the same so you can check their bookings and tickets.
          </li>
          <li>
            If you see <strong>“N emails to review”</strong>, booking emails have arrived and are waiting for someone to confirm them
            (section 5).
          </li>
        </ul>
        <Shot file="01-inicio.png" caption="Home: emails to review, the trip in progress, what’s next and the button to expand all its bookings." />
        <Shot file="14-inicio-desplegado.png" caption="The trip’s bookings expanded by day, without leaving Home." />
        <Shot file="15-historico.png" caption="History at the bottom: past trips by year, in orange." />
      </section>

      <section className="card">
        <h3>3. Trips and bookings</h3>
        <ul className="small">
          <li>
            When you open a trip you see its bookings by day, with filters by type, the <strong>+ Add booking</strong> button and the one
            to save it on your phone.
          </li>
          <li>
            In <strong>New booking</strong> you choose the type (flight, hotel, train, car, ticket or other), the title, the departure with
            its time and place, and optionally the arrival, booking reference, address and notes.
          </li>
          <li>
            <strong>The quickest way</strong>: under “Attachments”, upload the ticket PDF or a photo of the boarding pass. The app reads it
            and fills in the fields for you; you just check them and tap <strong>Save</strong>.
          </li>
          <li>
            Times are always <strong>local times</strong> (Buenos Aires time for a flight leaving Buenos Aires). The app sorts everything
            by the actual moment, so there’s nothing to work out.
          </li>
          <li>
            If you upload a ticket for a booking that already exists, the app spots it and offers <strong>Update that booking</strong>{' '}
            instead of duplicating it.
          </li>
        </ul>
        <Shot file="02-viaje.png" caption="A trip: its bookings by day, “+ Add booking” and the button to save it on your phone." />
        <Shot file="03-nueva-reserva.png" caption="New booking: type, title, departure and, below, the attachments that fill in the form." />
      </section>

      <section className="card">
        <h3>4. Tickets and QR codes</h3>
        <ul className="small">
          <li>
            <strong>“Enviar a Viajes” shortcut</strong> (iPhone): from a PDF, a screenshot or some text, <strong>Share → Enviar a
            Viajes</strong> and it shows up under “to review” with the details already read. Install it from Settings → iPhone shortcut:
            generate your key, install the shortcut and paste the key into its Text block.
          </li>
          <li>
            You can add more attachments to each booking with <strong>+ Attach</strong> (camera, Photos or Files). If one has a QR code or
            barcode, the app reads it when saving and tags it “QR”. If the ticket covers several passengers (on the same page or on
            different pages), it reads them all and tags it “2 QR”, “3 QR”…
          </li>
          <li>
            <strong>Show QR</strong> displays it full screen on a white background, ready for boarding. The screen stays on while it’s
            open. With several passengers, each one’s name is shown and you move between them with the buttons at the bottom.{' '}
            <strong>View original</strong> opens the whole ticket.
          </li>
          <li>Tap an attachment to open the original (the whole PDF, for example).</li>
        </ul>
        <Shot file="04-reserva.png" caption="A booking: “Show QR”, the details and the attachments (the ticket has the “QR” tag)." />
        <Shot file="05-qr.png" caption="Show QR: full screen for the check. No connection needed." />
      </section>

      <section className="card">
        <h3>5. Booking emails</h3>
        <ul className="small">
          <li>
            Confirmations sent to the household email come into the app on their own. If you have a booking in your own email,
            <strong> forward it</strong> to the household’s import address (ask whoever invited you; it ends in “+viajes@gmail.com”).
          </li>
          <li>
            Within a minute or two it shows up on Home as an “email to review”. Open it, check the details the app has read, pick the trip
            and tap <strong>Create booking</strong>. The email’s attachments move to the booking. If you don’t need it, tap{' '}
            <strong>Discard</strong>.
          </li>
          <li>
            If the email is a <strong>change</strong> to an existing booking (a new time, a different seat…), the app recognises it,
            applies the change and leaves a red notice on the booking with the details. Once you’ve seen it, tap{' '}
            <strong>Got it, remove the notice</strong>.
          </li>
        </ul>
        <Shot file="07-correo.png" caption="An email to review: what the app has read, the trip to save it in and “Create booking”." />
        <Shot file="13-aviso-cambio.png" caption="Red notice on a booking changed by an email, showing before and after." wide />
        <Shot file="06-reserva-modificada.png" caption="The booking already has the new time; the notice goes away with “Got it”." />
      </section>

      <section className="card">
        <h3>6. Offline</h3>
        <ul className="small">
          <li>
            Every trip has a <strong>Save on phone</strong> button: it downloads all its bookings and tickets so you can see them without
            signal (on the plane, abroad with no data). Do it before you leave, on wifi. When it’s done it says “Ready offline”.
          </li>
          <li>
            Anything you change offline is stored on the phone and sent automatically when you’re back online. Settings → Sync shows
            whether anything is still pending.
          </li>
          <li>
            <strong>Remove from phone</strong> frees up space once the trip is over (in Settings you can also do it in one go for all past
            trips).
          </li>
        </ul>
        <Shot file="12-sincronizacion.png" caption="Settings → Sync: when the last one was and whether anything is still waiting to be sent." wide />
      </section>

      <section className="card">
        <h3>7. Notifications</h3>
        <ul className="small">
          <li>
            In Settings → Notifications, tap <strong>Turn on notifications on this phone</strong> and accept the permission. You only do
            it once per phone.
          </li>
          <li>
            There are three kinds: <strong>the evening before at 8 pm</strong> (local time), <strong>three hours before</strong>{' '}
            departure and <strong>straight away</strong> if an email changes a booking. Tapping the notification opens the booking.
          </li>
          <li>
            If they don’t arrive, check that no Focus mode is on and that Viajes is allowed in the iPhone’s Settings → Notifications.
          </li>
        </ul>
        <Shot file="10-avisos.png" caption="Settings → Notifications: turn on notifications on this phone." wide />
      </section>

      <section className="card">
        <h3>8. Household and accounts</h3>
        <ul className="small">
          <li>
            Everyone has their own account and password. Trips belong to the household and everyone sees them. Each booking has a{' '}
            <strong>Who can see it</strong> section: “The whole household”, “Only me” or “Specific people” (a checkbox per guest). The
            admin’s bookings start out visible to the whole household; a guest’s, only to them and the admin, who always sees everything.
            Only whoever created the booking or the admin can change who sees it.
          </li>
          <li>
            In Settings → Household anyone can <strong>Invite someone</strong>: this creates a single-use link that expires after thirty
            days. Only the household admin can remove members and create or revoke the Gmail and backup tokens; everyone else sees those
            sections without buttons.
          </li>
          <li>
            <strong>Forgotten password</strong>: on the sign-in screen, <strong>Forgot your password?</strong> → enter your email → within
            a minute or two you’ll get an email with a link (sent by the household’s Gmail script). The admin can also generate it with{' '}
            <strong>Password</strong> next to that person in Settings → Household. The link works once and lasts 24 hours: when you open it
            you set a new password and go straight in, and you’re signed out on your other devices.
          </li>
          <li>
            In Settings → Account you can <strong>Change password</strong> and, if you lose your phone, tap{' '}
            <strong>Sign out on all devices</strong> from another one: within a minute the lost phone no longer has access.
          </li>
          <li>
            <strong>Sign out</strong> deletes this phone’s copy (trips, tickets and unsent changes). Normally you never need to sign out.
          </li>
        </ul>
        <Shot file="09-hogar.png" caption="Settings → Household: who’s in it and “Invite someone”." wide />
        <Shot file="08-ajustes.png" caption="Settings: account, sync, household, notifications, email, storage, help and version." />
      </section>

      <section className="card">
        <h3>Tips for the trip</h3>
        <ul className="small">
          <li>Before you leave: every trip “Ready offline”, notifications on and a look at “Up next”.</li>
          <li>At the check: open the booking and tap <strong>Show QR</strong>. No connection needed.</li>
          <li>If an email arrives with a time change, trust the red notice: the booking already has the new time.</li>
        </ul>
      </section>
    </>
  );
}
