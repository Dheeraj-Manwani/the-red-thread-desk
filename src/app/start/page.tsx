import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { glossary, help, type ScreenHelp } from "@/content/help";

const screens: { href: string; help: ScreenHelp }[] = [
  { href: "/", help: help.dashboard },
  { href: "/inbox", help: help.inbox },
  { href: "/contacts", help: help.contacts },
  { href: "/orders", help: help.orders },
  { href: "/broadcasts", help: help.broadcasts },
  { href: "/triggers", help: help.automations },
  { href: "/flows", help: help.flows },
  { href: "/stats", help: help.stats },
  { href: "/comments", help: help.comments },
  { href: "/ice-breakers", help: help.iceBreakers },
  { href: "/packages", help: help.packages },
  { href: "/catalogue", help: help.catalogue },
  { href: "/settings", help: help.settings },
];

const daily = [
  { what: "Dashboard: anyone waiting for you, any 24-hour windows closing?", href: "/" },
  { what: "Inbox: reply to everyone marked “wants you”, oldest first.", href: "/inbox" },
  { what: "Orders: nudge people in “Payment sent”, start work on “Paid”, check event dates.", href: "/orders" },
  { what: "Post your reel or post, and make sure an automation covers its keyword.", href: "/triggers" },
  { what: "Evening: one more pass through the Inbox before windows close overnight.", href: "/inbox" },
];

const weekly = [
  { what: "Per-post stats: which posts brought payments? Plan next week's posts around them.", href: "/stats" },
  { what: "Comment log: find words people use that your keywords miss.", href: "/comments" },
  { what: "Catalogue and packages: anything new to show, anything to hide?", href: "/catalogue" },
  { what: "Broadcasts: is there a season or festival worth messaging opted-in people about?", href: "/broadcasts" },
  { what: "Dashboard: check this month's WhatsApp and AI spend.", href: "/" },
];

const setup = [
  { what: "Connect Instagram, Facebook and WhatsApp, and subscribe to webhooks.", href: "/settings" },
  { what: "Add your packages with prices.", href: "/packages" },
  { what: "Sync designs from the Red Thread site.", href: "/catalogue" },
  { what: "Build a first flow: greet → designs or packages → event date → payment link.", href: "/flows" },
  { what: "Create a Default comment automation per channel, then one for each reel with a call to action.", href: "/triggers" },
  { what: "Add ice breakers for new chats.", href: "/ice-breakers" },
  { what: "Turn on notifications on your phone.", href: "/settings" },
  { what: "Test everything from a second account (added as a tester in the Meta app).", href: "/comments" },
];

function Steps({ items }: { items: { what: string; href: string }[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      {items.map((i) => (
        <li key={i.what}>
          <Link href={i.href} className="hover:text-red-700 hover:underline">
            {i.what}
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default function StartPage() {
  const terms = glossary();
  return (
    <>
      <PageTitle title="Start here" help={help.start} />
      <div className="space-y-6">
        <Card className="space-y-2 text-sm leading-relaxed">
          <p>
            Red Thread finds customers through short videos on Instagram, Facebook and (soon) YouTube. People comment
            or message, the bot answers instantly and guides them to designs and a payment link, and you step in for
            the conversations that need a person. Paid orders then move across the Orders board until delivery.
          </p>
          <p>
            Every screen has an <span className="font-serif font-semibold italic">i</span> next to its title. Press it
            for what the screen is for and what to do there.
          </p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="font-semibold">Every day</h2>
            <Steps items={daily} />
          </Card>
          <Card className="space-y-3">
            <h2 className="font-semibold">Every week</h2>
            <Steps items={weekly} />
          </Card>
        </div>

        <Card className="space-y-3">
          <h2 className="font-semibold">Setting up, in this order</h2>
          <Steps items={setup} />
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">The screens</h2>
          <dl className="divide-y divide-neutral-100 text-sm">
            {screens.map((s) => (
              <div key={s.href} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt>
                  <Link href={s.href} className="font-medium text-red-700 hover:underline">
                    {s.help.title}
                  </Link>
                </dt>
                <dd className="text-neutral-700">
                  {s.help.whatThisIs}
                  <span className="mt-0.5 block text-xs text-neutral-500">When: {s.help.whenToCome}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Glossary</h2>
          <dl className="space-y-2.5 text-sm">
            {terms.map((t) => (
              <div key={t.term}>
                <dt className="font-medium">
                  {t.term} <span className="text-xs font-normal text-neutral-500">· {t.screen}</span>
                </dt>
                <dd className="text-neutral-700">{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
