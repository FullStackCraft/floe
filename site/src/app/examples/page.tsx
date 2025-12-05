import Link from "next/link";
import { getAllExamples } from "@/lib/markdown";

export default function ExamplesIndex() {
  const examples = getAllExamples();

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-gray-500 hover:text-black text-sm mb-4 inline-block">
            ← Back to home
          </Link>
          <h1 className="font-mono text-4xl md:text-5xl font-bold mb-4">Examples</h1>
          <p className="text-gray-600 text-lg">
            Real-world code examples demonstrating floe's options analytics capabilities.
          </p>
        </div>

        {/* Example Links */}
        <div className="space-y-4">
          {examples.length > 0 ? (
            examples.map((example) => (
              <Link
                key={example.slug}
                href={`/examples/${example.slug}`}
                className="block border border-gray-200 rounded-lg p-6 hover:border-black transition-colors bg-white"
              >
                <h2 className="font-mono text-xl font-semibold mb-2">{example.title}</h2>
                {example.description && (
                  <p className="text-gray-600">{example.description}</p>
                )}
              </Link>
            ))
          ) : (
            <div className="border border-gray-200 rounded-lg p-8 text-center bg-white">
              <p className="text-gray-500">Examples coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
