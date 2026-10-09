import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import Brand from "../landing/Brand";
import Loader, { dashboardQuips } from "../ui/Loader";

// The dashboard before its data arrives: the real layout in outline, so the
// page doesn't jump, and something to watch for the half second it takes.

const Bar = (props: { width: string }) => (
  <span
    class={cx("shimmer", css({ borderRadius: "full", display: "block", h: "3" }))}
    style={{ width: props.width }}
  />
);

export default function DashboardLoading() {
  return (
    <main
      class={css({
        marginInline: "auto",
        maxW: "page",
        minH: "screen",
        pb: "24",
        px: { base: "5", sm: "7" },
      })}
    >
      <nav
        class={css({
          alignItems: "center",
          borderBottomWidth: "1px",
          borderColor: "ink",
          display: "flex",
          h: "16",
          justifyContent: "space-between",
        })}
      >
        <Brand />
        <span class={cx("shimmer", css({ borderRadius: "full", h: "9", w: "[140px]" }))} />
      </nav>
      <div
        class={css({
          display: "grid",
          gap: "10",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,.9fr) minmax(0,1.1fr)" },
          pt: "12",
        })}
      >
        <div
          class={css({
            bg: "panel",
            borderRadius: "card",
            h: "[420px]",
            p: "7",
            rotate: { base: "[0deg]", lg: "[-1deg]" },
            shadow: "paper",
          })}
        >
          <Bar width="40%" />
          <span
            class={cx(
              "shimmer",
              css({ borderRadius: "xl", display: "block", h: "[260px]", mt: "6" }),
            )}
          />
        </div>
        <div>
          <Loader quips={dashboardQuips} />
          <div class={css({ display: "grid", gap: "3", mt: "4" })}>
            <For each={[0, 1, 2]}>
              {(i) => (
                <div
                  class={css({
                    bg: "panel",
                    borderRadius: "card",
                    display: "grid",
                    gap: "2.5",
                    p: "5",
                    shadow: "ring",
                  })}
                  style={{ opacity: String(1 - i * 0.25) }}
                >
                  <Bar width="55%" />
                  <Bar width="35%" />
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </main>
  );
}
