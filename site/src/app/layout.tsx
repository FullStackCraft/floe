import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "floe - TypeScript Options Analytics Library",
  description: "Zero-dependency TypeScript functions for options flow: Black-Scholes, Greeks, and dealer exposures, and more, with a clean, type-safe API. Built for use in trading platforms and fintech applications.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#FAFAFA] text-black antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
