import type { ScreenHelp } from "./types";

export const flows: ScreenHelp = {
  id: "flows",
  title: "Flows",
  whatThisIs:
    "Your saved conversation scripts. A flow is a step-by-step chat the bot runs: greet, ask questions, show designs or packages, collect details, send a payment link, or hand the person to you.",
  whyItMatters:
    "A good flow does the first ten minutes of selling for you, every time, at any hour: it answers the usual questions, finds out what the person wants and when their event is, and gets them to the payment link.",
  whatToDo: [
    "Type a name (“Package enquiry”) and press “New flow” to create one, then build it on the next screen.",
    "Open a flow to edit it.",
    "Use a flow from an automation, an ice breaker, or a DM keyword: that's what starts it.",
    "Delete flows you no longer use (check no automation still points at them).",
  ],
  whenToCome: "When setting up, and when you change how you sell (new packages, new questions).",
  terms: [
    { term: "Flow", meaning: "A conversation script with steps and branches." },
    { term: "Run", meaning: "One person going through a flow. The app remembers where each person is." },
  ],
  mistakes: ["Building one giant flow for everything. Smaller flows for each purpose are easier to fix."],
  related: [
    { href: "/triggers", label: "Automations" },
    { href: "/ice-breakers", label: "Ice breakers" },
  ],
};

export const flowBuilder: ScreenHelp = {
  id: "flow-builder",
  title: "Flow builder",
  whatThisIs:
    "The canvas where you build a flow. Each box is a step; arrows connect them in the order the bot follows. Buttons on a step can lead to different next steps.",
  whyItMatters:
    "The order and wording of these steps decide how many people reach the payment link. Short, friendly steps with clear buttons work best.",
  whatToDo: [
    "Add steps with the “+ Message”, “+ Question”… buttons, then drag from one step's dot to another to connect them. Start is where every run begins.",
    "Click a step to edit it in the side panel: text, buttons, the question and where the answer is saved.",
    "Give each button its own arrow if the answers should go different ways. A step with no buttons goes straight on.",
    "Press “Save flow”. Problems (steps not connected, missing text) are listed above the canvas.",
    "Test it from a tester account: comment the keyword or send the DM that starts it.",
  ],
  whenToCome: "When creating or improving a flow.",
  terms: [
    { term: "Start", meaning: "The first step. Every run begins here." },
    { term: "Message", meaning: "Sends text, optionally with up to 13 quick-reply buttons (20 characters each)." },
    {
      term: "Question",
      meaning:
        "Asks something and waits for the answer (text, number, email, phone, date, link or photo), then saves it under a field name like event_date. Re-asks if the answer looks wrong.",
    },
    { term: "Package picker", meaning: "Shows your packages from the Packages screen as buttons, and saves the choice." },
    { term: "Design carousel", meaning: "Shows designs from the Catalogue as swipeable cards (up to 10), optionally for one occasion." },
    { term: "Follow gate", meaning: "Instagram only: asks the person to follow you before continuing." },
    { term: "Send link", meaning: "Sends a tracked link, or the link of the package they picked." },
    { term: "Payment link", meaning: "Creates an order and sends a Razorpay link for the package price, the design price, or a fixed amount. Continues when they pay." },
    { term: "Tags", meaning: "Adds or removes tags on the person, to filter and target them later." },
    { term: "Condition", meaning: "Splits the flow by a tag, a saved answer, or whether they follow you." },
    { term: "Hand off to me", meaning: "Stops the bot and puts the person in your Inbox as “wants you”." },
    {
      term: "WhatsApp offers opt-in",
      meaning: "Asks if they'd like offers on WhatsApp. A yes records their permission for broadcasts.",
    },
  ],
  mistakes: [
    "Steps with no arrow out. The conversation just stops there.",
    "Asking too many questions before showing designs or price. People leave.",
    "Changing field names that other steps or orders rely on (like event_date).",
  ],
  related: [
    { href: "/flows", label: "All flows" },
    { href: "/packages", label: "Packages" },
    { href: "/catalogue", label: "Catalogue" },
  ],
};
