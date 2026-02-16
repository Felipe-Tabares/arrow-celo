import { AppProvider } from "@/providers/AppProvider";
import "@/styles/globals.css";
import { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Arrow - On-chain Archery Game",
  description:
    "On-chain archery betting game on Celo. Aim, shoot, and win up to 1.9x your bet!",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  openGraph: {
    title: "Arrow - On-chain Archery Game",
    description:
      "Bet micro amounts of CELO and test your aim! Hit the bullseye for 1.9x payout.",
    images: [
      {
        url: "/logo.svg",
        width: 1200,
        height: 630,
        alt: "Arrow Game",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
