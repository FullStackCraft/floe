import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

const docsDirectory = path.join(process.cwd(), "content/docs");
const examplesDirectory = path.join(process.cwd(), "content/examples");

export interface DocMeta {
  slug: string;
  title: string;
  description?: string;
  order?: number;
}

export interface DocContent extends DocMeta {
  contentHtml: string;
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

async function getMarkdownContent(directory: string, slug: string): Promise<DocContent | null> {
  const fullPath = path.join(directory, `${slug}.md`);
  
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  const processedContent = await remark().use(html).process(content);
  const contentHtml = processedContent.toString();

  return {
    slug,
    title: data.title || slug,
    description: data.description,
    order: data.order,
    contentHtml,
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
