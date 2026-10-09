import { Link, Meta, Title } from "@solidjs/meta";
import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { ArrowIcon } from "../landing/notebook";
import { eyebrow, sectionTitle } from "../landing/styles";
import { button } from "../ui/Button";
import { SitePage } from "../ui/Site";

// The why, from docs/SOUL.md, told the way we'd tell it at a bar.

const beliefs = [
  {
    h: "Reliability before features",
    p: "Nothing we add matters if the upload doesn't finish. A 100 GiB send survived eight deliberate failures before beta.",
  },
  {
    h: "One obvious way in, one way out",
    p: "Drop the files, send the link. Your recipient clicks and downloads. No tour needed.",
  },
  {
    h: "Recovery on every plan",
    p: "Free included. Picking up where you left off is the whole point, not an upsell.",
  },
];

const prose = css({
  "& p + p": { mt: "5" },
  color: "[#3a3b40]",
  fontSize: "[20px]",
  lineHeight: "[1.6]",
  maxW: "[60ch]",
  textWrap: "pretty",
});

const description =
  "Every big upload dies at 63%. We built Tranzfer so that night ends with a delivered file instead of a restart, and we put resume on every plan, free included.";

export default function About() {
  return (
    <SitePage>
      <Title>Why we built it · Tranzfer</Title>
      <Meta name="description" content={description} />
      <Meta property="og:description" content={description} />
      <Meta property="og:title" content="Why we built it · Tranzfer" />
      <Meta property="og:url" content="https://tranzfer.app/about" />
      <Link rel="canonical" href="https://tranzfer.app/about" />
      <main id="content" class={css({ py: { base: "14", lg: "24" } })}>
        <p class={eyebrow}>Why we built it</p>
        <h1 class={cx(sectionTitle, css({ fontSize: "[clamp(44px,6vw,88px)]", mb: "12" }))}>
          It's always <i>63%.</i>
        </h1>
        <div class={prose}>
          <p>
            Picture it. A creator has 220 GB of raw footage. Their editor is on the other side of
            the world and starts in eight hours. The upload is going. The laptop can't close. The
            tab can't be touched. They go to bed with the lid open like it's a sick pet.
          </p>
          <p>
            The Wi-Fi dies. The laptop sleeps anyway. The tab refreshes. And it happens at 63%,
            because it is always 63%.
          </p>
          <p>They wake up. It's gone. Start over. From zero. 220 GB. Again.</p>
          <p>
            People have built whole evenings around upload bars. We think that's ridiculous.
            Tranzfer exists so that night ends differently: lost the connection for a bit, carried
            on, done. One correct file for the editor. No restart, no apology email.
          </p>
        </div>

        <div
          class={css({
            borderColor: "line",
            borderTopWidth: "1px",
            display: "grid",
            gap: "10",
            gridTemplateColumns: { base: "1fr", md: "repeat(3,minmax(0,1fr))" },
            mt: "20",
            pt: "12",
          })}
        >
          <For each={beliefs}>
            {(belief) => (
              <div>
                <h2 class={css({ fontSize: "22", fontWeight: "semibold", letterSpacing: "tight" })}>
                  {belief.h}
                </h2>
                <p class={css({ color: "mut", fontSize: "17", mt: "2" })}>{belief.p}</p>
              </div>
            )}
          </For>
        </div>

        <div class={css({ alignItems: "center", display: "flex", gap: "4", mt: "16" })}>
          <a class={button()} href="/sign-in">
            Send something big <ArrowIcon />
          </a>
          <span class={css({ color: "mut", textStyle: "sm" })}>20 GB free, no card.</span>
        </div>
      </main>
    </SitePage>
  );
}
