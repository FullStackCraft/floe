import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocBySlug, getAllDocSlugs } from "@/lib/markdown";
import { highlightCode } from "@/lib/prism";
import { TableOfContents } from "@/components/TableOfContents";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllDocSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);

  if (!doc) {
    notFound();
  }

  const highlightedHtml = highlightCode(doc.contentHtml);

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-7xl mx-auto">
        <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-8">
          {/* Main content */}
          <article className="max-w-3xl">
            {/* Navigation */}
            <Link href="/documentation" className="text-gray-500 hover:text-black text-sm mb-8 inline-block">
              ← Back to documentation
            </Link>

            {/* Title */}
            <h1 className="font-mono text-3xl md:text-4xl font-bold mb-4">{doc.title}</h1>
            {doc.description && (
              <p className="text-gray-600 text-lg mb-8">{doc.description}</p>
            )}

            {/* Content */}
            <div 
              className="prose prose-gray max-w-none"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }} 
            />
          </article>

          {/* Sidebar TOC - hidden on mobile, sticky on desktop */}
          {doc.toc.length > 0 && (
            <aside className="hidden lg:block">
              <div className="sticky top-8">
                <TableOfContents items={doc.toc} />
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
