import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Policy Due Desk",
  description: "Track upcoming premium dues and push them to the Genesys calling list.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
