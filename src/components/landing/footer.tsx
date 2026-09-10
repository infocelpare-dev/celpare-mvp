import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

/*
  Every link points at a real section on this page or at a placeholder that is
  honestly labelled. No dead links to routes that do not exist yet.
*/
const columns = [
  {
    title: "Product",
    links: [
      { label: "Why Celpare", href: "#why" },
      { label: "Categories", href: "#tools" },
      { label: "Community", href: "#audience" },
      { label: "Early access", href: "#waitlist" },
    ],
  },
  {
    title: "For builders",
    links: [
      { label: "Submit a tool", href: "#waitlist" },
      { label: "Developer plans", href: "#waitlist" },
      { label: "Verified badge", href: "#waitlist" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "mailto:infocelpare@gmail.com" },
      { label: "Get early access", href: "#waitlist" },
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
                    <a
                      href={l.href}
                      className="text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground"
                    >
                      {l.label}
                    </a>
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
