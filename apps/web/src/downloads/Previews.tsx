import type { SharedFile } from "@tranzfer/contracts";
import { createSignal, For, Show } from "solid-js";
import { css } from "styled-system/css";

import PhImageBold from "~icons/ph/image-bold";
import PhPlayBold from "~icons/ph/play-bold";

const kinds = new Map<string, "audio" | "image" | "video">([
  ["gif", "image"],
  ["heic", "image"],
  ["heif", "image"],
  ["jpeg", "image"],
  ["jpg", "image"],
  ["m4a", "audio"],
  ["m4v", "video"],
  ["mov", "video"],
  ["mp3", "audio"],
  ["mp4", "video"],
  ["png", "image"],
  ["wav", "audio"],
  ["webm", "video"],
  ["webp", "image"],
]);

// A preview streams the original, so big files get an icon. That also covers
// camera raw (BRAW, R3D, ARRIRAW), which no extension above names, and ProRes,
// which hides in a .mov and is far past the video cap at any real length.
const largest = { audio: 1_000_000_000, image: 25_000_000, video: 1_000_000_000 };

/** What the page can show of a file, from its extension and size; undefined means an icon only. */
export const previewKind = (file: SharedFile) => {
  const kind = kinds.get(file.path.split(".").at(-1)?.toLowerCase() ?? "");
  return kind !== undefined && file.size <= largest[kind] ? kind : undefined;
};

const basename = (path: string) => path.split("/").at(-1) ?? path;

const caption = css({ color: "mut", fontFamily: "mono", fontSize: "13", truncate: true });

// The browser fetches the signed URL itself, so a preview never reaches
// ReportDownload: only a click on Download or a folder save does. HEIC shows
// where the browser decodes it; anywhere else the error swaps in an icon.
const Thumb = (props: { file: SharedFile }) => {
  const [failed, setFailed] = createSignal(false);
  return (
    <li class={css({ minW: "0" })}>
      <div
        class={css({
          aspectRatio: "square",
          bg: "paper",
          borderRadius: "xl",
          color: "mut",
          display: "grid",
          overflow: "hidden",
          placeItems: "center",
        })}
      >
        <Show
          when={!failed()}
          fallback={<PhImageBold aria-hidden="true" class={css({ boxSize: "6" })} />}
        >
          <img
            alt={props.file.path}
            class={css({ boxSize: "full", objectFit: "cover" })}
            decoding="async"
            loading="lazy"
            onError={() => {
              setFailed(true);
            }}
            src={props.file.url}
          />
        </Show>
      </div>
      <p class={caption} title={props.file.path}>
        {basename(props.file.path)}
      </p>
    </li>
  );
};

const CantPlay = () => (
  <p class={css({ color: "mut", textStyle: "sm" })} role="status">
    Your browser can't play this one. Download it instead.
  </p>
);

// Nothing loads until the click, so a delivery of many clips opens fast.
const Clip = (props: { file: SharedFile }) => {
  const [open, setOpen] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  return (
    <li class={css({ minW: "0" })}>
      <Show
        when={open()}
        fallback={
          <button
            class={css({
              _hover: { bg: "white" },
              alignItems: "center",
              bg: "paper",
              borderRadius: "xl",
              display: "flex",
              gap: "2.5",
              minH: "10",
              px: "3.5",
              textStyle: "sm",
              w: "full",
            })}
            onClick={() => {
              setOpen(true);
            }}
            type="button"
          >
            <PhPlayBold aria-hidden="true" class={css({ boxSize: "4", flexShrink: 0 })} />
            <span class={css({ truncate: true })}>Play {basename(props.file.path)}</span>
          </button>
        }
      >
        <p class={caption} title={props.file.path}>
          {basename(props.file.path)}
        </p>
        <Show when={!failed()} fallback={<CantPlay />}>
          <video
            autoplay
            class={css({ borderRadius: "xl", maxH: "[60dvh]", w: "full" })}
            controls
            onError={() => {
              setFailed(true);
            }}
            playsinline
            preload="metadata"
            src={props.file.url}
          />
        </Show>
      </Show>
    </li>
  );
};

const Sound = (props: { file: SharedFile }) => {
  const [failed, setFailed] = createSignal(false);
  return (
    <li class={css({ minW: "0" })}>
      <p class={caption} title={props.file.path}>
        {basename(props.file.path)}
      </p>
      <Show when={!failed()} fallback={<CantPlay />}>
        <audio
          class={css({ w: "full" })}
          controls
          onError={() => {
            setFailed(true);
          }}
          preload="none"
          src={props.file.url}
        />
      </Show>
    </li>
  );
};

/** Thumbnails, click-to-play video and audio players for the files a browser can show. */
export const Previews = (props: { files: readonly SharedFile[] }) => {
  const of = (kind: "audio" | "image" | "video") =>
    props.files.filter((file) => previewKind(file) === kind);
  return (
    <Show when={props.files.some((file) => previewKind(file) !== undefined)}>
      <section aria-label="Previews" class={css({ display: "grid", gap: "4", mt: "6" })}>
        <Show when={of("image").length > 0}>
          <ul
            class={css({
              display: "grid",
              gap: "3",
              gridTemplateColumns: "[repeat(auto-fill,minmax(110px,1fr))]",
              listStyle: "none",
            })}
          >
            <For each={of("image")}>{(file) => <Thumb file={file} />}</For>
          </ul>
        </Show>
        <Show when={of("video").length + of("audio").length > 0}>
          <ul class={css({ display: "grid", gap: "3", listStyle: "none" })}>
            <For each={of("video")}>{(file) => <Clip file={file} />}</For>
            <For each={of("audio")}>{(file) => <Sound file={file} />}</For>
          </ul>
        </Show>
      </section>
    </Show>
  );
};
