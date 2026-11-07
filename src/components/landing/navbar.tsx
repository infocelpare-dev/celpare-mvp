"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
  Landing navbar, founder reference 2026-11-06: plain links in the middle, some
  with a dropdown chevron, an outlined pill and a filled ink pill on the right.
  Ink and white only, no lime and no tube light.

  Hrefs to home sections are root relative ("/#ask") because this nav is shared
  by every marketing page: on /startups a bare "#ask" would scroll to nothing.
  They are next/link so the hash is honoured after the home page renders.
*/

type NavLink = { href: string; label: string; note?: string };
type NavItem =
  | { kind: "link"; label: string; href: string }
  | { kind: "menu"; label: string; items: NavLink[] };

const nav: NavItem[] = [
  {
    kind: "menu",
    label: "Product",
    items: [
      { href: "/#ask", label: "Ask Celpare", note: "Describe the job, get the right tool" },
      { href: "/#compare", label: "Compare", note: "Plans, prices and features side by side" },
      { href: "/#tools", label: "AI Tools", note: "Tools from the catalogue" },
      { href: "/explore", label: "Explore", note: "Browse tools, models and the community" },
    ],
  },
  { kind: "link", label: "For startups", href: "/startups" },
  { kind: "link", label: "Pricing", href: "/pricing" },
  {
    kind: "menu",
    label: "Resources",
    items: [
      { href: "/help", label: "Help center", note: "How Celpare works" },
      { href: "/privacy", label: "Privacy", note: "What we keep and why" },
      { href: "/terms", label: "Terms", note: "The rules of using Celpare" },
    ],
  },
];

const linkText =
  "text-[16px] text-foreground/80 transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground rounded-md";

function DropdownItem({ item }: { item: Extract<NavItem, { kind: "menu" }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = `nav-menu-${item.label.toLowerCase()}`;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(linkText, "flex cursor-pointer items-center gap-1.5 py-2")}
      >
        {item.label}
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {/* pt-3 bridges the gap so the menu stays open while the pointer crosses it */}
      <div id={id} hidden={!open} className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
        <ul className="w-72 rounded-2xl border border-border bg-elevated p-2 shadow-lg">
          {item.items.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
              >
                <span className="block text-[15px] font-medium text-foreground">{l.label}</span>
                {l.note && <span className="mt-0.5 block text-[13px] text-muted">{l.note}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/85 backdrop-blur-md">
      <Container className="flex h-[76px] items-center justify-between gap-4">
        <Logo />

        <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-10 lg:flex">
          {nav.map((item) =>
            item.kind === "menu" ? (
              <DropdownItem key={item.label} item={item} />
            ) : (
              <Link key={item.label} href={item.href} className={cn(linkText, "py-2")}>
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          <ButtonLink href="/login" variant="outline" className="h-12 border-foreground/30 px-7 text-[16px] hover:border-foreground/60">
            Log in
          </ButtonLink>
          <ButtonLink href="/get-started" className="h-12 px-7 text-[16px]">
            Get started
          </ButtonLink>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            className="w-9 px-0"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </Container>

      <div id="mobile-nav" hidden={!open} className="border-t border-border lg:hidden">
        <Container className="flex max-h-[calc(100dvh-76px)] flex-col gap-1 overflow-y-auto py-4">
          {nav.map((item) =>
            item.kind === "menu" ? (
              <div key={item.label} className="pt-2">
                <p className="px-2 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
                  {item.label}
                </p>
                {item.items.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2.5 text-[15px] text-foreground transition-colors duration-200 hover:bg-surface"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-[15px] text-foreground transition-colors duration-200 hover:bg-surface"
              >
                {item.label}
              </Link>
            ),
          )}
          <ButtonLink href="/login" variant="outline" className="mt-3" onClick={() => setOpen(false)}>
            Log in
          </ButtonLink>
          <ButtonLink href="/get-started" className="mt-1" onClick={() => setOpen(false)}>
            Get started
          </ButtonLink>
        </Container>
      </div>
    </header>
  );
}
