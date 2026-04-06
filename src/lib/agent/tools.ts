// Agent tool definitions for LLM-driven codebase exploration

export interface ReadFileTool {
  name: "readFile";
  params: { path: string };
}

export interface SearchCodeTool {
  name: "searchCode";
  params: { query: string; glob?: string };
}

export interface ListDirectoryTool {
  name: "listDirectory";
  params: { path: string };
}

export interface ReadFileLinesTool {
  name: "readFileLines";
  params: { path: string; startLine: number; endLine: number };
}

export type AgentToolCall =
  | ReadFileTool
  | SearchCodeTool
  | ListDirectoryTool
  | ReadFileLinesTool;

export type AgentToolName = AgentToolCall["name"];

export interface ToolResult {
  tool: AgentToolName;
  params: Record<string, unknown>;
  result: string;
  truncated?: boolean;
  error?: string;
}

// OpenRouter/OpenAI-compatible tool schemas for the LLM
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "readFile",
      description:
        "Read the full contents of a file. Use for config files, entry points, and key modules. Skip files >100KB, binaries, lock files, and node_modules.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to repo root (e.g. src/index.ts)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchCode",
      description:
        "Search for code patterns across the repository using GitHub Code Search. Use to find usages, definitions, imports, and patterns. Returns up to 10 matching file snippets.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query (e.g. 'createClient', 'export default function', 'import { Router }')",
          },
          glob: {
            type: "string",
            description:
              "Optional file glob filter (e.g. '*.ts', 'src/**/*.tsx')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listDirectory",
      description:
        "List files and subdirectories in a specific directory. Use to understand project structure and find relevant files to read.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Directory path relative to repo root (e.g. 'src/lib', 'src/app/api'). Use '' for root.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "readFileLines",
      description:
        "Read a specific line range from a file. Use when you only need a specific function, class, or section. More efficient than readFile for large files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to repo root",
          },
          startLine: {
            type: "number",
            description: "First line to read (1-indexed)",
          },
          endLine: {
            type: "number",
            description: "Last line to read (1-indexed)",
          },
        },
        required: ["path", "startLine", "endLine"],
      },
    },
  },
] as const;
