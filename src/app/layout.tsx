import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Pixelify_Sans, Press_Start_2P } from "next/font/google";
import { NavigationTracker } from "@/components/navigation";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Font del tema pixel art: scaricati solo se il tema è attivo.
const pixelSans = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
  preload: false,
});

const pixelDisplay = Press_Start_2P({
  variable: "--font-pixel-display",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});

/**
 * Applica il tema scelto (salvato nel browser) prima che la pagina venga
 * disegnata, così non si vede il "lampo" del tema classico.
 */
const themeScript = `try{var t=localStorage.getItem("schednd-theme");if(t==="pixel")document.documentElement.dataset.theme="pixel"}catch(e){}`;

export const metadata: Metadata = {
  title: {
    default: "Schednd",
    template: "%s · Schednd",
  },
  description:
    "Organizza le sessioni di giochi da tavolo, di ruolo e online: presenze, date e giochi.",
  applicationName: "Schednd",
  appleWebApp: {
    capable: true,
    title: "Schednd",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b12" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${pixelSans.variable} ${pixelDisplay.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistration />
        <Suspense>
          <NavigationTracker />
        </Suspense>
      </body>
    </html>
  );
}
