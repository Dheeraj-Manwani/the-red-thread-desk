import type { ScreenHelp } from "./types";

export const start: ScreenHelp = {
  id: "start",
  title: "Start here",
  whatThisIs:
    "A guide to running Red Thread with this app: what each screen is for, the daily and weekly routine, the order to set things up in, and every business term used in the app.",
  whyItMatters:
    "The app only brings in money if a few small habits happen every day: replying fast, following up on unpaid links, and posting more of what works. This page is that routine.",
  whatToDo: [
    "Read the daily routine and try it for a week.",
    "If you're setting up, follow the setup order from top to bottom.",
    "Look up any unfamiliar word in the glossary at the bottom.",
    "On any screen, press the “i” next to the title for help on that screen.",
  ],
  whenToCome: "When you're new, or whenever you forget what a screen or word means.",
  related: [
    { href: "/", label: "Dashboard" },
    { href: "/inbox", label: "Inbox" },
  ],
};
