import type { ScreenHelp } from "./types";

export const conversation: ScreenHelp = {
  id: "conversation",
  title: "Conversation",
  whatThisIs:
    "One person's full chat, with everything the app knows about them on the side: channel, tags, answers they gave in flows, their orders, and whether they agreed to WhatsApp offers.",
  whyItMatters:
    "This is where you close sales: answer questions, send a payment link with the right amount, and note what they want, all in one place without switching apps.",
  whatToDo: [
    "Read the chat and the “Answers” panel (names, dates and choices they already gave) so you don't ask twice.",
    "Type your reply and press Send. Sending pauses the bot for this person for 24 hours so it doesn't talk over you.",
    "When they're ready to buy, pick a package or enter a custom amount and press “Send payment link”. An order is created and moves to Paid by itself when Razorpay confirms the payment.",
    "Add tags (for example “wedding-feb” or “custom”) so you can find and message similar people later.",
    "If they said in chat that they want offers on WhatsApp, press “They agreed in chat: opt in”. Only opted-in people get broadcasts.",
    "When you're done, press “Hand back to bot” so automations work for them again.",
  ],
  whenToCome: "Whenever someone in the Inbox needs you.",
  terms: [
    {
      term: "Hand back to bot",
      meaning: "Ends your takeover early. Without it, the bot stays quiet for 24 hours after your last reply.",
    },
    {
      term: "Opt-in",
      meaning:
        "The person's permission to receive marketing messages on WhatsApp. Meta requires it, and messaging people without it can get your number restricted.",
    },
    {
      term: "Payment link",
      meaning:
        "A Razorpay link for a set amount. The customer pays by UPI, card or netbanking; the app hears about it and marks the order paid.",
    },
    {
      term: "Tag",
      meaning: "A label you put on a person, for filtering contacts and targeting broadcasts. Flows can add tags too.",
    },
    {
      term: "Also on …",
      meaning:
        "The same phone number is on another channel (say Instagram and WhatsApp). They're linked, not merged yet; that comes in a later phase.",
    },
  ],
  mistakes: [
    "Sending a payment link before agreeing the price and what's included for custom work. Agree scope in chat first.",
    "Forgetting to hand back to the bot, so the person gets no automatic replies for a day.",
  ],
  related: [
    { href: "/inbox", label: "Inbox" },
    { href: "/orders", label: "Orders" },
    { href: "/packages", label: "Packages" },
  ],
};
