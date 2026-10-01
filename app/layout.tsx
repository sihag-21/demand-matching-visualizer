import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Demand Matching Lab",
  description:
    "Explore the demand-matching algorithms of Shepherd and Vetta, one step at a time.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
