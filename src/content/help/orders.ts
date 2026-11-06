import type { ScreenHelp } from "./types";

export const orders: ScreenHelp = {
  id: "orders",
  title: "Orders",
  whatThisIs:
    "Every order from chat, from first interest to delivery, as a board with one column per stage (or as a list). Ready-made templates bought on the Red Thread site don't appear here; these are the orders handled in chat.",
  whyItMatters:
    "Paid orders are the point of everything else in the app. The board shows what's waiting for payment, what you still have to make, and what's due soon, so nothing slips.",
  whatToDo: [
    "Look at “Payment sent”: people who got a link and haven't paid. Open the chat and gently follow up.",
    "Look at “Paid” and “Details”: people who paid and are waiting for you. Collect their details and start work.",
    "Watch the event date on each card. Work on the nearest events first.",
    "Open an order to change its stage, edit details, send a status message or create a new payment link.",
    "Switch to List if you want every order in one table.",
  ],
  whenToCome: "Every day, after the Inbox.",
  terms: [
    { term: "Lead", meaning: "Interested, no payment link sent yet." },
    { term: "Payment sent", meaning: "A Razorpay link went out; waiting for the customer to pay." },
    { term: "Paid", meaning: "Razorpay confirmed the payment (or you marked it paid by hand)." },
    { term: "Details", meaning: "Collecting names, date, venue and photos for the invite." },
    { term: "In progress", meaning: "You're making the invite." },
    { term: "Delivered", meaning: "The finished invite was sent to the customer." },
    { term: "Event date", meaning: "The wedding or occasion date. Custom work takes 3–5 business days, so check it before promising delivery." },
  ],
  mistakes: [
    "Leaving orders in “Payment sent” for days. Most people who don't pay within a day need a reminder, not a new pitch.",
    "Forgetting to move orders forward. The board is only useful if stages are up to date.",
  ],
  related: [
    { href: "/inbox", label: "Inbox" },
    { href: "/packages", label: "Packages" },
  ],
};
