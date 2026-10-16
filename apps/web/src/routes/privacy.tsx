import LegalArticle from "../legal/LegalArticle";
import { supportEmail } from "../ui/support";

export default function Privacy() {
  return (
    <LegalArticle
      path="/privacy"
      title="Privacy policy"
      description="What Tranzfer stores about you and your files, which companies process it for us, how long each piece is kept, and how to get a copy or have it deleted."
      updated="16 October 2026"
    >
      <p>
        Tranzfer keeps as little about you as it can and deletes files when their delivery ends.
        This page lists everything we store, why, and who else touches it.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account.</strong> Your name, email address and profile photo from Google when
          you sign in. Google also returns sign-in tokens; we never use them, and we store the ones
          that could act on your Google account encrypted. Nothing else from your Google account.
        </li>
        <li>
          <strong>Your sign-up.</strong> The IP address you created your account from, so one
          network can't open hundreds of accounts.
        </li>
        <li>
          <strong>Your sessions.</strong> A session cookie that keeps you signed in, and the IP
          address and browser of each session, so a session can be traced if your account is
          misused.
        </li>
        <li>
          <strong>Your deliveries.</strong> Titles, notes, file names, sizes, folder paths, the
          link's expiry, a hash of its password if you set one, and the delivery's status. We need
          these to show your dashboard and serve the link.
        </li>
        <li>
          <strong>Your files.</strong> The bytes you upload, stored until the delivery ends.
        </li>
        <li>
          <strong>Your file requests.</strong> The title, instructions and limits you set. Someone
          uploading through one types their name and, if they want, an email address. Both stay with
          the delivery their upload makes, so you can see who sent it.
        </li>
        <li>
          <strong>Download reports.</strong> A recipient's browser tells us when it started each
          file and when it finished, so your dashboard can show the delivery arrived. No name or IP
          address comes with it.
        </li>
        <li>
          <strong>Emails you send.</strong> When you email a link, we send it to the addresses you
          type and keep only whether each send worked. The addresses aren't stored.
        </li>
        <li>
          <strong>Your plan.</strong> Which plan you're on, when it renews, and any access code you
          redeemed. Card details never reach us; Polar holds them.
        </li>
        <li>
          <strong>Plan waitlist.</strong> If you ask to hear when a paid plan opens, the email
          address you give and the plan, whether or not you have an account.
        </li>
        <li>
          <strong>Diagnostics.</strong> Timings and errors from uploads, downloads and server
          requests, so we can find what broke. We strip IP addresses, link tokens and query strings
          out of these before they're stored.
        </li>
        <li>
          <strong>Rate limits.</strong> Some limits count requests per IP address. Cloudflare keeps
          those counts for a minute at most.
        </li>
      </ul>
      <p>
        Recipients who open a link don't create an account. We don't track them beyond the download
        reports and request diagnostics above.
      </p>

      <h2>How long it lives</h2>
      <ul>
        <li>
          Files are deleted within minutes of their delivery expiring or being cancelled. Any file
          left over for any reason is deleted by a storage rule 30 days after upload, and unfinished
          uploads are cleared after 7 days.
        </li>
        <li>
          Delivery records, with an uploader's name and email and the download reports, stay in your
          history until you delete your account.
        </li>
        <li>The IP address you signed up from is deleted 24 hours after you sign up.</li>
        <li>A waitlist address stays on the list until you ask us to remove it.</li>
        <li>Diagnostics are kept for up to 30 days.</li>
        <li>Your account stays until you ask us to delete it.</li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>
          <strong>Cloudflare</strong> runs the app, its database and file storage (R2), and sends
          our emails.
        </li>
        <li>
          <strong>Google</strong> handles sign-in.
        </li>
        <li>
          <strong>Polar</strong> is our merchant of record and handles checkout, payments, tax and
          the billing portal.
        </li>
        <li>
          <strong>Axiom</strong> stores the diagnostics described above.
        </li>
      </ul>
      <p>We don't sell your data, and we don't use advertising or third-party tracking cookies.</p>

      <h2>Your choices</h2>
      <p>
        You can cancel any delivery from your dashboard, which deletes its files. You can ask us for
        a copy of your account data, to correct it, or to delete your account by emailing{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. We answer within 30 days.
      </p>

      <h2>Changes</h2>
      <p>
        If we change what we collect or who processes it, we'll update this page and change the date
        at the top. Big changes get an email first.
      </p>
    </LegalArticle>
  );
}
