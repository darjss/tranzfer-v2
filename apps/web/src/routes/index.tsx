import { Meta, Title } from "@solidjs/meta";
import Landing from "../landing/Landing";

export default function Home() {
  return (
    <>
      <Title>Tranzfer — Send the whole shoot. Never start over.</Title>
      <Meta
        name="description"
        content="Large file transfer for video editors and filmmakers. Hundreds of gigabytes to your editor; if Wi-Fi drops or the laptop sleeps, it resumes where it stopped."
      />
      <Landing />
    </>
  );
}
