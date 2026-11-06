/**
 * Help shown by the "i" button on every admin screen. Plain data: it's passed from server pages
 * to the client modal, so keep it serialisable (strings, arrays, plain objects).
 */
export type ScreenHelp = {
  /** Stable key, used to remember that the modal was opened once on this browser. */
  id: string;
  title: string;
  /** One short paragraph: what this screen is. */
  whatThisIs: string;
  /** How this screen makes or saves money. */
  whyItMatters: string;
  /** Numbered steps: the usual job on this screen. */
  whatToDo: string[];
  /** "Every morning", "after posting a reel", "once at setup". */
  whenToCome: string;
  /** Business and app terms on this screen. Also collected into the glossary on /start. */
  terms?: { term: string; meaning: string }[];
  /** Common traps. */
  mistakes?: string[];
  related?: { href: string; label: string }[];
};
