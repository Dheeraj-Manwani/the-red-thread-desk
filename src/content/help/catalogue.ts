import type { ScreenHelp } from "./types";

export const catalogue: ScreenHelp = {
  id: "catalogue",
  title: "Catalogue",
  whatThisIs:
    "Your invite designs, copied from the Red Thread site: name, occasion, picture, preview link and price. Flows show them as a swipeable carousel in chat.",
  whyItMatters:
    "People buy what they can see. Showing real designs in the chat, right after they ask, keeps them in the conversation instead of leaving for your site.",
  whatToDo: [
    "Press Sync to copy the latest designs from the site. It also syncs by itself once a day.",
    "Hide designs you don't want in the carousel (for example off-season occasions). Hidden designs stay on the site.",
    "Designs marked “not on site” were removed from the site at the last sync and won't be shown.",
  ],
  whenToCome: "After adding new designs to the site, or before a season when you want to change what's shown.",
  terms: [
    { term: "Sync", meaning: "Copies the design list from the Red Thread site into the app. Nothing is changed on the site." },
    { term: "Carousel", meaning: "A row of up to 10 cards with a picture and button, swiped sideways in chat." },
    { term: "Occasion", meaning: "Wedding, engagement, birthday… Flows can show designs for one occasion only." },
  ],
  mistakes: ["Expecting price changes made here to reach the site. Change prices on the site, then sync."],
  related: [
    { href: "/flows", label: "Flows" },
    { href: "/packages", label: "Packages" },
  ],
};
