import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border">
        <Container className="flex h-[68px] items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to home
            </Link>
          </div>
        </Container>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
    </>
  );
}
