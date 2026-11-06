import type { ScreenHelp } from "./types";

export const iceBreakers: ScreenHelp = {
  id: "ice-breakers",
  title: "Ice breakers",
  whatThisIs:
    "Up to four ready-made questions shown as buttons when someone opens a new chat with you on Instagram, Messenger or WhatsApp, like “What packages do you have?”. Tapping one sends a reply, a link or starts a flow.",
  whyItMatters:
    "Many people open your chat and don't know what to type. A tap-to-ask button gets them talking, and the bot answers instantly.",
  whatToDo: [
    "For each channel, add up to four questions (80 characters max). Put the most common question first.",
    "Choose what happens on tap: a reply with an optional link, or a flow.",
    "Press “Add and publish”. If you edit them later, press “Publish again” so Meta shows the new version.",
  ],
  whenToCome: "Once at setup, then when your offers or common questions change.",
  terms: [
    { term: "Publish", meaning: "Sends your questions to Meta so they appear in the app. Edits don't show until you publish." },
    { term: "Order (position)", meaning: "The position of the question in the list (lower number shows first)." },
  ],
  mistakes: ["Questions that are vague (“Hi”). Use the exact questions customers already ask you."],
  related: [
    { href: "/flows", label: "Flows" },
    { href: "/stats", label: "Per-post stats" },
  ],
};
