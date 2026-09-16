import type { ParentProps } from "solid-js";

import { WebLayer } from "./client";
import { createRuntime, RuntimeContext } from "./solid-effect";

/** App-level provider freezing the web ManagedRuntime into Solid context.
 * Mount once at the root; nested `createRuntime` calls share its MemoMap. */
export const EffectRuntime = (props: ParentProps) => (
  <RuntimeContext value={createRuntime(WebLayer)}>{props.children}</RuntimeContext>
);
