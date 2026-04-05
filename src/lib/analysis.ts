import type {
  RepoInfo,
  FileNode,
  PRSummary,
  CommitSummary,
  ProjectBrief,
  FeatureMapping,
  Milestone,
  Entrypoint,
} from "./types";

// Infer the tech stack from file extensions, config files, and dependencies
function inferStack(files: FileNode[], deps: Record<string, string> = {}): string[] {
  const stack: Set<string> = new Set();
  const fileNames = new Set(files.map((f) => f.name));
  const filePaths = new Set(files.map((f) => f.path.toLowerCase()));
  const extensions = new Set(
    files
      .filter((f) => f.type === "file")
      .map((f) => f.name.split(".").pop()?.toLowerCase())
      .filter(Boolean)
  );

  const hasDep = (...names: string[]) => names.some((n) => n in deps);

  // Frameworks (file-based detection)
  if (fileNames.has("next.config.js") || fileNames.has("next.config.ts") || fileNames.has("next.config.mjs") || hasDep("next"))
    stack.add("Next.js");
  if (fileNames.has("nuxt.config.ts") || fileNames.has("nuxt.config.js") || hasDep("nuxt"))
    stack.add("Nuxt");
  if (fileNames.has("svelte.config.js") || hasDep("svelte", "@sveltejs/kit"))
    stack.add("SvelteKit");
  if (fileNames.has("astro.config.mjs") || hasDep("astro")) stack.add("Astro");
  if (fileNames.has("remix.config.js") || hasDep("@remix-run/react"))
    stack.add("Remix");
  if (fileNames.has("vite.config.ts") || fileNames.has("vite.config.js") || hasDep("vite"))
    stack.add("Vite");

  // Dependency-based framework detection
  if (hasDep("express")) stack.add("Express");
  if (hasDep("fastify")) stack.add("Fastify");
  if (hasDep("hono")) stack.add("Hono");
  if (hasDep("koa")) stack.add("Koa");
  if (hasDep("@nestjs/core")) stack.add("NestJS");
  if (hasDep("gatsby")) stack.add("Gatsby");
  if (hasDep("@angular/core")) stack.add("Angular");
  if (hasDep("vue", "vue-router")) stack.add("Vue");
  if (hasDep("electron")) stack.add("Electron");
  if (hasDep("react-native")) stack.add("React Native");
  if (hasDep("expo")) stack.add("Expo");

  // Languages
  if (extensions.has("ts") || extensions.has("tsx")) stack.add("TypeScript");
  else if (extensions.has("js") || extensions.has("jsx")) stack.add("JavaScript");
  if (extensions.has("py")) stack.add("Python");
  if (extensions.has("go")) stack.add("Go");
  if (extensions.has("rs")) stack.add("Rust");
  if (extensions.has("rb")) stack.add("Ruby");
  if (extensions.has("java") || extensions.has("kt")) stack.add("Java");
  if (extensions.has("swift")) stack.add("Swift");
  if (extensions.has("cs")) stack.add("C#");
  if (extensions.has("php")) stack.add("PHP");
  if (extensions.has("ex") || extensions.has("exs")) stack.add("Elixir");

  // Python frameworks
  if (filePaths.has("manage.py") || files.some((f) => f.path.includes("django")))
    stack.add("Django");
  if (hasDep("flask") || files.some((f) => f.name === "flask" || f.path.includes("flask/")))
    stack.add("Flask");
  if (fileNames.has("requirements.txt") || fileNames.has("pyproject.toml") || fileNames.has("setup.py"))
    stack.add("Python");

  // Ruby frameworks
  if (fileNames.has("Gemfile")) stack.add("Ruby");
  if (files.some((f) => f.path.includes("config/routes.rb")))
    stack.add("Rails");

  // Frontend
  if (hasDep("react", "react-dom") || files.some((f) => f.path.includes("react")))
    stack.add("React");
  if (fileNames.has("tailwind.config.ts") || fileNames.has("tailwind.config.js") || hasDep("tailwindcss"))
    stack.add("Tailwind CSS");
  if (hasDep("@mui/material", "@material-ui/core")) stack.add("Material UI");
  if (hasDep("@chakra-ui/react")) stack.add("Chakra UI");
  if (hasDep("shadcn-ui") || files.some((f) => f.path.includes("components/ui/")))
    stack.add("shadcn/ui");

  // Backend / DB
  if (fileNames.has("prisma") || files.some((f) => f.path.includes("prisma/")))
    stack.add("Prisma");
  if (fileNames.has("drizzle.config.ts") || hasDep("drizzle-orm")) stack.add("Drizzle");
  if (files.some((f) => f.path.includes("supabase/")) || hasDep("@supabase/supabase-js"))
    stack.add("Supabase");
  if (fileNames.has("firebase.json") || files.some((f) => f.path.includes("firebase")) || hasDep("firebase", "firebase-admin"))
    stack.add("Firebase");
  if (hasDep("mongoose", "mongodb")) stack.add("MongoDB");
  if (hasDep("pg", "postgres", "@neondatabase/serverless")) stack.add("PostgreSQL");
  if (hasDep("redis", "ioredis")) stack.add("Redis");
  if (hasDep("typeorm")) stack.add("TypeORM");
  if (hasDep("sequelize")) stack.add("Sequelize");

  // Testing
  if (hasDep("jest", "@jest/core")) stack.add("Jest");
  if (hasDep("vitest")) stack.add("Vitest");
  if (hasDep("@playwright/test", "playwright")) stack.add("Playwright");
  if (hasDep("cypress")) stack.add("Cypress");

  // Infra
  if (fileNames.has("Dockerfile") || fileNames.has("docker-compose.yml") || fileNames.has("docker-compose.yaml"))
    stack.add("Docker");
  if (fileNames.has("vercel.json") || fileNames.has(".vercel")) stack.add("Vercel");
  if (files.some((f) => f.path.includes(".github/workflows/")))
    stack.add("GitHub Actions");
  if (fileNames.has("Makefile")) stack.add("Make");
  if (fileNames.has("terraform.tf") || files.some((f) => f.path.includes(".tf")))
    stack.add("Terraform");
  if (fileNames.has("Cargo.toml")) stack.add("Rust");
  if (fileNames.has("go.mod")) stack.add("Go");

  return Array.from(stack);
}

