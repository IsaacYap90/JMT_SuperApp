import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

import type { Viewport } from "next";

export const metadata: Metadata = {
  title: "JMT Dashboard",
  description: "Jai Muay Thai Gym Dashboard",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-jai-bg text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
