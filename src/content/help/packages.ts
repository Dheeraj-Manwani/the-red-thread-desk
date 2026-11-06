import type { ScreenHelp } from "./types";

export const packages: ScreenHelp = {
  id: "packages",
  title: "Packages",
  whatThisIs:
    "Your fixed offers with a name, price and link (for example “Gold – ₹2,499”). Flows show them as buttons in the package picker and use their price for payment links.",
  whyItMatters:
    "Clear packages make choosing easy and speed up the sale. A customer who picks “Gold” can get a payment link for the right amount straight away, without waiting for you.",
  whatToDo: [
    "Add a package: a short name, the price in ₹, its position in the list, and a link to its page on your site.",
    "Keep names short: the button shows name + price in 20 characters.",
    "Hide packages you no longer sell instead of deleting them, so old orders still show what was bought.",
  ],
  whenToCome: "Once at setup, and whenever prices or offers change.",
  terms: [
    {
      term: "Package vs custom",
      meaning:
        "Packages have a fixed price. Custom work is priced per requirement: agree it in chat and send a payment link with a custom amount from the conversation.",
    },
    { term: "Order (position)", meaning: "The position in the list (lower shows first)." },
  ],
  mistakes: ["Changing a price here while people are mid-flow. New payment links use the new price."],
  related: [
    { href: "/flows", label: "Flows" },
    { href: "/catalogue", label: "Catalogue" },
  ],
};
