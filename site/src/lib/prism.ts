import Prism from "prismjs";

// Load additional languages
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";

/**
 * Highlights code blocks in HTML content using Prism.js
 * Finds <code class="language-xxx"> blocks and applies syntax highlighting
 */
export function highlightCode(html: string): string {
  // Match code blocks with language class
  const codeBlockRegex = /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g;
  
  return html.replace(codeBlockRegex, (match, lang, code) => {
    // Decode HTML entities
    const decodedCode = code
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Get the Prism grammar for this language
    const grammar = Prism.languages[lang] || Prism.languages.plain;
    
    // Highlight the code
    const highlighted = Prism.highlight(decodedCode, grammar, lang);
    
    return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>`;
  });
}
