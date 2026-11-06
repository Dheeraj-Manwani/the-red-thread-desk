import { automationEdit, automationNew, automations } from "./automations";
import { broadcasts } from "./broadcasts";
import { catalogue } from "./catalogue";
import { comments } from "./comments";
import { contacts } from "./contacts";
import { conversation } from "./conversation";
import { dashboard } from "./dashboard";
import { flowBuilder, flows } from "./flows";
import { iceBreakers } from "./ice-breakers";
import { inbox } from "./inbox";
import { order } from "./order";
import { orders } from "./orders";
import { packages } from "./packages";
import { settings } from "./settings";
import { start } from "./start";
import { stats } from "./stats";
import type { ScreenHelp } from "./types";

export type { ScreenHelp } from "./types";

/** Help for every admin screen, shown by the "i" button. Add an entry with every new screen. */
export const help = {
  dashboard,
  inbox,
  conversation,
  contacts,
  orders,
  order,
  broadcasts,
  automations,
  automationNew,
  automationEdit,
  flows,
  flowBuilder,
  stats,
  comments,
  iceBreakers,
  packages,
  catalogue,
  settings,
  start,
} satisfies Record<string, ScreenHelp>;

/** Every term from every screen, deduplicated by term (first definition wins), A–Z. */
export function glossary(): { term: string; meaning: string; screen: string }[] {
  const seen = new Map<string, { term: string; meaning: string; screen: string }>();
  for (const screen of Object.values(help) as ScreenHelp[]) {
    for (const t of screen.terms ?? []) {
      const key = t.term.toLowerCase();
      if (!seen.has(key)) seen.set(key, { ...t, screen: screen.title });
    }
  }
  return [...seen.values()].sort((a, b) => a.term.localeCompare(b.term));
}
