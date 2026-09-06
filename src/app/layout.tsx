import type { Metadata } from "next";
import { AlphaNotice } from "@/components/alpha-notice";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "dressme",
  icons: { icon: "/vite.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
        <AlphaNotice />
      </body>
    </html>
  );
}
