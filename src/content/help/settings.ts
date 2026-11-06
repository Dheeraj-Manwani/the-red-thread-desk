import type { ScreenHelp } from "./types";

export const settings: ScreenHelp = {
  id: "settings",
  title: "Settings",
  whatThisIs:
    "The connections that make the app work: Instagram, Facebook and WhatsApp accounts and their webhooks, the AI (with its monthly spending cap), Razorpay payments, the catalogue source, and notifications on this device.",
  whyItMatters:
    "If a connection is broken, comments and messages arrive but nothing happens, and you lose leads silently. A quick look here rules that out.",
  whatToDo: [
    "Check each channel card shows as connected. If not, follow the steps on the card; the README has the full setup.",
    "Press “Subscribe to webhooks” on a channel after connecting it, so Meta starts sending its events.",
    "Check the AI line: how much was spent this month and the cap. When the cap is reached, AI pauses until next month; keywords keep working.",
    "Check Razorpay and the catalogue are set. Without the Razorpay webhook secret, payments won't be confirmed automatically.",
    "Turn on notifications on your phone (from the installed app) so you hear when someone asks for you.",
  ],
  whenToCome: "Once at setup, and whenever something stops working.",
  terms: [
    {
      term: "Webhook",
      meaning: "Meta's way of telling the app about new comments and messages. Without it the app hears nothing.",
    },
    { term: "Token", meaning: "A long secret that lets the app act for your account. The ones used here don't expire." },
    { term: "AI cap", meaning: "The most the AI may spend in a month (in US dollars, as Anthropic bills it)." },
    { term: "Push notification", meaning: "An alert on your phone or computer, even when the app is closed." },
  ],
  mistakes: [
    "Sharing tokens or secrets in chat or screenshots. Anyone with them can post and message as Red Thread.",
    "Expecting notifications on iPhone from Safari. Add the app to the home screen first (iOS 16.4+).",
  ],
  related: [
    { href: "/start", label: "Start here" },
    { href: "/comments", label: "Comment log" },
  ],
};
