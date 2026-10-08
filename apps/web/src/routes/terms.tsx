import LegalArticle from "../legal/LegalArticle";
import { supportEmail } from "../ui/Site";

export default function Terms() {
  return (
    <LegalArticle
      path="/terms"
      title="Terms of service"
      description="The rules for using Tranzfer to send large files: accounts, plans, links, your files and ours."
      updated="8 October 2026"
    >
      <p>
        These terms cover your use of Tranzfer, a service for sending large files by link. By
        creating an account or sending a delivery you agree to them. If you don't agree, don't use
        Tranzfer.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with a Google account. You are responsible for what is sent from your account,
        so keep that Google account secure. You must be old enough to agree to these terms where you
        live, and at least 16.
      </p>

      <h2>What Tranzfer does</h2>
      <p>
        You upload files, Tranzfer stores them, and anyone with the delivery's link can download
        them until the link expires or you cancel it. Recipients don't need an account. Tranzfer is
        a delivery tool, not storage: every delivery has an end date, and when it ends, the files
        are deleted.
      </p>
      <p>
        We work hard to keep uploads and links reliable, but we can't promise the service will never
        be interrupted. Keep your own copy of anything you send.
      </p>

      <h2>Plans and payment</h2>
      <p>
        The free plan has 20 GB of active transfer space and links that last up to 3 days. Paid
        plans add space and longer links, and are billed monthly. The current plans and prices are
        on the <a href="/#pricing">pricing section</a>.
      </p>
      <ul>
        <li>
          Polar (polar.sh) sells paid plans as our merchant of record. Polar handles checkout,
          payment, tax and invoices, and its buyer terms apply to the purchase.
        </li>
        <li>
          You can cancel at any time from <strong>Manage billing</strong> in your account. Your plan
          stays active until the end of the period you paid for.
        </li>
        <li>
          Active transfer space counts every delivery that hasn't ended yet. A new delivery that
          would go over your plan is refused before anything uploads.
        </li>
        <li>
          If a payment fails, Polar retries it. If it never goes through, your account drops back to
          the free plan. Deliveries already sent keep their links.
        </li>
        <li>
          We may change prices. We'll tell you by email at least 30 days before a change affects
          you.
        </li>
      </ul>

      <h2>Your files</h2>
      <p>
        Your files stay yours. You give us only the permission we need to store them, move them and
        serve them to people with the link, until the delivery ends. We don't look at your files,
        except when a report says a delivery breaks our{" "}
        <a href="/acceptable-use">acceptable use policy</a> or the law requires it.
      </p>
      <p>
        You confirm you have the right to send what you upload. Anyone you give a link to can
        download and keep the files. Share links with care.
      </p>

      <h2>What you can't do</h2>
      <p>
        Follow the <a href="/acceptable-use">acceptable use policy</a>. In short: no illegal
        content, no malware, no phishing, no infringing other people's rights, and no attacking or
        overloading the service.
      </p>

      <h2>Ending things</h2>
      <p>
        You can stop using Tranzfer whenever you like. To delete your account, email{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we'll remove it along with any
        files that haven't been deleted yet.
      </p>
      <p>
        We may suspend or close an account that breaks these terms, puts other users or the service
        at risk, or is the subject of a valid legal request. When we can, we'll tell you why first.
      </p>

      <h2>Liability</h2>
      <p>
        Tranzfer is provided as it is. As far as the law allows, we aren't liable for lost files,
        lost profits or indirect damages, and our total liability to you is limited to what you paid
        us in the 12 months before the claim. Nothing here limits liability that can't be limited by
        law.
      </p>

      <h2>Changes</h2>
      <p>
        We'll update these terms as Tranzfer changes. If a change matters, we'll email you before it
        applies. The date at the top shows the latest version.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms go to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
    </LegalArticle>
  );
}
