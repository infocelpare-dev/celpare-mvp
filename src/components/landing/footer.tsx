import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

/*
  Section hrefs are root relative. The footer renders on /explore and /demo too,
  where "#how" would scroll to a section that is not on the page, so the link has
  to carry the route with it. On the home page "/#how" resolves to the same plain
  fragment scroll.
*/
const columns = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Why Celpare", href: "/#why" },
      { label: "Categories", href: "/#tools" },
      { label: "Community", href: "/#audience" },
      { label: "Get started", href: "/signup" },
    ],
  },
  {
    title: "For builders",
    links: [
      { label: "Submit a tool", href: "/signup" },
      { label: "Developer plans", href: "/signup" },
      { label: "Verified badge", href: "/signup" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "mailto:infocelpare@gmail.com" },
      { label: "Log in", href: "/login" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border py-14">
      <Container>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-3 max-w-[30ch] text-[14px] leading-relaxed text-muted">
              Discover, compare and choose the right AI tools and models.
            </p>
          </div>

          {columns.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h3 className="font-display text-[14px] font-semibold">
                {c.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <FooterLink href={l.href}>{l.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Celpare. All rights reserved.</p>
          <p>Right tool. Right result.</p>
        </div>
      </Container>
    </footer>
  );
}

/*
  mailto and any future external link stay plain anchors. Everything internal
  goes through next/link so that a "/#how" from /explore or /demo actually lands
  on the section rather than at the top of the home page.
*/
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const className =
    "text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
