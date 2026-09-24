// PROTOTYPE, throwaway. Three structurally different upload dashboards on
// /prototype/dashboard?variant=A|B|C, all on fake data. Lives on the
// prototype branch only.
import { Title } from "@solidjs/meta";
import { Match, Switch } from "solid-js";

import { DeskVariant } from "../../dashboard/prototype/DeskVariant";
import { OutboxVariant } from "../../dashboard/prototype/OutboxVariant";
import { PanesVariant } from "../../dashboard/prototype/PanesVariant";
import "../../landing/landing.css";
import { PrototypeSwitcher, useVariant } from "../../ui/PrototypeSwitcher";

const variants = [
  ["A", "Desk: drop zone first"],
  ["B", "Panes: list + detail"],
  ["C", "Outbox: notebook ledger"],
] as const;

export default function DashboardPrototype() {
  const variant = useVariant(variants);
  return (
    <>
      <Title>Dashboard prototype · Tranzfer</Title>
      <Switch>
        <Match when={variant() === "A"}>
          <DeskVariant />
        </Match>
        <Match when={variant() === "B"}>
          <PanesVariant />
        </Match>
        <Match when={variant() === "C"}>
          <OutboxVariant />
        </Match>
      </Switch>
      <PrototypeSwitcher variants={variants} />
    </>
  );
}
