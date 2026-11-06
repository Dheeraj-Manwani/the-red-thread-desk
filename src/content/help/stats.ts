import type { ScreenHelp } from "./types";

export const stats: ScreenHelp = {
  id: "stats",
  title: "Per-post stats",
  whatThisIs:
    "How each post and reel performed: comments, how many matched an automation, DMs sent, links sent, follows gained, link clicks and revenue. Plus the overall funnel, revenue by channel, story replies and ice breakers, for the last 7, 30 or 90 days.",
  whyItMatters:
    "This tells you what to post next. A reel with many comments but no payments needs a better flow; a reel with fewer comments but several payments is worth posting again or turning into an ad.",
  whatToDo: [
    "Pick a time window at the top (7, 30 or 90 days).",
    "Read the funnel from left to right. Each percentage is of the step before, so the biggest drop shows where people lose interest.",
    "In the posts table, look at the Revenue column before Comments. Copy what the top earners did.",
    "If a post has comments but few matched, its automation keywords are missing what people actually write.",
    "If DMs go out but few links are clicked, rewrite the DM or button text.",
  ],
  whenToCome: "Once a week, before planning the next week's posts.",
  terms: [
    {
      term: "Funnel",
      meaning:
        "The steps from first interest to payment: comments → DMs sent → links sent → links clicked → paid orders. Each step loses some people; the aim is to lose fewer.",
    },
    { term: "Matched", meaning: "Comments that triggered an automation." },
    { term: "Follows gained", meaning: "People who weren't following you and followed because of the follow gate." },
    { term: "Clicks", meaning: "Taps on the tracked links the bot sent. Link-preview robots are filtered out." },
    { term: "Conversion", meaning: "The share of people who move to the next step, for example 20 clicks from 100 links = 20%." },
  ],
  mistakes: [
    "Judging a post after one day. Reels keep getting views for a week or more.",
    "Chasing comments instead of payments.",
  ],
  related: [
    { href: "/triggers", label: "Automations" },
    { href: "/comments", label: "Comment log" },
  ],
};
