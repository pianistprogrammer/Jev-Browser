import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "JEV Browser",
  description: "AI-powered browser automation workspace",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
