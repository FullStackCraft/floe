import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import gfm from "remark-gfm";

const docsDirectory = path.join(process.cwd(), "content/docs");
const examplesDirectory = path.join(process.cwd(), "content/examples");

export interface DocMeta {
  slug: string;
  title: string;
  description?: string;
  order?: number;
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface DocContent extends DocMeta {
  contentHtml: string;
  toc: TocItem[];
}

function getMarkdownFiles(directory: string): DocMeta[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  
  const fileNames = fs.readdirSync(directory);
  const allDocs = fileNames
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => {
      const slug = fileName.replace(/\.md$/, "");
      const fullPath = path.join(directory, fileName);
      const fileContents = fs.readFileSync(fullPath, "utf8");
      const { data } = matter(fileContents);

      return {
        slug,
        title: data.title || slug,
        description: data.description,
        order: data.order || 999,
      };
    });

  return allDocs.sort((a, b) => (a.order || 999) - (b.order || 999));
}

/**
 * Generate a slug from heading text (same algorithm as GitHub)
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Extract table of contents from markdown content
 */
function extractToc(content: string): TocItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const toc: TocItem[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = slugify(text);
    
    toc.push({ id, text, level });
  }

  return toc;
}

/**
 * Add IDs to heading tags in HTML
 */
function addHeadingIds(html: string, toc: TocItem[]): string {
  let result = html;
  
  for (const item of toc) {
    // Match the heading tag and add id attribute
    const headingTag = `h${item.level}`;
    // Escape special regex characters in the text
    const escapedText = item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${headingTag}>\\s*${escapedText}\\s*</${headingTag}>`, 'i');
    result = result.replace(regex, `<${headingTag} id="${item.id}">${item.text}</${headingTag}>`);
  }
  
  return result;
}

async function getMarkdownContent(directory: string, slug: string): Promise<DocContent | null> {
  const fullPath = path.join(directory, `${slug}.md`);
  
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  // Extract TOC before processing
  const toc = extractToc(content);

  // Use remark-gfm for GitHub Flavored Markdown (tables, strikethrough, etc.)
  const processedContent = await remark()
    .use(gfm)
    .use(html, { sanitize: false })
    .process(content);
  
  // Add IDs to headings for anchor links
  const contentHtml = addHeadingIds(processedContent.toString(), toc);

  return {
    slug,
    title: data.title || slug,
    description: data.description,
    order: data.order,
    contentHtml,
    toc,
  };
}

export function getAllDocs(): DocMeta[] {
  return getMarkdownFiles(docsDirectory);
}

export function getAllExamples(): DocMeta[] {
  return getMarkdownFiles(examplesDirectory);
}

export async function getDocBySlug(slug: string): Promise<DocContent | null> {
  return getMarkdownContent(docsDirectory, slug);
}

export async function getExampleBySlug(slug: string): Promise<DocContent | null> {
  return getMarkdownContent(examplesDirectory, slug);
}

export function getAllDocSlugs(): string[] {
  if (!fs.existsSync(docsDirectory)) {
    return [];
  }
  return fs.readdirSync(docsDirectory)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => fileName.replace(/\.md$/, ""));
}

export function getAllExampleSlugs(): string[] {
  if (!fs.existsSync(examplesDirectory)) {
    return [];
  }
  return fs.readdirSync(examplesDirectory)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => fileName.replace(/\.md$/, ""));
}
