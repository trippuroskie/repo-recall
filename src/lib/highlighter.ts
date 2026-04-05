import { createHighlighter, type Highlighter, type BundledLanguage } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

const SUPPORTED_LANGS = [
  "typescript", "tsx", "javascript", "jsx", "json", "css", "html",
  "python", "rust", "go", "yaml", "toml", "sql", "bash", "markdown",
  "dockerfile", "graphql", "xml", "c", "cpp", "java", "ruby", "php",
  "swift", "kotlin", "scala", "shell",
] as const;

// Map common aliases / file extensions to shiki language ids
const LANG_ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rs: "rust",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  docker: "dockerfile",
  gql: "graphql",
  rb: "ruby",
};

export function resolveLanguage(lang: string): BundledLanguage | "text" {
  const lower = lang.toLowerCase();
  if (LANG_ALIASES[lower]) return LANG_ALIASES[lower] as BundledLanguage;
  if ((SUPPORTED_LANGS as readonly string[]).includes(lower)) return lower as BundledLanguage;
  return "text";
}

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: [...SUPPORTED_LANGS],
    });
  }
  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  lang: string
): Promise<string> {
  const highlighter = await getHighlighter();
  const resolved = resolveLanguage(lang);
  try {
    return highlighter.codeToHtml(code, {
      lang: resolved,
      theme: "github-light",
    });
  } catch {
    // Fallback for unsupported languages
    return highlighter.codeToHtml(code, {
      lang: "text",
      theme: "github-light",
    });
  }
}

// Returns tokens per line for custom rendering (used by CodeViewer)
export async function highlightLines(
  code: string,
  lang: string
): Promise<{ tokens: Array<Array<{ content: string; color?: string }>> }> {
  const highlighter = await getHighlighter();
  const resolved = resolveLanguage(lang);
  try {
    const result = highlighter.codeToTokens(code, {
      lang: resolved,
      theme: "github-light",
    });
    return {
      tokens: result.tokens.map((line) =>
        line.map((token) => ({
          content: token.content,
          color: token.color,
        }))
      ),
    };
  } catch {
    const result = highlighter.codeToTokens(code, {
      lang: "text",
      theme: "github-light",
    });
    return {
      tokens: result.tokens.map((line) =>
        line.map((token) => ({
          content: token.content,
          color: token.color,
        }))
      ),
    };
  }
}
