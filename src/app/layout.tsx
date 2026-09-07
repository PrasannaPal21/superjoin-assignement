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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${body.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
