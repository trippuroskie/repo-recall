import type { ProjectBrief } from "./types";

function sanitize(text: string): string {
  return text
    .replace(/["`]/g, "'")
    .replace(/[<>]/g, "")
    .replace(/[\n\r]/g, " ")
    .replace(/[(){}[\]|;#&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function buildOverviewFlowChart(brief: ProjectBrief): string {
  const modules = brief.architecture.keyModules.slice(0, 10);
  const apis = brief.architecture.apis.slice(0, 6);
  const integrations = brief.architecture.integrations.slice(0, 6);
  const features = brief.features.slice(0, 6);
  const majorFlows = brief.overview.majorFlows || [];

  // Need enough data to build a meaningful diagram
  if (modules.length === 0 && features.length === 0) return "";

  // Classify modules into layers, keeping full module info for richer labels
  const frontend: { name: string; purpose: string }[] = [];
  const backend: { name: string; purpose: string }[] = [];
  const dataLayer: { name: string; purpose: string }[] = [];

  for (const mod of modules) {
    const n = mod.name.toLowerCase();
    const p = mod.purpose.toLowerCase();
    const path = mod.path.toLowerCase();

    if (
      n.includes("page") || n.includes("component") || n.includes("hook") ||
      n.includes("layout") || n.includes("view") ||
      p.includes("ui") || p.includes("frontend") || p.includes("render") ||
      path.includes("components") || (path.includes("app/") && path.includes("page"))
    ) {
      frontend.push(mod);
    } else if (
      n.includes("database") || n.includes("schema") || n.includes("migration") ||
      n.includes("store") || n.includes("model") ||
      p.includes("database") || p.includes("storage") || p.includes("persist")
    ) {
      dataLayer.push(mod);
    } else {
      backend.push(mod);
    }
  }

  // If no clear frontend modules, use features as the UI layer
  if (frontend.length === 0 && features.length > 0) {
    for (const feat of features.slice(0, 4)) {
      frontend.push({ name: feat.name, purpose: feat.description });
    }
  }

  // Derive contextual labels from the brief data
  const primaryFlow = majorFlows.length > 0 ? sanitize(majorFlows[0]) : null;
  const firstApi = apis.length > 0 ? sanitize(apis[0]) : null;

  // Build a sequence diagram showing the flow through the system
  let chart = "sequenceDiagram\n";

  // Define participants with purpose-aware aliases
  chart += "    participant User\n";
  if (frontend.length > 0) {
    const uiLabel = sanitize(frontend[0].name);
    chart += `    participant UI as ${uiLabel}\n`;
  }
  if (apis.length > 0) {
    chart += "    participant API as API Routes\n";
  }
  if (backend.length > 0) {
    const svc = backend[0];
    const svcAlias = svc.purpose
      ? `${sanitize(svc.name)} - ${sanitize(svc.purpose).slice(0, 30)}`
      : sanitize(svc.name);
    chart += `    participant Service as ${svcAlias}\n`;
  }
  if (dataLayer.length > 0) {
    const dbLabel = sanitize(dataLayer[0].name);
    chart += `    participant DB as ${dbLabel}\n`;
  }
  if (integrations.length > 0) {
    const extLabel = sanitize(integrations[0]);
    chart += `    participant Ext as ${extLabel}\n`;
  }

  // Use the primary flow name as the scenario title
  if (primaryFlow) {
    chart += `    Note over User: ${primaryFlow}\n`;
  }

  // Build the flow based on available layers
  const layers: string[] = [];
  if (frontend.length > 0) layers.push("UI");
  if (apis.length > 0) layers.push("API");
  if (backend.length > 0) layers.push("Service");
  if (dataLayer.length > 0) layers.push("DB");

  // Forward flow with contextual labels
  const forwardLabels: Record<string, string> = {
    "User->UI": primaryFlow ? `Initiates ${primaryFlow.slice(0, 40)}` : "User action",
    "UI->API": firstApi || "API request",
    "API->Service": backend.length > 0 ? sanitize(backend[0].name) : "Process request",
    "Service->DB": "Query / persist data",
  };

  let prev = "User";
  for (const layer of layers) {
    const label = forwardLabels[`${prev}->${layer}`] || "Request";
    chart += `    ${prev}->>${layer}: ${label}\n`;
    prev = layer;
  }

  // External service calls with opt block
  if (integrations.length > 0 && layers.length > 0) {
    const caller = layers[layers.length - 1];
    chart += `    opt External Integration\n`;
    chart += `        ${caller}->>Ext: ${sanitize(integrations[0])} call\n`;
    if (integrations.length > 1) {
      chart += `        Note over Ext: Also: ${integrations.slice(1, 4).map(sanitize).join(", ")}\n`;
    }
    chart += `        Ext-->>${caller}: Response\n`;
    chart += `    end\n`;
  }

  // Return flow with contextual labels
  const reversedLayers = [...layers].reverse();
  for (let i = 0; i < reversedLayers.length - 1; i++) {
    chart += `    ${reversedLayers[i]}-->>${reversedLayers[i + 1]}: Result\n`;
  }
  if (layers.length > 0) {
    chart += `    ${reversedLayers[reversedLayers.length - 1]}-->>User: Updated view\n`;
  }

  // Add notes for additional modules in each layer
  if (frontend.length > 1) {
    const others = frontend.slice(1, 4).map((m) => sanitize(m.name)).join(", ");
    chart += `    Note over UI: Also: ${others}\n`;
  }
  if (backend.length > 1) {
    const others = backend.slice(1, 4).map((m) => sanitize(m.name)).join(", ");
    chart += `    Note over Service: Also: ${others}\n`;
  }
  if (dataLayer.length > 1) {
    const others = dataLayer.slice(1, 3).map((m) => sanitize(m.name)).join(", ");
    chart += `    Note over DB: Also: ${others}\n`;
  }

  // Add note with additional API endpoints if available
  if (apis.length > 1) {
    const otherApis = apis.slice(1, 4).map(sanitize).join(", ");
    chart += `    Note over API: Other endpoints: ${otherApis}\n`;
  }

  return chart;
}

export function buildArchitectureChart(brief: ProjectBrief): string {
  const modules = brief.architecture.keyModules.slice(0, 8);
  if (modules.length === 0) return "";

  let chart = "graph TD\n";

  // Group by layer
  const layers: Record<string, { name: string; path: string }[]> = {
    Frontend: [],
    Backend: [],
    Data: [],
    Infra: [],
  };

  for (const mod of modules) {
    const n = mod.name.toLowerCase();
    const p = mod.purpose.toLowerCase();
    if (n.includes("page") || n.includes("component") || n.includes("hook") || p.includes("ui")) {
      layers.Frontend.push(mod);
    } else if (n.includes("api") || n.includes("service") || n.includes("middleware") || p.includes("endpoint")) {
      layers.Backend.push(mod);
    } else if (n.includes("database") || n.includes("schema") || p.includes("model") || p.includes("migration")) {
      layers.Data.push(mod);
    } else {
      layers.Infra.push(mod);
    }
  }

  // If everything ended up in one bucket, do a simple graph
  const filledLayers = Object.entries(layers).filter(([, mods]) => mods.length > 0);

  if (filledLayers.length <= 1) {
    chart += `  APP[${sanitize(brief.repoInfo.name)}]\n`;
    modules.forEach((mod, i) => {
      chart += `  APP --> M${i}["${sanitize(mod.name)}"]\n`;
    });
    return chart;
  }

  let nodeId = 0;
  const layerIds: string[] = [];

  for (const [layer, mods] of filledLayers) {
    const layerId = `L${nodeId++}`;
    layerIds.push(layerId);
    chart += `  subgraph ${layerId}["${layer}"]\n`;
    for (const mod of mods) {
      chart += `    N${nodeId}["${sanitize(mod.name)}"]\n`;
      nodeId++;
    }
    chart += `  end\n`;
  }

  // Connect layers top-down
  for (let i = 0; i < layerIds.length - 1; i++) {
    chart += `  ${layerIds[i]} --> ${layerIds[i + 1]}\n`;
  }

  return chart;
}

export function buildStackLayersChart(brief: ProjectBrief): string {
  const stack = brief.architecture.stack;
  const deps = brief.architecture.dependencies;
  if (stack.length === 0) return "";

  const frontend: string[] = [];
  const backend: string[] = [];
  const data: string[] = [];
  const infra: string[] = [];

  const frontendKw = ["react", "vue", "svelte", "angular", "next", "nuxt", "remix", "astro", "tailwind", "css", "vite"];
  const backendKw = ["express", "fastify", "hono", "node", "python", "go", "rust", "ruby", "api", "graphql"];
  const dataKw = ["prisma", "drizzle", "supabase", "firebase", "mongo", "postgres", "redis", "sql"];
  const infraKw = ["docker", "vercel", "aws", "github actions", "ci", "terraform", "k8s"];

  for (const tech of stack) {
    const t = tech.toLowerCase();
    if (t === "java" || t === "kotlin") backend.push(tech);
    else if (frontendKw.some((k) => t.includes(k))) frontend.push(tech);
    else if (dataKw.some((k) => t.includes(k))) data.push(tech);
    else if (infraKw.some((k) => t.includes(k))) infra.push(tech);
    else if (backendKw.some((k) => t.includes(k))) backend.push(tech);
    else frontend.push(tech); // default bucket
  }

  // Also pull key deps
  const notableUi = ["react-dom", "next", "@tanstack/react-query", "zustand", "jotai", "redux"];
  const notableBack = ["@trpc/server", "express", "fastify", "hono", "@nestjs/core"];
  const notableData = ["@prisma/client", "drizzle-orm", "@supabase/supabase-js", "mongoose", "ioredis"];

  for (const [pkg] of Object.entries(deps)) {
    const p = pkg.toLowerCase();
    if (notableUi.some((k) => p.includes(k)) && !frontend.some((f) => f.toLowerCase().includes(p))) {
      const name = pkg.replace(/^@/, "").split("/").pop() || pkg;
      if (!frontend.includes(name)) frontend.push(name);
    }
    if (notableBack.some((k) => p.includes(k))) {
      const name = pkg.replace(/^@/, "").split("/").pop() || pkg;
      if (!backend.some((b) => b.toLowerCase() === name.toLowerCase())) backend.push(name);
    }
    if (notableData.some((k) => p.includes(k))) {
      const name = pkg.replace(/^@/, "").split("/").pop() || pkg;
      if (!data.some((d) => d.toLowerCase() === name.toLowerCase())) data.push(name);
    }
  }

  let chart = "graph TD\n";
  const layers: [string, string[]][] = [
    ["Frontend", frontend],
    ["Backend / API", backend],
    ["Data", data],
    ["Infrastructure", infra],
  ];

  const filledLayers = layers.filter(([, items]) => items.length > 0);
  if (filledLayers.length < 2) return "";

  const layerIds: string[] = [];
  let nid = 0;

  for (const [label, items] of filledLayers) {
    const lid = `SL${nid++}`;
    layerIds.push(lid);
    chart += `  subgraph ${lid}["${label}"]\n`;
    chart += `    direction LR\n`;
    for (const item of items.slice(0, 6)) {
      chart += `    SN${nid}["${sanitize(item)}"]\n`;
      nid++;
    }
    chart += `  end\n`;
  }

  for (let i = 0; i < layerIds.length - 1; i++) {
    chart += `  ${layerIds[i]} --> ${layerIds[i + 1]}\n`;
  }

  return chart;
}

export function buildDependencyChart(brief: ProjectBrief): string {
  const integrations = brief.architecture.integrations;
  const apis = brief.architecture.apis.slice(0, 8);

  if (integrations.length === 0 && apis.length === 0) return "";

  let chart = "graph LR\n";
  chart += `  APP["${sanitize(brief.repoInfo.name)}"]\n`;

  if (apis.length > 0) {
    chart += `  subgraph APIS["API Layer"]\n`;
    chart += `    direction TB\n`;
    apis.slice(0, 6).forEach((api, i) => {
      const short = api.split("/").slice(-2).join("/");
      chart += `    A${i}["${sanitize(short)}"]\n`;
    });
    chart += `  end\n`;
    chart += `  APP --> APIS\n`;
  }

  if (integrations.length > 0) {
    chart += `  subgraph EXT["External Services"]\n`;
    chart += `    direction TB\n`;
    integrations.slice(0, 6).forEach((int, i) => {
      chart += `    E${i}["${sanitize(int)}"]\n`;
    });
    chart += `  end\n`;
    chart += `  APP --> EXT\n`;
  }

  return chart;
}

export function buildFeatureTreeChart(brief: ProjectBrief): string {
  const features = brief.features.slice(0, 10);
  if (features.length === 0) return "";

  let chart = "graph LR\n";
  chart += `  ROOT["${sanitize(brief.repoInfo.name)}"]\n`;

  const categories = new Map<string, string[]>();
  for (const f of features) {
    const cat = f.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(f.name);
  }

  let catId = 0;
  for (const [cat, names] of categories) {
    const cId = `C${catId++}`;
    chart += `  ROOT --> ${cId}["${cat}"]\n`;
    names.slice(0, 4).forEach((name, i) => {
      chart += `  ${cId} --> ${cId}F${i}["${sanitize(name)}"]\n`;
    });
  }

  return chart;
}

export function buildBusinessPieChart(brief: ProjectBrief): string {
  const counts: Record<string, number> = {};
  for (const f of brief.features) {
    counts[f.category] = (counts[f.category] || 0) + 1;
  }

  if (Object.keys(counts).length === 0) return "";

  let chart = 'pie title Feature Distribution by Business Purpose\n';
  for (const [cat, count] of Object.entries(counts)) {
    chart += `  "${cat}" : ${count}\n`;
  }

  return chart;
}

export function buildTimelineChart(brief: ProjectBrief): string {
  const milestones = brief.timeline.slice(0, 10);
  if (milestones.length === 0) return "";

  let chart = "gantt\n";
  chart += "  title Project Evolution\n";
  chart += "  dateFormat YYYY-MM\n";
  chart += "  axisFormat %b %Y\n";

  for (const ms of milestones) {
    const title = sanitize(ms.title).replace(/:/g, " -");
    chart += `  ${title} : ${ms.date}, 30d\n`;
  }

  return chart;
}

export function buildEntrypointsChart(brief: ProjectBrief): string {
  const entries = brief.entrypoints.slice(0, 8);
  if (entries.length === 0) return "";

  let chart = "graph TD\n";
  chart += `  START((Start Here))\n`;

  const high = entries.filter((e) => e.priority === "high");
  const medium = entries.filter((e) => e.priority === "medium");
  const low = entries.filter((e) => e.priority === "low");

  let id = 0;
  for (const e of high) {
    const nId = `H${id++}`;
    chart += `  START --> ${nId}["${sanitize(e.path)}"]\n`;
  }

  for (const e of medium) {
    const nId = `M${id++}`;
    if (high.length > 0) {
      chart += `  H0 --> ${nId}["${sanitize(e.path)}"]\n`;
    } else {
      chart += `  START --> ${nId}["${sanitize(e.path)}"]\n`;
    }
  }

  for (const e of low) {
    const nId = `L${id++}`;
    if (medium.length > 0) {
      chart += `  M${high.length} --> ${nId}["${sanitize(e.path)}"]\n`;
    } else {
      chart += `  START --> ${nId}["${sanitize(e.path)}"]\n`;
    }
  }

  return chart;
}

export function buildFallbackExplanation(
  brief: ProjectBrief
): ProjectBrief["overviewExplanation"] | null {
  const modules = brief.architecture.keyModules;
  const apis = brief.architecture.apis;
  const integrations = brief.architecture.integrations;
  const features = brief.features;

  if (modules.length === 0 && features.length === 0) return null;

  const steps: NonNullable<ProjectBrief["overviewExplanation"]>["steps"] = [];

  // Classify modules for step generation
  const frontend = modules.filter((m) => {
    const n = m.name.toLowerCase();
    const p = m.purpose.toLowerCase();
    return (
      n.includes("page") || n.includes("component") || n.includes("hook") ||
      n.includes("layout") || n.includes("view") ||
      p.includes("ui") || p.includes("frontend") || p.includes("render")
    );
  });

  const backend = modules.filter((m) => {
    const n = m.name.toLowerCase();
    const p = m.purpose.toLowerCase();
    return !(
      n.includes("page") || n.includes("component") || n.includes("hook") ||
      n.includes("layout") || n.includes("view") ||
      p.includes("ui") || p.includes("frontend") || p.includes("render") ||
      n.includes("database") || n.includes("schema") || n.includes("migration") ||
      n.includes("store") || n.includes("model") ||
      p.includes("database") || p.includes("storage") || p.includes("persist")
    );
  });

  const data = modules.filter((m) => {
    const n = m.name.toLowerCase();
    const p = m.purpose.toLowerCase();
    return (
      n.includes("database") || n.includes("schema") || n.includes("migration") ||
      n.includes("store") || n.includes("model") ||
      p.includes("database") || p.includes("storage") || p.includes("persist")
    );
  });

  // Step 1: Frontend / Entry
  if (frontend.length > 0) {
    steps.push({
      title: "User Interface Layer",
      description: `Users interact with the application through ${frontend.length} frontend module${frontend.length > 1 ? "s" : ""}. ${frontend[0].name} ${frontend[0].purpose ? `handles ${frontend[0].purpose.toLowerCase()}` : "serves as a primary entry point"}.${frontend.length > 1 ? ` Other UI modules include ${frontend.slice(1, 3).map((m) => m.name).join(", ")}.` : ""}`,
      codeRefs: frontend.slice(0, 3).map((m) => ({
        filePath: m.path,
        label: m.name,
      })),
    });
  } else if (features.length > 0) {
    steps.push({
      title: "User-Facing Features",
      description: `The application exposes ${features.length} key feature${features.length > 1 ? "s" : ""}. ${features[0].name}: ${features[0].description}`,
      codeRefs: features
        .slice(0, 3)
        .filter((f) => f.files[0])
        .map((f) => ({ filePath: f.files[0], label: f.name })),
    });
  }

  // Step 2: API Layer
  if (apis.length > 0) {
    steps.push({
      title: "API Layer",
      description: `The application exposes ${apis.length} API endpoint${apis.length > 1 ? "s" : ""} that handle incoming requests. Key routes include ${apis.slice(0, 3).join(", ")}. These endpoints receive requests from the frontend, validate input, and route to the appropriate service logic.`,
      codeRefs: apis.slice(0, 3).map((api) => {
        const filePath = api.includes(".")
          ? api
          : `src/app/${api.replace(/^\//, "")}/route.ts`;
        return { filePath, label: api.split("/").slice(-2).join("/") };
      }),
    });
  }

  // Step 3: Core Logic
  if (backend.length > 0) {
    steps.push({
      title: "Core Logic & Services",
      description: `The backend processing is handled by ${backend.length} core module${backend.length > 1 ? "s" : ""}. ${backend[0].name} ${backend[0].purpose ? backend[0].purpose.toLowerCase() : "contains the primary business logic"}.${backend.length > 1 ? ` Supporting modules include ${backend.slice(1, 3).map((m) => m.name).join(" and ")}.` : ""}`,
      codeRefs: backend.slice(0, 3).map((m) => ({
        filePath: m.path,
        label: m.name,
      })),
    });
  }

  // Step 4: Data Layer
  if (data.length > 0) {
    steps.push({
      title: "Data & Persistence",
      description: `Data is managed through ${data.length} module${data.length > 1 ? "s" : ""}. ${data[0].name} ${data[0].purpose ? data[0].purpose.toLowerCase() : "handles data persistence and retrieval"}.${data.length > 1 ? ` Also includes ${data.slice(1, 3).map((m) => m.name).join(", ")}.` : ""}`,
      codeRefs: data.slice(0, 3).map((m) => ({
        filePath: m.path,
        label: m.name,
      })),
    });
  }

  // Step 5: External Services
  if (integrations.length > 0) {
    steps.push({
      title: "External Services & Integrations",
      description: `The application integrates with ${integrations.length} external service${integrations.length > 1 ? "s" : ""}: ${integrations.slice(0, 4).join(", ")}. These integrations extend the application's capabilities beyond its own codebase.`,
      codeRefs: [],
    });
  }

  if (steps.length === 0) return null;

  const stackStr = brief.architecture.stack.slice(0, 3).join(", ");
  return {
    introduction: `${brief.repoInfo.name} is a ${stackStr || brief.repoInfo.language || "software"} application with ${modules.length} key modules. Here's how the system works from user interaction through to data persistence.`,
    steps,
  };
}
