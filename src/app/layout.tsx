import type { Metadata, Viewport } from "next";
import { Inter, Dancing_Script } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const dancingScript = Dancing_Script({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-dancing-script",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JMT OS",
  description: "Jai Muay Thai Gym Dashboard",
  manifest: "/manifest.webmanifest",
  applicationName: "JMT OS",
  appleWebApp: {
    capable: true,
    title: "JMT",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${dancingScript.variable}`}>
      <body className={`${inter.className} bg-jai-bg text-white antialiased`}>
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
