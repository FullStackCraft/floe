import Link from "next/link";
import { notFound } from "next/navigation";
import { getExampleBySlug, getAllExampleSlugs } from "@/lib/markdown";
import { highlightCode } from "@/lib/prism";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllExampleSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function ExamplePage({ params }: PageProps) {
  const { slug } = await params;
  const example = await getExampleBySlug(slug);

  if (!example) {
    notFound();
  }

  const highlightedHtml = highlightCode(example.contentHtml);

  return (
    <main className="min-h-screen px-4 py-16">
      <article className="max-w-3xl mx-auto">
        {/* Navigation */}
        <Link href="/examples" className="text-gray-500 hover:text-black text-sm mb-8 inline-block">
          ← Back to examples
        </Link>

        {/* Title */}
        <h1 className="font-mono text-3xl md:text-4xl font-bold mb-4">{example.title}</h1>
        {example.description && (
          <p className="text-gray-600 text-lg mb-8">{example.description}</p>
        )}

        {/* Content */}
        <div 
          className="prose prose-gray max-w-none"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }} 
        />
      </article>
    </main>
  );
}
