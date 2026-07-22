import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Training Pulse | Ministry Learning Feedback",
  description: "A simple, confidential way to improve every ministry training.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "Training Pulse", description: "Your voice shapes better ministry training.", images: [{ url: "/og.png", width: 1536, height: 1024 }] },
  twitter: { card: "summary_large_image", title: "Training Pulse", description: "Your voice shapes better ministry training.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={manrope.variable}>{children}</body></html>;
}
