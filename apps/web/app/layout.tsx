import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { SideRail } from "@/components/shell/side-rail";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dreamina: Create realistic talking avatars with AI avatar generator",
  description: "Dreamina clone — AI creation platform (local study build)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full flex flex-col bg-dm-bg font-dm-body text-dm-text antialiased">
        <Providers>
          <SideRail />
          <main className="flex min-h-screen flex-col pl-[76px]">{children}</main>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
