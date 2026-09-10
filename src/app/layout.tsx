import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/* D10: Space Grotesk headings, DM Sans body, JetBrains Mono for model ids. */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Celpare, right tool, right result",
    template: "%s | Celpare",
  },
  description:
    "Celpare helps you discover, compare and choose the right AI tools and models, alongside a community of people building with AI.",
  keywords: [
    "AI tools",
    "AI models",
    "compare AI tools",
    "AI directory",
    "AI discovery",
  ],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Celpare",
    title: "Celpare, right tool, right result",
    description:
      "Discover, compare and choose the right AI tools and models, alongside a community of people building with AI.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Celpare, right tool, right result",
    description:
      "Discover, compare and choose the right AI tools and models, alongside a community of people building with AI.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
