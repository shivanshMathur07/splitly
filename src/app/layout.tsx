import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { TitleProvider } from "@/components/shell/page-title";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Splitly — share expenses with friends",
  description: "A personal app for splitting bills, settling up and seeing where the money went.",
  applicationName: "Splitly",
  appleWebApp: { capable: true, title: "Splitly", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d9488",
};

export default function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen font-sans">
        <TitleProvider>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] pt-4 md:pb-6 md:pt-6">{children}</main>
          {modal}
        </TitleProvider>
      </body>
    </html>
  );
}
