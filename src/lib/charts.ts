import type { ProjectBrief } from "./types";

function sanitize(text: string): string {
  return text
    .replace(/["`]/g, "'")
    .replace(/[<>]/g, "")
    .replace(/[\n\r]/g, " ")
    .slice(0, 60);
}

export function buildOverviewFlowChart(brief: ProjectBrief): string {
  const flows = brief.overview.majorFlows.slice(0, 6);
  if (flows.length === 0) return "";

  let chart = "graph LR\n";
  chart += `  USER([fa:fa-user User]) --> APP[${sanitize(brief.repoInfo.name)}]\n`;

  flows.forEach((flow, i) => {
    const id = `F${i}`;
    chart += `  APP --> ${id}["${sanitize(flow)}"]\n`;
  });

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
