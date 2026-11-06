import type { ScreenHelp } from "./types";

export const automations: ScreenHelp = {
  id: "automations",
  title: "Automations",
  whatThisIs:
    "Rules that make the bot act on its own: when someone comments a keyword on a post or reel, replies to a story, or sends a DM with certain words, the bot replies and sends a DM, a link or a flow.",
  whyItMatters:
    "This is the engine that turns views into leads while you sleep. A reel that says “comment PRICE” and replies in DM within seconds catches people while they're still interested.",
  whatToDo: [
    "Press “New automation” and pick the type (Instagram comments, story replies, Facebook comments, or DM keywords per channel).",
    "Check that each important post or reel is covered, either by its own automation or by a Default one.",
    "Turn off automations for offers that have ended.",
    "Delete ones you don't need any more. The comment log keeps the history.",
  ],
  whenToCome: "Every time you post a reel or post with a call to action (“comment LINK”), and when an offer starts or ends.",
  terms: [
    {
      term: "Default (fallback)",
      meaning:
        "Runs on any post that has no automation of its own, so no comment goes unanswered. Specific automations always win over the default.",
    },
    {
      term: "Follow gate",
      meaning:
        "Instagram only: the bot asks the person to follow you before sending the link. Grows followers, but some people drop off.",
    },
    { term: "Keyword", meaning: "A word that triggers the automation, like PRICE or LINK. A trailing * matches word starts (kitn* matches kitna, kitne)." },
    { term: "Priority", meaning: "When two automations match the same comment, the higher number wins." },
  ],
  mistakes: [
    "Posting a reel that says “comment PRICE” without an automation for it. Those comments get no reply.",
    "Keywords that are too common (“hi”, “nice”), so the bot DMs everyone.",
  ],
  related: [
    { href: "/flows", label: "Flows" },
    { href: "/comments", label: "Comment log" },
    { href: "/stats", label: "Per-post stats" },
  ],
};

export const automationNew: ScreenHelp = {
  id: "automation-new",
  title: "New automation",
  whatThisIs:
    "Set up one rule: which posts or messages it watches, which words trigger it, and what the bot sends back.",
  whyItMatters:
    "A clear, fast first reply decides whether a curious viewer becomes a lead. Spend two minutes here and every matching comment gets that reply instantly.",
  whatToDo: [
    "Pick the type at the top: Instagram comments, story replies, Facebook comments, or DM keywords for Instagram, Messenger or WhatsApp.",
    "Basics: a name you'll recognise (“Wedding reel – Nov”), and which posts it applies to: chosen posts, all posts, or Default.",
    "Keywords: the words that trigger it. Optionally tick AI intents so it also fires when someone asks in their own words (“kitne ka hai?”).",
    "Public replies (comments only): a few short replies posted under the comment, like “Check your DMs {username}!”. One is picked at random.",
    "What to send: either pick a flow (a full conversation) or write a first DM, a button and the link to send.",
    "Decide on the follow gate (Instagram) and save.",
  ],
  whenToCome: "Before or right after you post something that asks people to comment or message.",
  terms: [
    { term: "{username}", meaning: "Replaced with the person's Instagram handle or name." },
    {
      term: "AI intent",
      meaning:
        "The AI reads the message and decides what the person wants (price, designs, a person…), even with no keyword. It costs a little per message and stops at the monthly cap in Settings.",
    },
    {
      term: "Flow",
      meaning:
        "A step-by-step conversation built on the Flows screen. Use one when you need questions, choices or payment; use the simple first DM + link for a quick “here's the link”.",
    },
    { term: "Tracked link", meaning: "Links are sent as short links, so clicks show up per post on Per-post stats." },
  ],
  mistakes: [
    "Buttons longer than 20 characters get cut off.",
    "Writing one public reply. Use three or four, so replies don't look copied and spammy.",
  ],
  related: [
    { href: "/triggers", label: "All automations" },
    { href: "/flows", label: "Flows" },
  ],
};

export const automationEdit: ScreenHelp = {
  ...automationNew,
  id: "automation-edit",
  title: "Edit automation",
  whatThisIs:
    "Change an existing rule: the posts it watches, its keywords, its replies, or what it sends. Changes apply to the next matching comment or message.",
  whatToDo: [
    "Change the keywords, public replies or DM text, then press “Save automation”.",
    "To point it at a newly posted reel, tick it under the posts list (or paste older post IDs).",
    "Switch to a flow if you need questions or payment instead of a plain link.",
    "People who already got the DM won't get it again (once per person), so edits only affect new people.",
  ],
  whenToCome: "When an offer, link or wording changes, or when Per-post stats show people dropping off.",
};
