import type { ScreenHelp } from "./types";

export const broadcasts: ScreenHelp = {
  id: "broadcasts",
  title: "WhatsApp broadcasts",
  whatThisIs:
    "Send one WhatsApp message to many opted-in contacts at once, using a template Meta has approved. Also where you create those templates and see how each broadcast did (sent, delivered, read, failed).",
  whyItMatters:
    "Broadcasts bring back people who showed interest but didn't buy, and tell past customers about offers (wedding season, festivals). One good broadcast can bring several orders for a few hundred rupees.",
  whatToDo: [
    "Create a template first (bottom of the page): a name, a category, the text with {{1}}-style blanks, and an example for each blank. Submit it; Meta usually reviews within minutes to a day.",
    "Press “Sync from WhatsApp” to fetch approval status if it hasn't updated.",
    "Start a new broadcast: give it a name, pick an approved template, optionally limit it to a tag, and fill each blank ({name} puts in the person's name).",
    "Press “Review cost” to see how many people get it and the estimated charge before sending.",
    "Leave “Send at” empty to send now, or pick a time (India time).",
    "Afterwards, watch Delivered, Read and Failed. A high failure count usually means a template or number problem.",
  ],
  whenToCome: "A few times a month: before wedding season, festivals or a new design launch. Don't overdo it.",
  terms: [
    {
      term: "Template",
      meaning:
        "A message Meta approved in advance. WhatsApp requires one to message people outside the 24-hour window.",
    },
    { term: "Marketing template", meaning: "For offers and promotions. Costs more per message (about ₹0.86 + GST)." },
    { term: "Utility template", meaning: "For order updates (“your invite is ready”). Cheaper (about ₹0.12 + GST)." },
    {
      term: "Opted in",
      meaning: "Only people who agreed to receive offers get broadcasts. People who sent STOP are left out automatically.",
    },
    { term: "Est. ₹", meaning: "Estimated cost from the rates in settings. The real bill can be lower, never higher." },
  ],
  mistakes: [
    "Using a marketing template for an order update, or the other way round. Meta can reject or recategorise it.",
    "Broadcasting too often. People mute or block you, which hurts your number's quality rating.",
    "Forgetting a “Reply STOP to opt out” footer on marketing messages.",
  ],
  related: [
    { href: "/contacts", label: "Contacts" },
    { href: "/settings", label: "Settings" },
  ],
};
