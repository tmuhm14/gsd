import type { Metadata, Viewport } from "next";
import { TRPCProvider } from "@/components/TRPCProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GSD — Get Sh*t Done",
  description: "Notes and tasks, organised the Getting Things Done way.",
  appleWebApp: { capable: true, title: "GSD", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  // Stops iOS zooming the page when the editor takes focus.
  maximumScale: 1,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
