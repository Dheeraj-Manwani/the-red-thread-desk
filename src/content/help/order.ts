import type { ScreenHelp } from "./types";

export const order: ScreenHelp = {
  id: "order",
  title: "Order",
  whatThisIs:
    "One order in full: what was sold and for how much, payment status, the customer, the event date, the details they gave (names, venue, photos) and your private notes.",
  whyItMatters:
    "Everything you need to make the invite is here, so you don't have to scroll through chats to find a spelling or a venue. Mistakes in names or dates on an invite are costly, so keep this accurate.",
  whatToDo: [
    "Check the payment badge. If they paid outside Razorpay (cash, direct UPI), press “Mark paid (outside Razorpay)”.",
    "Fill in or correct the event date and the details, one per line as key: value (for example bride: Priya).",
    "Move the stage forward as you work: Paid → Details → In progress → Delivered.",
    "Use the ready-made messages (“Payment received”, “Ask for details”, “Invite is ready”) to update the customer in one tap.",
    "If a link expired or the amount changed, press “New link” and send it from the message box.",
    "Save customer photos somewhere safe: Instagram and Messenger photo links can stop working after a while.",
  ],
  whenToCome: "When a payment arrives, when you collect details, and when you deliver.",
  terms: [
    { term: "Notes (only you see these)", meaning: "Private notes. Never sent to the customer." },
    {
      term: "Details",
      meaning: "The information for the invite. Answers from a flow after payment land here automatically.",
    },
    { term: "Payment status", meaning: "Unpaid, paid, or expired/failed, as Razorpay reports it." },
  ],
  mistakes: [
    "Starting work before the payment shows as paid.",
    "Relying on a photo link in the chat instead of downloading it.",
  ],
  related: [
    { href: "/orders", label: "All orders" },
    { href: "/inbox", label: "Inbox" },
  ],
};
