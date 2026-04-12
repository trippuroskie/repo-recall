export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export const EXAMPLE_REPOS = [
  { name: "openai/codex", description: "AI coding agent", tags: ["TypeScript", "Python", "AI"] },
  { name: "block/goose", description: "AI agent framework", tags: ["Rust", "TypeScript", "Python"] },
  { name: "All-Hands-AI/OpenHands", description: "AI software dev platform", tags: ["Python", "TypeScript", "Docker"] },
  { name: "supabase/supabase", description: "Open source Firebase alternative", tags: ["TypeScript", "Go", "Elixir"] },
  { name: "calcom/cal.com", description: "Scheduling infrastructure", tags: ["TypeScript", "Next.js", "Prisma"] },
  { name: "maybe-finance/maybe", description: "Personal finance OS", tags: ["Ruby", "TypeScript", "React"] },
];

export function publicBriefId(repoFullName: string): string {
  return `public-${repoFullName.replace("/", "-")}`;
}
