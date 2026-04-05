export interface TagCount {
  tag: string;
  count: number;
}

export interface TagFilterOption {
  value: string;
  label: string;
  count?: number;
}

const SOURCE_TYPE_ALIASES: Record<string, string[]> = {
  article: ["article", "web"],
  report: ["report", "report/paper"],
};

export function expandSourceTypeFilter(sourceType: string): string[] {
  return SOURCE_TYPE_ALIASES[sourceType] ?? [sourceType];
}

export function buildTagFilterOptions(vocabTags: string[], dbTags: TagCount[]): TagFilterOption[] {
  const seen = new Set<string>();
  const options: TagFilterOption[] = [];

  for (const { tag, count } of dbTags) {
    if (seen.has(tag)) continue;
    options.push({ value: tag, label: tag, count });
    seen.add(tag);
  }

  for (const tag of vocabTags) {
    if (seen.has(tag)) continue;
    options.push({ value: tag, label: tag });
    seen.add(tag);
  }

  return options;
}

export function shouldSkipInboxLoad({ loading, reset }: { loading: boolean; reset: boolean }): boolean {
  return loading && !reset;
}

export function isStaleInboxResponse({
  requestId,
  latestRequestId,
}: {
  requestId: number;
  latestRequestId: number;
}): boolean {
  return requestId !== latestRequestId;
}
