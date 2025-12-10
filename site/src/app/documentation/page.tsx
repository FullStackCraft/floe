import Link from "next/link";
import { getAllDocs } from "@/lib/markdown";

export default function DocumentationIndex() {
  const docs = getAllDocs();

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-gray-500 hover:text-black text-sm mb-4 inline-block">
            ← Back to home
          </Link>
          <h1 className="font-mono text-4xl md:text-5xl font-bold mb-4">Documentation</h1>
          <p className="text-gray-600 text-lg">
            Learn how to install and use <code>floe</code> for options analytics in your TypeScript applications.
          </p>
        </div>

        {/* Doc Links */}
        <div className="space-y-4">
          {docs.length > 0 ? (
            docs.map((doc) => (
              <Link
                key={doc.slug}
                href={`/documentation/${doc.slug}`}
                className="block border border-gray-200 rounded-lg p-6 hover:border-black transition-colors bg-white"
              >
                <h2 className="font-mono text-xl font-semibold mb-2">{doc.title}</h2>
                {doc.description && (
                  <p className="text-gray-600">{doc.description}</p>
                )}
              </Link>
            ))
          ) : (
            <div className="border border-gray-200 rounded-lg p-8 text-center bg-white">
              <p className="text-gray-500">Documentation coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
