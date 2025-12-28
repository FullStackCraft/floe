"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const installCommand = "npm install @fullstackcraftllc/floe";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 pb-8 md:pb-4">
      {/* Main Content Wrapper - grows to push footer down */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="font-mono text-7xl md:text-8xl lg:text-9xl font-bold tracking-tight mb-6 text-[#CB3837]">
            floe
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Zero-dependency TypeScript functions for options flow: Black-Scholes, greeks, IV surfaces, dealer exposures, implied PDFs, and more, with a clean, type-safe API. Broker agnostic. Stream data from a variety of brokers with a uniform API. Built for use in trading platforms and fintech applications.
          </p>
          <div className="mt-6">
            <a
              href="/floe/whitepaper.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-bold text-white bg-[#CB3837] px-6 py-3 rounded hover:bg-[#B03231] transition-colors"
            >
              Read Whitepaper
            </a>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-4xl">
          <Link
            href="/documentation"
            className="flex-1 group border border-gray-200 rounded-lg p-8 hover:border-black transition-colors bg-white"
          >
            <h2 className="font-mono text-2xl font-semibold mb-3 group-hover:underline">
              Documentation
            </h2>
            <p className="text-gray-600">
              API reference, installation guide, and usage examples for integrating floe into your applications.
            </p>
          </Link>

          <Link
            href="/examples"
            className="flex-1 group border border-gray-200 rounded-lg p-8 hover:border-black transition-colors bg-white"
          >
            <h2 className="font-mono text-2xl font-semibold mb-3 group-hover:underline">
              Examples
            </h2>
            <p className="text-gray-600">
              Live, real-world code examples demonstrating Black-Scholes pricing, Greeks calculations, and dealer exposures.
            </p>
          </Link>

          <Link
            href="/playground"
            className="flex-1 group border border-gray-200 rounded-lg p-8 hover:border-black transition-colors bg-white"
          >
            <h2 className="font-mono text-2xl font-semibold mb-3 group-hover:underline">
              Playground
            </h2>
            <p className="text-gray-600">
              Interactive TypeScript editor to experiment with floe functions and see results in real-time.
            </p>
          </Link>
        </div>

        {/* Quick Install */}
        <div className="mt-16 mb-8 md:mb-16 text-center">
          <p className="text-sm text-gray-500 mb-3">{copied ? "Copied!" : "Quick install"}</p>
          <button
            onClick={handleCopy}
            className="font-mono text-sm bg-gray-100 px-4 py-2 rounded border border-gray-200 hover:border-gray-400 transition-colors cursor-pointer"
          >
            {installCommand}
          </button>
        </div>
      </div>

      {/* Footer - uses mt-auto to stick to bottom */}
      <footer className="mt-auto pt-8 pb-4 text-sm text-gray-400 flex flex-col items-center gap-2">
        <div>
          <a 
            href="https://github.com/FullStackCraft/floe" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-black transition-colors"
          >
            GitHub
          </a>
          <span className="mx-3">·</span>
          <a 
            href="https://www.npmjs.com/package/@fullstackcraftllc/floe" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-black transition-colors"
          >
            NPM
          </a>
          <span className="mx-3">·</span>
          <a 
            href="https://fullstackcraft.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-black transition-colors"
          >
            Full Stack Craft
          </a>
        </div>
        <div className="text-xs mt-1">© {new Date().getFullYear()} Full Stack Craft LLC</div>
      </footer>
    </main>
  );
}
