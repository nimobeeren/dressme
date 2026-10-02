import type { Metadata } from "next";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
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
        <ClerkProvider>
          {children}
          <Show when="signed-in">
            <div className="fixed right-4 top-4 z-50">
              <UserButton />
            </div>
          </Show>
          <Toaster />
          <AlphaNotice />
        </ClerkProvider>
      </body>
    </html>
  );
}
