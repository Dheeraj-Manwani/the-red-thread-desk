import type { ScreenHelp } from "./types";

export const dashboard: ScreenHelp = {
  id: "dashboard",
  title: "Dashboard",
  whatThisIs:
    "A one-page summary of today: how many people commented and messaged, how many new leads came in, what got paid, who is waiting for you, and what the app spent this month.",
  whyItMatters:
    "Leads go cold quickly. Someone who asks the price and gets a reply within minutes is far more likely to pay than someone who waits a day. This screen shows in seconds whether anyone is waiting and whether money is coming in.",
  whatToDo: [
    "Look at “Waiting for you” first. These people asked for a real person. Open each one and reply.",
    "Check “24 h windows closing soon”. Meta lets you reply on Instagram, Messenger and WhatsApp only within 24 hours of the person's last message. If anyone is listed, reply now or you lose the chance to message them for free.",
    "Glance at the five numbers for today. Tap a number to open the screen behind it.",
    "Look at “Top posts this week” to see which reels and posts are getting comments. Post more like them.",
    "Check “Spend this month” to make sure WhatsApp and AI costs are what you expect.",
  ],
  whenToCome: "First thing every morning, and a few times through the day (open the app from your phone's home screen).",
  terms: [
    {
      term: "Lead",
      meaning:
        "Someone who has shown interest: commented, messaged or tapped a button. Not yet a customer. “New leads” counts people the app saw for the first time today.",
    },
    {
      term: "24-hour window",
      meaning:
        "Meta's rule: after a person messages you, you (and the bot) can message them freely for 24 hours. After that, Instagram and Messenger block messages, and WhatsApp allows only paid, pre-approved templates.",
    },
    {
      term: "Revenue",
      meaning: "Money actually received (paid orders), in ₹. Payment links sent but not paid don't count.",
    },
  ],
  mistakes: [
    "Ignoring “Waiting for you”. While someone waits there, the bot stays quiet for them, so nobody is answering.",
    "Reading a quiet day as a bad day. Compare weeks on Per-post stats, not single days.",
  ],
  related: [
    { href: "/inbox", label: "Inbox" },
    { href: "/orders", label: "Orders" },
    { href: "/stats", label: "Per-post stats" },
  ],
};
