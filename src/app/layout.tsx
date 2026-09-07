import type { Metadata } from "next";
import { Libre_Franklin, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const body = Libre_Franklin({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Fact Knowledge Layer",
  description: "Extract facts from PDFs and compare them across documents.",
};

/**
 * Runs before first paint: applies the saved theme, falling back to the
 * system preference. Prevents a light-mode flash before hydration.
 */
const themeInit = `(function(){try{var s=localStorage.getItem("fkl-theme");var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var c=document.documentElement.classList;d?c.add("dark"):c.remove("dark");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${body.variable} ${mono.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
