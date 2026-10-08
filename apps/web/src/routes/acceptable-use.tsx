import LegalArticle from "../legal/LegalArticle";
import { supportEmail } from "../ui/Site";

export default function AcceptableUse() {
  return (
    <LegalArticle
      title="Acceptable use"
      description="What you can't send with Tranzfer, and how to report a link that breaks the rules."
      updated="8 October 2026"
    >
      <p>
        Tranzfer is for delivering your own work to the people who need it: footage to an editor,
        masters to a client, a season of photos to a studio. Don't use it for any of the below.
        Breaking these rules gets the delivery removed and can close the account.
      </p>

      <h2>Don't send</h2>
      <ul>
        <li>Anything illegal where you or the recipient are.</li>
        <li>Sexual content involving minors. We report it to the authorities.</li>
        <li>Malware, or files built to harm the person who opens them.</li>
        <li>
          Content you don't have the rights to share, including pirated films, music and software.
        </li>
        <li>Personal data about other people that you have no right to share.</li>
        <li>Content that threatens, harasses or promotes violence against people.</li>
      </ul>

      <h2>Don't use links for</h2>
      <ul>
        <li>Phishing, or pages and files that pretend to be someone else.</li>
        <li>Spam, or mass-mailing links to people who didn't ask for them.</li>
        <li>Hosting files for a public website or app. Tranzfer links are for deliveries.</li>
      </ul>

      <h2>Don't attack the service</h2>
      <ul>
        <li>Don't probe, scan or test Tranzfer for weaknesses without our written permission.</li>
        <li>Don't overload it, scrape it, or get around plan limits.</li>
        <li>Don't share an account to dodge limits, or create accounts in bulk.</li>
      </ul>

      <h2>Report a link</h2>
      <p>
        If a Tranzfer link breaks these rules, email{" "}
        <a href={`mailto:${supportEmail}?subject=Abuse%20report`}>{supportEmail}</a> with the link
        and what's wrong with it. We look at every report, and take down deliveries that break the
        rules as soon as we confirm it. For copyright claims, include the work you own and a
        statement that you're authorized to act for the owner.
      </p>
    </LegalArticle>
  );
}
