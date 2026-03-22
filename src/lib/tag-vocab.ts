// Tag vocabulary for excerpt triage system
// Aligned with archive_topic buckets in archiver.ts

export const TIER1_DOMAIN: Record<string, string> = {
  "ai-coding": "AI 编程与工作流",
  "agents": "Agent 系统与 MCP",
  "pkm": "知识管理与学习",
  "design": "设计与前端",
  "business": "商业与产品",
  "investing": "投资与市场",
  "life": "生活与其他",
};

export const TIER2_TOOLS = [
  "claude-code",
  "openclaw",
  "obsidian",
  "cursor",
  "mcp",
] as const;

export const TIER3_TOPICS = [
  "workflow",
  "deployment",
  "automation",
  "content-creation",
  "go-global",
  "growth",
  "quant",
  "ip",
  "tutorial",
  "opinion",
  "tool",
  "research",
  "translation",
] as const;

export const ALL_TAGS = [
  ...Object.keys(TIER1_DOMAIN),
  ...TIER2_TOOLS,
  ...TIER3_TOPICS,
];

// Map tier-1 tag to archive_topic slug
export const TAG_TO_ARCHIVE_TOPIC: Record<string, string> = {
  "ai-coding": "ai-coding",
  "agents": "agents-skills-mcp",
  "pkm": "pkm-learning",
  "design": "design-frontend",
  "business": "business-product",
  "investing": "investing-market",
  "life": "life-other",
};

export function getTagGroup(
  tag: string
): "domain" | "tool" | "topic" | "custom" {
  if (tag in TIER1_DOMAIN) return "domain";
  if ((TIER2_TOOLS as readonly string[]).includes(tag)) return "tool";
  if ((TIER3_TOPICS as readonly string[]).includes(tag)) return "topic";
  return "custom";
}

export function isVocabTag(tag: string): boolean {
  return ALL_TAGS.includes(tag);
}
