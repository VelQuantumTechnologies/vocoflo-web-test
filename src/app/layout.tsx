import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VocoFlo Web Test Harness (Staging)",
  description:
    "Private staging evaluation harness for VocoFlo Free Check-In and Module P01.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