// Parse dependencies from package.json content
function parseDependencies(
  packageJsonContent: string | null
): Record<string, string> {
  if (!packageJsonContent) return {};
  try {
    const pkg = JSON.parse(packageJsonContent);
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

// Identify key modules from file tree
function identifyKeyModules(
  files: FileNode[]
): { name: string; path: string; purpose: string }[] {
  const modules: { name: string; path: string; purpose: string }[] = [];
  const patterns: [RegExp, string, string][] = [
    [/^src\/app\/api\//, "API Routes", "Backend API endpoints"],
    [/^src\/app\//, "App Pages", "Application pages and routing"],
    [/^src\/components\//, "Components", "Reusable UI components"],
    [/^src\/lib\//, "Library", "Shared utilities and business logic"],
    [/^src\/hooks\//, "Hooks", "Custom React hooks"],
    [/^src\/store\//, "State Management", "Application state"],
    [/^src\/services\//, "Services", "External service integrations"],
    [/^prisma\//, "Database Schema", "Database models and migrations"],
    [/^src\/middleware/, "Middleware", "Request/response middleware"],
    [/^src\/utils\//, "Utilities", "Helper functions"],
  ];

  const seen = new Set<string>();
  for (const file of files) {
    for (const [pattern, name, purpose] of patterns) {
      if (pattern.test(file.path) && !seen.has(name)) {
        seen.add(name);
        const dir = file.path.split("/").slice(0, pattern.source.split("/").length - 1).join("/");
        modules.push({ name, path: dir || file.path, purpose });
      }
    }
  }

  return modules;
}

// Detect API routes and integrations
function detectAPIs(files: FileNode[]): string[] {
  return files
    .filter(
      (f) =>
        f.type === "file" &&
        f.path.includes("/api/") &&
        (f.name === "route.ts" || f.name === "route.js")
    )
    .map((f) => {
      const route = f.path
        .replace(/^src\/app/, "")
        .replace(/\/route\.(ts|js)$/, "");
      return `${route}`;
    });
}

// Group PRs into milestones
function groupPRsIntoMilestones(prs: PRSummary[]): Milestone[] {
  if (prs.length === 0) return [];

  const mergedPRs = prs
    .filter((pr) => pr.mergedAt)
    .sort(
      (a, b) =>
        new Date(a.mergedAt!).getTime() - new Date(b.mergedAt!).getTime()
    );

  if (mergedPRs.length === 0) return [];

  // Group by month
  const groups = new Map<string, PRSummary[]>();
  for (const pr of mergedPRs) {
    const date = new Date(pr.mergedAt!);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(pr);
  }

  return Array.from(groups.entries()).map(([month, groupPRs]) => {
    const themes = inferThemes(groupPRs);
    return {
      date: month,
      title: themes[0] || `Updates for ${month}`,
      description: `${groupPRs.length} PR(s) merged: ${groupPRs.map((p) => p.title).join(", ")}`,
      prs: groupPRs.map((p) => p.number),
      theme: themes[0] || "general",
      isInferred: true,
    };
  });
}

// Group commits into milestones when no PRs available
function groupCommitsIntoMilestones(commits: CommitSummary[]): Milestone[] {
  if (commits.length === 0) return [];

  const sorted = [...commits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const groups = new Map<string, CommitSummary[]>();
  for (const commit of sorted) {
    const date = new Date(commit.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(commit);
  }

  return Array.from(groups.entries()).map(([month, groupCommits]) => {
    const mainMessages = groupCommits
      .slice(0, 5)
      .map((c) => c.message.split("\n")[0]);
    return {
      date: month,
      title: `Updates for ${month}`,
      description: `${groupCommits.length} commit(s): ${mainMessages.join("; ")}`,
      prs: [],
      theme: "general",
      isInferred: true,
    };
  });
}

function inferThemes(prs: PRSummary[]): string[] {
  const keywords: Record<string, string[]> = {
    "Feature Development": ["feat", "feature", "add", "new", "implement"],
    "Bug Fixes": ["fix", "bug", "patch", "hotfix", "resolve"],
    "UI/UX Improvements": ["ui", "ux", "design", "style", "layout", "responsive"],
    "Performance": ["perf", "optimize", "speed", "cache", "fast"],
    "Infrastructure": ["ci", "cd", "deploy", "docker", "config", "infra"],
    "Documentation": ["doc", "readme", "docs"],
    "Refactoring": ["refactor", "clean", "restructure", "reorganize"],
    "Testing": ["test", "spec", "coverage"],
    "Security": ["security", "auth", "permission", "csrf", "xss"],
    "API Development": ["api", "endpoint", "route", "graphql", "rest"],
  };

  const scores = new Map<string, number>();
  for (const pr of prs) {
    const text = `${pr.title} ${pr.body || ""}`.toLowerCase();
    for (const [theme, words] of Object.entries(keywords)) {
      for (const word of words) {
        if (text.includes(word)) {
          scores.set(theme, (scores.get(theme) || 0) + 1);
        }
      }
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme]) => theme);
}

// Infer features from file structure
function inferFeatures(
  files: FileNode[],
  _prs: PRSummary[]
): FeatureMapping[] {
  const features: FeatureMapping[] = [];
  const categories: Record<string, FeatureMapping["category"]> = {
    auth: "activation",
    login: "activation",
    signup: "acquisition",
    register: "acquisition",
    onboarding: "activation",
    payment: "revenue",
    billing: "revenue",
    stripe: "revenue",
    subscription: "revenue",
    pricing: "revenue",
    dashboard: "retention",
    settings: "retention",
    profile: "retention",
    admin: "admin",
    analytics: "admin",
    notification: "retention",
    email: "acquisition",
    api: "infrastructure",
    webhook: "infrastructure",
    cron: "infrastructure",
    migration: "infrastructure",
  };

  // Group files by top-level feature directories
  const featureDirs = new Map<string, FileNode[]>();
  for (const file of files) {
    if (file.type !== "file") continue;
    const parts = file.path.split("/");
    // Look for feature-like directories (e.g., src/app/dashboard, src/features/auth)
    if (parts.length >= 3) {
      const featureDir = parts.length >= 4 && (parts[0] === "src" || parts[0] === "app")
        ? parts.slice(0, 3).join("/")
        : parts.slice(0, 2).join("/");
      if (!featureDirs.has(featureDir)) featureDirs.set(featureDir, []);
      featureDirs.get(featureDir)!.push(file);
    }
  }

  for (const [dir, dirFiles] of featureDirs) {
    const dirLower = dir.toLowerCase();
    let category: FeatureMapping["category"] = "infrastructure";
    let businessPurpose = "Supporting infrastructure";

    for (const [keyword, cat] of Object.entries(categories)) {
      if (dirLower.includes(keyword)) {
        category = cat;
        const purposes: Record<string, string> = {
          acquisition: "Drives user acquisition and sign-ups",
          activation: "Activates users and enables core experience",
          retention: "Keeps users engaged and returning",
          revenue: "Supports monetization and billing",
          admin: "Provides administrative controls and visibility",
          infrastructure: "Powers core technical infrastructure",
        };
        businessPurpose = purposes[category];
        break;
      }
    }

    const name = dir.split("/").pop() || dir;
    features.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      description: `Feature area at ${dir}`,
      files: dirFiles.slice(0, 10).map((f) => f.path),
      businessPurpose,
      category,
    });
  }

  return features.slice(0, 20);
}

// Recommend entry points
function recommendEntrypoints(
  files: FileNode[],
  _features: FeatureMapping[]
): Entrypoint[] {
  const entrypoints: Entrypoint[] = [];
  const priorities: { pattern: RegExp; reason: string; priority: Entrypoint["priority"]; type: Entrypoint["type"] }[] = [
    { pattern: /README\.md$/i, reason: "Project documentation — start here for context", priority: "high", type: "file" },
    { pattern: /^src\/app\/page\.(tsx|ts|js|jsx)$/, reason: "Main application entry page", priority: "high", type: "file" },
    { pattern: /^src\/app\/layout\.(tsx|ts|js|jsx)$/, reason: "Root layout — defines app shell and providers", priority: "high", type: "file" },
    { pattern: /package\.json$/, reason: "Dependencies and scripts — understand the toolchain", priority: "high", type: "file" },
    { pattern: /^src\/app\/api\//, reason: "API endpoint — understand backend capabilities", priority: "medium", type: "service" },
    { pattern: /schema\.prisma$/, reason: "Database schema — understand data model", priority: "high", type: "file" },
    { pattern: /^src\/lib\//, reason: "Shared library code — core business logic", priority: "medium", type: "file" },
    { pattern: /^src\/components\//, reason: "Component library — understand UI building blocks", priority: "low", type: "file" },
    { pattern: /\.env\.example$/, reason: "Environment config — understand external dependencies", priority: "medium", type: "file" },
    { pattern: /middleware\.(ts|js)$/, reason: "Middleware — understand request processing", priority: "medium", type: "flow" },
  ];

  for (const { pattern, reason, priority, type } of priorities) {
    const match = files.find((f) => pattern.test(f.path));
    if (match) {
      entrypoints.push({ path: match.path, reason, priority, type });
    }
  }

  return entrypoints.slice(0, 8);
}

// Generate the full project brief from collected data
export function generateBrief(
  repoInfo: RepoInfo,
  files: FileNode[],
  prs: PRSummary[],
  commits: CommitSummary[],
  packageJson: string | null,
  readmeContent: string | null
): ProjectBrief {
  const dependencies = parseDependencies(packageJson);
  const stack = inferStack(files, dependencies);
  const keyModules = identifyKeyModules(files);
  const apis = detectAPIs(files);
  const features = inferFeatures(files, prs);
  const timeline =
    prs.length > 0
      ? groupPRsIntoMilestones(prs)
      : groupCommitsIntoMilestones(commits);
  const entrypoints = recommendEntrypoints(files, features);

  const readmeSummary = readmeContent
    ? readmeContent.slice(0, 500).replace(/[#*_`]/g, "").trim()
    : null;

  return {
    id: `${repoInfo.owner}-${repoInfo.name}-${Date.now()}`,
    repoInfo,
    generatedAt: new Date().toISOString(),

    overview: {
      summary:
        readmeSummary ||
        repoInfo.description ||
        `A ${repoInfo.language || "software"} project with ${files.length} files.`,
      likelyUser: inferLikelyUser(features, repoInfo),
      valueProposition: inferValueProp(repoInfo, features, readmeContent),
      majorFlows: inferMajorFlows(files, apis),
      stats: {
        totalFiles: files.filter((f) => f.type === "file").length,
        totalPRs: prs.length,
        totalCommits: commits.length,
        topLanguages: inferTopLanguages(files),
      },
    },

    architecture: {
      stack,
      dependencies,
      apis,
      integrations: inferIntegrations(dependencies),
      summary: `${stack.slice(0, 4).join(", ")} application with ${files.filter((f) => f.type === "file").length} files across ${keyModules.length} key modules.`,
      keyModules,
    },

    features,

    businessContext: {
      targetUser: inferLikelyUser(features, repoInfo),
      businessModel: inferBusinessModel(features, dependencies),
      valueProposition: inferValueProp(repoInfo, features, readmeContent),
      featureClassification: features,
      isInferred: true,
    },

    timeline,
    entrypoints,
  };
}

function inferTopLanguages(files: FileNode[]): string[] {
  const extMap: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    py: "Python", go: "Go", rs: "Rust", rb: "Ruby", java: "Java", kt: "Kotlin",
    swift: "Swift", cs: "C#", php: "PHP", ex: "Elixir", exs: "Elixir",
    css: "CSS", scss: "SCSS", html: "HTML", vue: "Vue", svelte: "Svelte",
  };
  const counts = new Map<string, number>();
  for (const f of files) {
    if (f.type !== "file") continue;
    const ext = f.name.split(".").pop()?.toLowerCase();
    const lang = ext ? extMap[ext] : undefined;
    if (lang) counts.set(lang, (counts.get(lang) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang);
}

function inferLikelyUser(
  features: FeatureMapping[],
  repo: RepoInfo
): string {
  const hasAuth = features.some((f) =>
    f.name.toLowerCase().includes("auth") || f.name.toLowerCase().includes("login")
  );
  const hasPayment = features.some((f) =>
    f.name.toLowerCase().includes("payment") || f.name.toLowerCase().includes("billing")
  );
  const hasDashboard = features.some((f) =>
    f.name.toLowerCase().includes("dashboard")
  );

  if (hasPayment && hasAuth) return "End users with accounts and paid subscriptions";
  if (hasAuth && hasDashboard) return "Authenticated users managing data via dashboard";
  if (hasAuth) return "Users requiring authenticated access";
  if (repo.description?.toLowerCase().includes("cli")) return "Developers using CLI tools";
  if (repo.description?.toLowerCase().includes("api")) return "Developers integrating via API";
  return "General users of the application";
}

function inferValueProp(
  repo: RepoInfo,
  features: FeatureMapping[],
  readme: string | null
): string {
  if (readme) {
    const firstLine = readme
      .split("\n")
      .find((l) => l.trim() && !l.startsWith("#"));
    if (firstLine) return firstLine.replace(/[*_`]/g, "").trim().slice(0, 200);
  }
  if (repo.description) return repo.description;
  return `A ${features.length}-feature ${repo.language || ""} application`.trim();
}

function inferBusinessModel(
  features: FeatureMapping[],
  deps: Record<string, string>
): string {
  const hasStripe = "stripe" in deps || "@stripe/stripe-js" in deps;
  const hasPayment = features.some((f) => f.category === "revenue");
  if (hasStripe || hasPayment) return "SaaS with payment integration (likely subscription or usage-based)";
  if (features.some((f) => f.name.toLowerCase().includes("api")))
    return "API-driven product (possibly freemium or API-key based)";
  return "Early-stage or internal tool (no clear monetization detected)";
}

function inferIntegrations(deps: Record<string, string>): string[] {
  const integrations: string[] = [];
  const known: Record<string, string> = {
    stripe: "Stripe Payments",
    "@stripe/stripe-js": "Stripe Payments",
    "@sendgrid/mail": "SendGrid Email",
    resend: "Resend Email",
    "@supabase/supabase-js": "Supabase",
    "firebase-admin": "Firebase",
    "@prisma/client": "Prisma ORM",
    "@aws-sdk/client-s3": "AWS S3",
    openai: "OpenAI",
    "@anthropic-ai/sdk": "Anthropic Claude",
    "@octokit/rest": "GitHub API",
    "@sentry/nextjs": "Sentry Error Tracking",
    posthog: "PostHog Analytics",
    "posthog-js": "PostHog Analytics",
    "@vercel/analytics": "Vercel Analytics",
  };

  for (const [pkg, name] of Object.entries(known)) {
    if (pkg in deps) integrations.push(name);
  }
  return integrations;
}

function inferMajorFlows(files: FileNode[], apis: string[]): string[] {
  const flows: string[] = [];
  const fileSet = new Set(files.map((f) => f.path.toLowerCase()));

  if (
    fileSet.has("src/app/login/page.tsx") ||
    fileSet.has("src/app/(auth)/login/page.tsx") ||
    files.some((f) => f.path.toLowerCase().includes("auth"))
  ) {
    flows.push("User authentication and session management");
  }

  if (files.some((f) => f.path.toLowerCase().includes("dashboard"))) {
    flows.push("Dashboard with data display and management");
  }

  if (apis.length > 0) {
    flows.push(`API layer with ${apis.length} endpoint(s)`);
  }

  if (files.some((f) => f.path.toLowerCase().includes("payment") || f.path.toLowerCase().includes("billing"))) {
    flows.push("Payment and billing flow");
  }

  if (files.some((f) => f.path.toLowerCase().includes("onboarding"))) {
    flows.push("User onboarding experience");
  }

  if (flows.length === 0) {
    flows.push("Core application flow");
  }

  return flows;
}
