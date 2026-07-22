import type { Metadata } from "next";
import { Libre_Baskerville, DM_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { PaperTexture } from "@/components/PaperTexture";
import { TEAM_THEME_COOKIE, parseTeamThemeCookie } from "@/lib/theme/team-theme";
import { getDataFreshness, getFreshestUpdateDays } from "@/lib/queries/dashboard";
import { formatRelativeDays } from "@/lib/utils";

const libreBaskerville = Libre_Baskerville({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "CFB Team 360 | College Football Analytics",
  description: "Interactive analytics portal for college football teams",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the team-theme preference cookie server-side so the correct
  // data-team-theme attribute is present on first paint (no hydration flash).
  const cookieStore = await cookies();
  const teamTheme = parseTeamThemeCookie(cookieStore.get(TEAM_THEME_COOKIE)?.value);

  // Marts refresh on a schedule, not in real time -- surface the most recent
  // update across tracked tables as a subtle relative-time note in the
  // sidebar footer (there is no dashboard widget slot for this; the old
  // SystemStatusWidget was removed in the Phase 4 sweep).
  const freshnessRows = await getDataFreshness();
  const freshestDays = getFreshestUpdateDays(freshnessRows);
  const dataUpdatedLabel = freshestDays == null ? null : formatRelativeDays(freshestDays);

  return (
    <html lang="en" data-team-theme={teamTheme ?? undefined}>
      <body
        className={`${libreBaskerville.variable} ${dmSans.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded focus:bg-[var(--bg-surface)] focus:text-[var(--text-primary)] focus:border focus:border-[var(--border)] focus:shadow-lg"
        >
          Skip to main content
        </a>
        <PaperTexture />
        <Sidebar dataUpdatedLabel={dataUpdatedLabel} />
        <main
          id="main-content"
          tabIndex={-1}
          className="ml-0 pt-14 md:pt-0 md:ml-60 min-h-screen transition-all duration-200 focus:outline-none"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
