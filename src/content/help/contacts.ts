import type { ScreenHelp } from "./types";

export const contacts: ScreenHelp = {
  id: "contacts",
  title: "Contacts",
  whatThisIs:
    "Everyone who has ever commented, messaged or tapped a button, on any channel, with their tags, whether they follow you on Instagram, how many times they commented, and when they last messaged.",
  whyItMatters:
    "Your contact list is a business asset. Every person here already knows Red Thread. Selling again to people who know you is much cheaper than finding new ones.",
  whatToDo: [
    "Search by name, or filter by tag and channel to find a group (for example everyone tagged “wedding-feb” on WhatsApp).",
    "Open a person to see their conversation.",
    "Check the “STOP” label: those people asked not to get automatic messages. Respect it.",
  ],
  whenToCome: "When you're looking for someone, or planning who to message in a broadcast.",
  terms: [
    { term: "Follower", meaning: "Whether they follow your Instagram account (checked when an automation has a follow gate)." },
    {
      term: "STOP",
      meaning:
        "The person sent STOP (or similar). The bot no longer sends them automatic messages or broadcasts. If they send START, it's turned back on.",
    },
    { term: "Channel", meaning: "Where the person talks to you: Instagram, Facebook (Messenger) or WhatsApp." },
  ],
  mistakes: ["Messaging people who sent STOP from your phone. It annoys them and risks reports to Meta."],
  related: [
    { href: "/inbox", label: "Inbox" },
    { href: "/broadcasts", label: "Broadcasts" },
  ],
};
