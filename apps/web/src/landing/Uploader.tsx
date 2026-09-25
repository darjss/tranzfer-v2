import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import PhCheckBold from "~icons/ph/check-bold";
import PhUploadSimpleBold from "~icons/ph/upload-simple-bold";
import { Button } from "../ui/Button";
import coastRoad from "./assets/coast-road.webp";
import frozenWilds from "./assets/frozen-wilds.webp";
import neonCrosswalk from "./assets/neon-crosswalk.webp";

// Static preview. Replace this with the real upload flow.

const files = [
  { meta: "214 GB · 1,842 clips", name: "EP04_A-Cam", thumb: neonCrosswalk },
  { meta: "188 GB · 1,204 clips", name: "EP04_B-Cam", thumb: frozenWilds },
  { meta: "61 GB · 97 clips", name: "Drone_Day2", thumb: coastRoad },
];

const ghost = css({
  bg: "panel",
  borderRadius: "[20px]",
  inset: "0",
  outlineColor: "line",
  outlineStyle: "solid",
  outlineWidth: "1px",
  pos: "absolute",
  shadow: "[0 30px 60px -40px rgba(23,24,28,.4)]",
});

export default function Uploader(props: { in: boolean; rx: number; ry: number }) {
  return (
    <div
      class={cx(
        "stage group",
        css({
          lg: { justifySelf: "end" },
          perspective: "1400px",
          pos: "relative",
          w: "[min(100%,520px)]",
          zIndex: 2,
        }),
      )}
    >
      <div
        class={[
          "stack",
          css({
            pos: "relative",
            transform: "[rotateX(var(--rx,0)) rotateY(var(--ry,0))]",
            transformStyle: "preserve-3d",
            transitionDuration: "[400ms]",
            transitionProperty: "[transform]",
            transitionTimingFunction: "smooth",
          }),
          { in: props.in },
        ]}
        style={{ "--rx": `${props.rx}deg`, "--ry": `${props.ry}deg` }}
      >
        <div
          class={cx(
            ghost,
            css({ transform: "[rotate(-6deg) translate(-18px,18px) translateZ(-40px)]" }),
          )}
        />
        <div
          class={cx(
            ghost,
            css({ transform: "[rotate(4deg) translate(14px,10px) translateZ(-20px)]" }),
          )}
        />
        <div
          class={cx(
            "card",
            css({
              _groupHover: { rotate: "[0deg]" },
              bg: "panel",
              borderRadius: "[20px]",
              outlineColor: "line",
              outlineStyle: "solid",
              outlineWidth: "1px",
              p: "[22px]",
              pos: "relative",
              rotate: "[-2deg]",
              shadow: "[inset 0 1px 0 #fff,0 50px 90px -50px rgba(23,24,28,.55)]",
              transitionDuration: "[500ms]",
              transitionProperty: "[rotate]",
              transitionTimingFunction: "smooth",
            }),
          )}
        >
          <div
            class={cx(
              "stamp",
              css({
                ".in &": { opacity: 1, scale: "[1]", translate: "[0 0]" },
                _before: {
                  background: "[conic-gradient(var(--colors-blue) 0 72%,var(--colors-line) 0)]",
                  borderRadius: "full",
                  boxSize: "3.5",
                  content: "''",
                },
                alignItems: "center",
                bgGradient: "to-b",
                borderRadius: "full",
                display: "inline-flex",
                fontSize: "xs",
                fontWeight: "medium",
                gap: "2",
                gradientFrom: "white",
                gradientTo: "[#f1ede3]",
                opacity: 0,
                pos: "absolute",
                px: "3",
                py: "[7px]",
                right: "[22px]",
                scale: "[.94]",
                shadow:
                  "[inset 0 1px 0 #fff,0 0 0 1px var(--colors-line),0 10px 20px -12px rgba(23,24,28,.4)]",
                top: "-3.5",
                transition:
                  "[translate .6s var(--easings-smooth) 1s,scale .6s var(--easings-smooth) 1s,opacity .4s ease 1s]",
                translate: "[0 8px]",
              }),
            )}
          >
            Upload preview
          </div>
          <header
            class={css({
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
              mb: "4",
            })}
          >
            <div>
              <b class={css({ fontWeight: "semibold" })}>Example transfer</b>
              <small class={css({ color: "mut", display: "block", fontSize: "[13px]" })}>
                To Marcus · your editor in Berlin
              </small>
            </div>
            <span
              class={css({
                _before: {
                  bg: "ok",
                  borderRadius: "full",
                  boxSize: "1.5",
                  content: "''",
                  shadow: "[0 0 0 3px rgba(31,122,69,.15)]",
                },
                alignItems: "center",
                color: "mut",
                display: "inline-flex",
                fontSize: "xs",
                fontWeight: "medium",
                gap: "2",
              })}
            >
              Preview
            </span>
          </header>
          <div
            class={css({
              background:
                "[repeating-linear-gradient(45deg,transparent 0 10px,rgba(0,0,0,.015) 10px 20px)]",
              borderColor: "[#b9b2a2]",
              borderRadius: "[14px]",
              borderStyle: "dashed",
              borderWidth: "[1.5px]",
              overflow: "hidden",
              pos: "relative",
              px: "[22px]",
              py: "[26px]",
              textAlign: "center",
            })}
          >
            <div
              class={cx(
                "ico",
                css({
                  alignItems: "center",
                  animation: "[bob 2.6s ease-in-out infinite]",
                  bg: "ink",
                  borderRadius: "2xl",
                  boxSize: "14",
                  color: "white",
                  display: "grid",
                  marginInline: "auto",
                  mb: "3",
                  placeItems: "center",
                  shadow: "[0 16px 30px -14px rgba(0,0,0,.6)]",
                }),
              )}
            >
              <PhUploadSimpleBold class={css({ boxSize: "6" })} />
            </div>
            <b class={css({ display: "block", fontWeight: "semibold" })}>Upload design preview</b>
            <span class={css({ color: "mut", fontSize: "[13px]" })}>
              File uploads are not available yet.
            </span>
          </div>
          <div class={css({ display: "grid", gap: "2.5", mt: "4" })}>
            <For each={files}>
              {(f, i) => (
                <div
                  class={cx(
                    "chip",
                    css({
                      "&.in": { opacity: 1, rotate: "[0deg]", translate: "[0 0]" },
                      alignItems: "center",
                      bg: "white",
                      borderRadius: "xl",
                      columnGap: "3",
                      display: "grid",
                      gridTemplateColumns: "[44px 1fr auto]",
                      opacity: 0,
                      outlineColor: "line",
                      outlineStyle: "solid",
                      outlineWidth: "1px",
                      px: "3",
                      py: "2.5",
                      rotate: "[2deg]",
                      transition:
                        "[translate .6s var(--easings-spring),rotate .6s var(--easings-spring),opacity .4s]",
                      transitionDelay: "var(--d)",
                      translate: "[20px 0]",
                    }),
                  )}
                  style={`--d: ${0.5 + i() * 0.15}s`}
                >
                  <img
                    class={css({ borderRadius: "lg", boxSize: "11", objectFit: "cover" })}
                    src={f.thumb}
                    alt=""
                  />
                  <div>
                    <b class={css({ display: "block", fontSize: "sm", fontWeight: "semibold" })}>
                      {f.name}
                    </b>
                    <small class={css({ color: "mut", fontFamily: "mono", fontSize: "xs" })}>
                      {f.meta}
                    </small>
                  </div>
                  <span
                    class={css({
                      alignItems: "center",
                      bg: "ok/12",
                      borderRadius: "full",
                      boxSize: "[22px]",
                      color: "ok",
                      display: "grid",
                      placeItems: "center",
                    })}
                  >
                    <PhCheckBold class={css({ boxSize: "3" })} />
                  </span>
                </div>
              )}
            </For>
          </div>
          <footer
            class={css({
              alignItems: "center",
              borderColor: "line",
              borderTopWidth: "1px",
              display: "flex",
              justifyContent: "space-between",
              mt: "[18px]",
              pt: "4",
            })}
          >
            <small class={css({ color: "mut", fontFamily: "mono", fontSize: "[13px]" })}>
              463 GB · link lives 7 days
            </small>
            <Button size="sm" disabled>
              Coming soon
            </Button>
          </footer>
        </div>
      </div>
    </div>
  );
}
