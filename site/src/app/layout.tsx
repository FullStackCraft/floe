import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "floe - TypeScript Options Analytics Library",
  description: "Browser-only TypeScript functions for calculating Black-Scholes, Greeks, and dealer exposures with a clean, type-safe API.",
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
