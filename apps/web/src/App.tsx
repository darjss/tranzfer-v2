import { getRequestEvent, isServer } from "@solidjs/web";
import { Loading } from "solid-js";

import { serverLayer } from "./api/binding";
import { WebLayer } from "./api/client";
import { createRuntime, RuntimeContext } from "./api/solid-effect";
import { Router } from "./router";
import "./App.css";

// The app root. Pages are the modules under src/routes; each owns its own
// chrome (the landing has its own nav) until there is a signed-in shell.
export default function App() {
  const layer = isServer
    ? serverLayer(getRequestEvent()?.request.headers.get("cookie") ?? null)
    : WebLayer;
  return (
    <RuntimeContext value={createRuntime(layer)}>
      <Router>{(props) => <Loading fallback={<main />}>{props.children}</Loading>}</Router>
    </RuntimeContext>
  );
}
