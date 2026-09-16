import { Loading } from "solid-js";

import { WebLayer } from "./api/client";
import { createRuntime, RuntimeContext } from "./api/solid-effect";
import { Router } from "./router";
import "./App.css";

// The app root. Pages are the modules under src/routes; each owns its own
// chrome (the landing has its own nav) until there is a signed-in shell.
export default function App() {
  return (
    <RuntimeContext value={createRuntime(WebLayer)}>
      <Router>{(props) => <Loading fallback={<main />}>{props.children}</Loading>}</Router>
    </RuntimeContext>
  );
}
