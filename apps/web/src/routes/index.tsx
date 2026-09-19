import { Meta, Title } from "@solidjs/meta";
import Landing from "../landing/Landing";

export default function Home() {
  return (
    <>
      <Title>Tranzfer | Large file transfer, in development</Title>
      <Meta
        name="description"
        content="An early build of resumable file transfer for creators and editors. Explore the upload design and recovery goals."
      />
      <Landing />
    </>
  );
}
