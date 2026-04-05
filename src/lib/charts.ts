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
