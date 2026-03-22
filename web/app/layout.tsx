import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homeo-Magic | Homeopathic Repertorization",
  description:
    "Find matching homeopathic remedies by selecting rubrics. 74,000+ rubrics, 2,400+ remedies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
