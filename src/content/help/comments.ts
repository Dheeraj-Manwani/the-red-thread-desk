import type { ScreenHelp } from "./types";

export const comments: ScreenHelp = {
  id: "comments",
  title: "Comment log",
  whatThisIs:
    "Every comment the app received, newest first: who wrote what, which automation it matched (or why it was skipped), the result, and link clicks. At the top, any webhook events that failed to process.",
  whyItMatters:
    "When someone says “I commented but got nothing”, this is where you find out why. It also shows what words real people use, so you can improve your keywords.",
  whatToDo: [
    "Check “Failed webhook events” at the top. If there are any, something broke; the error text says what.",
    "Look at comments with “no match”. If many say the same thing (“price?”, “rate”), add that as a keyword.",
    "Look at the Result column for skipped comments: already got the DM (once per person), opted out, or an error.",
  ],
  whenToCome: "When something seems wrong, and once a week to find new keywords.",
  terms: [
    {
      term: "Webhook",
      meaning:
        "How Instagram, Facebook and WhatsApp tell the app that something happened (a comment, a message). If the app can't process one, it's listed as failed.",
    },
    { term: "No match", meaning: "No automation's keywords fitted this comment, so the bot did nothing." },
    { term: "Once per person", meaning: "The bot sends the DM for an automation only once to each person, even if they comment again." },
  ],
  mistakes: ["Expecting comments from your own or a teammate's account to trigger anything while the Meta app is in development mode."],
  related: [
    { href: "/triggers", label: "Automations" },
    { href: "/stats", label: "Per-post stats" },
  ],
};
