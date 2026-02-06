import type { Metadata } from "next";
import { Libre_Baskerville, DM_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { PaperTexture } from "@/components/PaperTexture";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${libreBaskerville.variable} ${dmSans.variable} antialiased`}
      >
        <PaperTexture />
        <Sidebar />
        <main className="ml-0 pt-14 md:pt-0 md:ml-60 min-h-screen transition-all duration-200">
          {children}
        </main>
      </body>
    </html>
  );
}
