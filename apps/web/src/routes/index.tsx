import { Link, Meta, Title } from "@solidjs/meta";
import Landing from "../landing/Landing";

const description =
  "Send hundreds of gigabytes from your browser. If the Wi-Fi drops or the laptop sleeps, Tranzfer resumes instead of restarting. Your editor gets one link.";

export default function Home() {
  return (
    <>
      <Title>Tranzfer · Send huge files. Built to resume.</Title>
      <Meta name="description" content={description} />
      <Meta property="og:title" content="Tranzfer · Send huge files. Built to resume." />
      <Meta property="og:description" content={description} />
      <Meta property="og:type" content="website" />
      <Meta property="og:url" content="https://tranzfer.app/" />
      <Link rel="canonical" href="https://tranzfer.app/" />
      <Landing />
    </>
  );
}
