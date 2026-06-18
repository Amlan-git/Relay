/**
 * Data-flow tracing — pure deterministic walk over the n8n connections object.
 *
 * n8n's connections object is keyed by SOURCE NODE NAME and lists destinations:
 *   connections[sourceName][outputType][branchIndex] = [{ node: targetName, ... }, ...]
 *
 * outputType is typically "main" (forward flow) or "error" (error-handler branch).
 * Conditional nodes (if/switch) use multiple branches under "main": main[0] is
 * branch 0, main[1] is branch 1, etc. All branches AND all output types count as
 * downstream — branch isolation falls out naturally because each target only
 * appears under the branch it's wired to.
 *
 * WorkflowRepresentation.upstreamNodeIds / downstreamNodeIds use node IDs, so
 * this function maps name → id internally and returns id-based edges.
 */

export interface TraceNode {
  id: string;
  name: string;
}

interface ConnectionTarget {
  node: string;
  type: string;
  index: number;
}

export interface NodeTrace {
  upstream: string[];
  downstream: string[];
}

export function traceConnections(
  nodes: TraceNode[],
  connections: Record<string, unknown>,
): Map<string, NodeTrace> {
  const nameToId = new Map<string, string>();
  for (const n of nodes) nameToId.set(n.name, n.id);

  const result = new Map<string, NodeTrace>();
  for (const n of nodes) result.set(n.id, { upstream: [], downstream: [] });

  const pushUnique = (arr: string[], id: string) => {
    if (!arr.includes(id)) arr.push(id);
  };

  for (const [sourceName, outputsByType] of Object.entries(connections)) {
    const sourceId = nameToId.get(sourceName);
    if (!sourceId) continue;
    if (!outputsByType || typeof outputsByType !== "object") continue;

    for (const branches of Object.values(outputsByType as Record<string, unknown>)) {
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        if (!Array.isArray(branch)) continue;
        for (const target of branch as ConnectionTarget[]) {
          if (!target || typeof target.node !== "string") continue;
          const targetId = nameToId.get(target.node);
          if (!targetId) continue;
          pushUnique(result.get(sourceId)!.downstream, targetId);
          pushUnique(result.get(targetId)!.upstream, sourceId);
        }
      }
    }
  }

  return result;
}
