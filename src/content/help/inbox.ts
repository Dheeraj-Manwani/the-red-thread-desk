import type { ScreenHelp } from "./types";

export const inbox: ScreenHelp = {
  id: "inbox",
  title: "Inbox",
  whatThisIs:
    "Every conversation from Instagram, Facebook Messenger and WhatsApp in one list, newest first. The bot answers most messages itself; this is where you step in.",
  whyItMatters:
    "The bot handles the routine questions, but sales usually close when a real person answers the tricky ones: custom changes, dates, price. A fast, personal reply here is often what turns a lead into a paid order.",
  whatToDo: [
    "Open conversations marked “wants you” first. These people asked for a person, and the bot is waiting for you.",
    "Then look for “24 h window closed” labels. You can't reply to those from here any more, so reply to people before their window closes.",
    "Use “Waiting for you” to see only people who need you, or search by name.",
    "Tap a conversation to read it and reply.",
  ],
  whenToCome: "Several times a day. Turn on notifications in Settings so your phone tells you when someone asks for you.",
  terms: [
    {
      term: "Wants you",
      meaning:
        "The person wrote something like “human” or “talk to a person”, or a flow reached “Hand off to me”. The bot pauses for them until you reply or hand them back.",
    },
    {
      term: "Bot paused",
      meaning:
        "The bot won't answer this person for 24 hours because you (or they) took over. It resumes on its own after that, or when you press “Hand back to bot”.",
    },
    {
      term: "24 h window closed",
      meaning:
        "More than 24 hours since their last message. Meta blocks normal replies until they write again. On WhatsApp you can still reach them with an approved template (Broadcasts).",
    },
  ],
  mistakes: [
    "Replying from the Instagram app on your phone instead of here. It works, but the app has to guess that it was you and pauses the bot. Replying here keeps the record clean.",
  ],
  related: [
    { href: "/contacts", label: "Contacts" },
    { href: "/settings", label: "Notifications (Settings)" },
  ],
};
