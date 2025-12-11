/**
 * Utility functions for managing the challenge tree structure
 * Extracted from ProjectJourneyBoard.tsx for better maintainability
 */

import type { ProjectChallengeNode } from "@/types";

/**
 * Normalize challenge nodes to always return an array
 */
export function normalizeChallengeNodes(nodes?: ProjectChallengeNode[] | null): ProjectChallengeNode[] {
  return Array.isArray(nodes) ? nodes : [];
}

/**
 * Flatten a nested challenge tree into a flat array
 */
export function flattenChallenges(nodes?: ProjectChallengeNode[] | null): ProjectChallengeNode[] {
  const source = normalizeChallengeNodes(nodes);
  return source.flatMap(node => [node, ...(node.children ? flattenChallenges(node.children) : [])]);
}

/**
 * Internal helper for inserting a challenge node
 */
function insertChallengeNodeInternal(
  nodes: ProjectChallengeNode[],
  newNode: ProjectChallengeNode,
  parentId: string | null,
): readonly [boolean, ProjectChallengeNode[]] {
  if (!parentId) {
    return [true, [newNode, ...nodes]] as const;
  }

  let inserted = false;
  const updatedNodes = nodes.map(node => {
    if (node.id === parentId) {
      inserted = true;
      const children = node.children ? [newNode, ...node.children] : [newNode];
      return { ...node, children };
    }

    if (node.children?.length) {
      const [childInserted, childNodes] = insertChallengeNodeInternal(node.children, newNode, parentId);
      if (childInserted) {
        inserted = true;
        return { ...node, children: childNodes };
      }
    }

    return node;
  });

  if (inserted) {
    return [true, updatedNodes] as const;
  }

  return [false, [newNode, ...updatedNodes]] as const;
}

/**
 * Insert a challenge node into the tree at the specified parent
 */
export function insertChallengeNode(
  nodes: ProjectChallengeNode[] | null | undefined,
  newNode: ProjectChallengeNode,
  parentId?: string | null,
): ProjectChallengeNode[] {
  const source = normalizeChallengeNodes(nodes);
  const [, updated] = insertChallengeNodeInternal(source, newNode, parentId ?? null);
  return updated;
}

/**
 * Count all sub-challenges (descendants) of a node
 */
export function countSubChallenges(node: ProjectChallengeNode): number {
  if (!node.children?.length) {
    return 0;
  }

  return node.children.length + node.children.reduce((total, child) => total + countSubChallenges(child), 0);
}

/**
 * Build a map from challenge ID to parent ID
 */
export function buildChallengeParentMap(nodes?: ProjectChallengeNode[] | null): Map<string, string | null> {
  const map = new Map<string, string | null>();

  const source = normalizeChallengeNodes(nodes);

  const traverse = (items: ProjectChallengeNode[], parentId: string | null) => {
    items.forEach(item => {
      map.set(item.id, parentId);
      if (item.children?.length) {
        traverse(item.children, item.id);
      }
    });
  };

  traverse(source, null);
  return map;
}

/**
 * Build a map from challenge ID to all descendant IDs
 */
export function buildChallengeDescendantsMap(nodes?: ProjectChallengeNode[] | null): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  const source = normalizeChallengeNodes(nodes);

  const collect = (item: ProjectChallengeNode): Set<string> => {
    const descendants = new Set<string>();

    item.children?.forEach(child => {
      descendants.add(child.id);
      const childDescendants = collect(child);
      childDescendants.forEach(id => descendants.add(id));
    });

    map.set(item.id, descendants);
    return descendants;
  };

  source.forEach(node => {
    collect(node);
  });

  return map;
}

/**
 * Remove a challenge node from the tree by ID
 * Returns the updated tree and the removed node (if found)
 */
export function removeChallengeNode(
  nodes: ProjectChallengeNode[],
  targetId: string,
): readonly [ProjectChallengeNode[], ProjectChallengeNode | null] {
  let removed: ProjectChallengeNode | null = null;

  const nextNodes = nodes
    .map(node => {
      if (node.id === targetId) {
        removed = node;
        return null;
      }

      if (node.children?.length) {
        const [children, extracted] = removeChallengeNode(node.children, targetId);
        if (extracted) {
          removed = extracted;
          return { ...node, children };
        }
      }

      return node;
    })
    .filter((value): value is ProjectChallengeNode => value !== null);

  return [nextNodes, removed] as const;
}
