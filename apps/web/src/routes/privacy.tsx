import LegalArticle from "../legal/LegalArticle";
import { supportEmail } from "../ui/Site";

export default function Privacy() {
  return (
    <LegalArticle
      path="/privacy"
      title="Privacy policy"
      description="What Tranzfer stores about you and your files, who processes it, and how long it lives."
      updated="8 October 2026"
    >
      <p>
        Tranzfer keeps as little about you as it can and deletes files when their delivery ends.
        This page lists everything we store, why, and who else touches it.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account.</strong> Your name, email address and profile photo from Google when
          you sign in. Nothing else from your Google account.
        </li>
        <li>
          <strong>Your sessions.</strong> A session cookie that keeps you signed in, and the IP
          address and browser of each session, so a session can be traced if your account is
          misused.
        </li>
        <li>
          <strong>Your deliveries.</strong> File names, sizes, folder paths, the link's expiry and
          the delivery's status. We need these to show your dashboard and serve the link.
        </li>
        <li>
          <strong>Your files.</strong> The bytes you upload, stored until the delivery ends.
        </li>
        <li>
          <strong>Your plan.</strong> Which plan you're on and when it renews. Card details never
          reach us; Polar holds them.
        </li>
        <li>
          <strong>Diagnostics.</strong> Timings and errors from uploads, downloads and server
          requests, so we can find what broke. We strip IP addresses, link tokens and query strings
          out of these before they're stored.
        </li>
      </ul>
      <p>
        Recipients who open a link don't create an account. We don't track them beyond the request
        diagnostics above.
      </p>

      <h2>How long it lives</h2>
      <ul>
        <li>
          Files are deleted within minutes of their delivery expiring or being cancelled. Any file
          left over for any reason is deleted by a storage rule 30 days after upload, and unfinished
          uploads are cleared after 7 days.
        </li>
        <li>Delivery records stay in your history until you delete your account.</li>
        <li>Diagnostics are kept for up to 30 days.</li>
        <li>Your account stays until you ask us to delete it.</li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>
          <strong>Cloudflare</strong> runs the app, its database and file storage (R2).
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
