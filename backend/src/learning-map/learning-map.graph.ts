import { BadRequestException } from '@nestjs/common';

export type LearningEdge = { previoId: string; destinoId: string };
export const MAX_MAP_EDGES = 5000;
export const MAX_DIRECT_BASES = 8;

// Iterative Kahn traversal: bounded work and no recursive stack overflow.
export function orderedNodes(edges: readonly LearningEdge[]): string[] {
  if (edges.length > MAX_MAP_EDGES) {
    throw new BadRequestException(
      'El mapa supera el límite de relaciones del área.',
    );
  }
  const degree = new Map<string, number>();
  const next = new Map<string, string[]>();
  const pairs = new Set<string>();
  for (const { previoId, destinoId } of edges) {
    const key = JSON.stringify([previoId, destinoId]);
    if (!previoId || !destinoId || previoId === destinoId || pairs.has(key)) {
      throw new BadRequestException('Relación repetida o consigo mismo.');
    }
    pairs.add(key);
    degree.set(previoId, degree.get(previoId) ?? 0);
    degree.set(destinoId, (degree.get(destinoId) ?? 0) + 1);
    if (degree.get(destinoId) > MAX_DIRECT_BASES) {
      throw new BadRequestException(
        'Un subtema admite hasta ocho bases directas.',
      );
    }
    const targets = next.get(previoId) ?? [];
    targets.push(destinoId);
    next.set(previoId, targets);
  }
  const queue = [...degree.keys()].filter((id) => degree.get(id) === 0).sort();
  for (let i = 0; i < queue.length; i++) {
    for (const target of (next.get(queue[i]) ?? []).sort()) {
      degree.set(target, degree.get(target) - 1);
      if (degree.get(target) === 0) queue.push(target);
    }
  }
  if (queue.length !== degree.size) {
    throw new BadRequestException('La relación crearía un ciclo en el mapa.');
  }
  return queue;
}

export function ancestorOrder(target: string, edges: readonly LearningEdge[]) {
  const order = orderedNodes(edges);
  const parents = new Map<string, string[]>();
  for (const edge of edges) {
    const values = parents.get(edge.destinoId) ?? [];
    values.push(edge.previoId);
    parents.set(edge.destinoId, values);
  }
  const ancestors = new Set<string>();
  const pending = [...(parents.get(target) ?? [])];
  while (pending.length) {
    const id = pending.pop();
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    pending.push(...(parents.get(id) ?? []));
  }
  return order.filter((id) => ancestors.has(id));
}
