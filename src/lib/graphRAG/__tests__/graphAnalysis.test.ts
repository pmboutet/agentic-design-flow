import Graph from "graphology";
import {
  detectCommunities,
  computeCentrality,
  findShortestPath,
  getTopByCentrality,
  getNodeAnalyticsMap,
} from "../graphAnalysis";

describe("graphAnalysis", () => {
  // ==========================================================================
  // COMMUNITY DETECTION
  // ==========================================================================

  describe("detectCommunities", () => {
    it("should return empty array for empty graph", () => {
      const graph = new Graph({ type: "undirected" });
      const communities = detectCommunities(graph);
      expect(communities).toEqual([]);
    });

    it("should detect single community in fully connected graph", () => {
      const graph = new Graph({ type: "undirected" });

      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });

      graph.addEdge("a", "b", { weight: 1 });
      graph.addEdge("b", "c", { weight: 1 });
      graph.addEdge("a", "c", { weight: 1 });

      const communities = detectCommunities(graph);

      expect(communities.length).toBe(1);
      expect(communities[0].size).toBe(3);
      expect(communities[0].nodeIds.sort()).toEqual(["a", "b", "c"]);
      expect(communities[0].dominantType).toBe("insight");
    });

    it("should detect multiple communities in disconnected graph", () => {
      const graph = new Graph({ type: "undirected" });

      // Cluster 1: a-b-c
      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });
      graph.addEdge("a", "b", { weight: 1 });
      graph.addEdge("b", "c", { weight: 1 });
      graph.addEdge("a", "c", { weight: 1 });

      // Cluster 2: d-e (disconnected)
      graph.addNode("d", { type: "entity", label: "D" });
      graph.addNode("e", { type: "entity", label: "E" });
      graph.addEdge("d", "e", { weight: 1 });

      const communities = detectCommunities(graph);

      expect(communities.length).toBe(2);
      // Should be sorted by size
      expect(communities[0].size).toBe(3);
      expect(communities[1].size).toBe(2);
    });

    it("should calculate cohesion correctly", () => {
      const graph = new Graph({ type: "undirected" });

      // Fully connected triangle (max cohesion = 1.0)
      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });
      graph.addEdge("a", "b", { weight: 1 });
      graph.addEdge("b", "c", { weight: 1 });
      graph.addEdge("a", "c", { weight: 1 });

      const communities = detectCommunities(graph);

      expect(communities[0].cohesion).toBe(1);
    });

    it("should identify dominant type correctly", () => {
      const graph = new Graph({ type: "undirected" });

      // Create a tight cluster of entities only
      graph.addNode("e1", { type: "entity", label: "E1" });
      graph.addNode("e2", { type: "entity", label: "E2" });
      graph.addNode("e3", { type: "entity", label: "E3" });

      graph.addEdge("e1", "e2", { weight: 1 });
      graph.addEdge("e2", "e3", { weight: 1 });
      graph.addEdge("e1", "e3", { weight: 1 });

      const communities = detectCommunities(graph);

      // All nodes are entities, so dominant type should be entity
      expect(communities[0].dominantType).toBe("entity");
    });
  });

  // ==========================================================================
  // CENTRALITY
  // ==========================================================================

  describe("computeCentrality", () => {
    it("should return empty maps for empty graph", () => {
      const graph = new Graph({ type: "undirected" });
      const centrality = computeCentrality(graph);

      expect(centrality.betweenness.size).toBe(0);
      expect(centrality.pageRank.size).toBe(0);
      expect(centrality.degree.size).toBe(0);
    });

    it("should compute centrality for all nodes", () => {
      const graph = new Graph({ type: "undirected" });

      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });

      graph.addEdge("a", "b", { weight: 1 });
      graph.addEdge("b", "c", { weight: 1 });

      const centrality = computeCentrality(graph);

      expect(centrality.betweenness.size).toBe(3);
      expect(centrality.pageRank.size).toBe(3);
      expect(centrality.degree.size).toBe(3);
    });

    it("should identify center node as highest betweenness in star topology", () => {
      const graph = new Graph({ type: "undirected" });

      // Star: center connected to all, leaves only to center
      graph.addNode("center", { type: "insight", label: "Center" });
      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });

      graph.addEdge("center", "a", { weight: 1 });
      graph.addEdge("center", "b", { weight: 1 });
      graph.addEdge("center", "c", { weight: 1 });

      const centrality = computeCentrality(graph);

      const centerBetweenness = centrality.betweenness.get("center") || 0;
      const leafBetweenness = centrality.betweenness.get("a") || 0;

      expect(centerBetweenness).toBeGreaterThan(leafBetweenness);
    });

    it("should identify hub as highest degree in hub topology", () => {
      const graph = new Graph({ type: "undirected" });

      graph.addNode("hub", { type: "insight", label: "Hub" });
      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });
      graph.addNode("d", { type: "insight", label: "D" });

      // Hub connected to all
      graph.addEdge("hub", "a", { weight: 1 });
      graph.addEdge("hub", "b", { weight: 1 });
      graph.addEdge("hub", "c", { weight: 1 });
      graph.addEdge("hub", "d", { weight: 1 });

      // a-b are also connected
      graph.addEdge("a", "b", { weight: 1 });

      const centrality = computeCentrality(graph);

      const hubDegree = centrality.degree.get("hub") || 0;
      const cDegree = centrality.degree.get("c") || 0;

      expect(hubDegree).toBeGreaterThan(cDegree);
    });
  });

  describe("getTopByCentrality", () => {
    it("should return top N nodes sorted by score", () => {
      const graph = new Graph({ type: "undirected" });

      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });

      const centralityMap = new Map([
        ["a", 0.1],
        ["b", 0.5],
        ["c", 0.3],
      ]);

      const top2 = getTopByCentrality(graph, centralityMap, 2);

      expect(top2.length).toBe(2);
      expect(top2[0].id).toBe("b");
      expect(top2[0].score).toBe(0.5);
      expect(top2[1].id).toBe("c");
      expect(top2[1].label).toBe("C");
    });
  });

  // ==========================================================================
  // SHORTEST PATH
  // ==========================================================================

  describe("findShortestPath", () => {
    it("should return null for non-existent source node", () => {
      const graph = new Graph({ type: "undirected" });
      graph.addNode("a", { type: "insight", label: "A" });

      const result = findShortestPath(graph, "nonexistent", "a");
      expect(result).toBeNull();
    });

    it("should return null for non-existent target node", () => {
      const graph = new Graph({ type: "undirected" });
      graph.addNode("a", { type: "insight", label: "A" });

      const result = findShortestPath(graph, "a", "nonexistent");
      expect(result).toBeNull();
    });

    it("should return null for disconnected nodes", () => {
      const graph = new Graph({ type: "undirected" });

      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      // No edge between them

      const result = findShortestPath(graph, "a", "b");
      expect(result).toBeNull();
    });

    it("should find direct path between connected nodes", () => {
      const graph = new Graph({ type: "undirected" });

      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addEdge("a", "b", { relationshipType: "SIMILAR_TO", weight: 1 });

      const result = findShortestPath(graph, "a", "b");

      expect(result).not.toBeNull();
      expect(result!.path).toEqual(["a", "b"]);
      expect(result!.distance).toBe(1);
      expect(result!.edgeLabels).toEqual(["SIMILAR_TO"]);
      expect(result!.nodeLabels).toEqual(["A", "B"]);
    });

    it("should find multi-hop path", () => {
      const graph = new Graph({ type: "undirected" });

      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });

      graph.addEdge("a", "b", { relationshipType: "SIMILAR_TO", weight: 1 });
      graph.addEdge("b", "c", { relationshipType: "RELATED_TO", weight: 1 });

      const result = findShortestPath(graph, "a", "c");

      expect(result).not.toBeNull();
      expect(result!.path).toEqual(["a", "b", "c"]);
      expect(result!.distance).toBe(2);
      expect(result!.edgeLabels).toEqual(["SIMILAR_TO", "RELATED_TO"]);
    });

    it("should find shortest path when multiple paths exist", () => {
      const graph = new Graph({ type: "undirected" });

      graph.addNode("a", { type: "insight", label: "A" });
      graph.addNode("b", { type: "insight", label: "B" });
      graph.addNode("c", { type: "insight", label: "C" });
      graph.addNode("d", { type: "insight", label: "D" });

      // Long path: a -> b -> c -> d (3 hops)
      graph.addEdge("a", "b", { relationshipType: "SIMILAR_TO", weight: 1 });
      graph.addEdge("b", "c", { relationshipType: "SIMILAR_TO", weight: 1 });
      graph.addEdge("c", "d", { relationshipType: "SIMILAR_TO", weight: 1 });

      // Short path: a -> d (1 hop)
      graph.addEdge("a", "d", { relationshipType: "RELATED_TO", weight: 1 });

      const result = findShortestPath(graph, "a", "d");

      expect(result).not.toBeNull();
      expect(result!.distance).toBe(1);
      expect(result!.path).toEqual(["a", "d"]);
    });
  });

  // ==========================================================================
  // NODE ANALYTICS MAP
  // ==========================================================================

  describe("getNodeAnalyticsMap", () => {
    it("should combine community and centrality data", () => {
      const communities = [
        { id: 0, nodeIds: ["a", "b"], size: 2, dominantType: "insight" as const, cohesion: 1 },
        { id: 1, nodeIds: ["c"], size: 1, dominantType: "entity" as const, cohesion: 0 },
      ];

      const centrality = {
        betweenness: new Map([["a", 0.5], ["b", 0.2], ["c", 0.1]]),
        pageRank: new Map([["a", 0.4], ["b", 0.3], ["c", 0.3]]),
        degree: new Map([["a", 0.8], ["b", 0.4], ["c", 0.2]]),
      };

      const analyticsMap = getNodeAnalyticsMap(communities, centrality);

      expect(analyticsMap.get("a")).toEqual({
        community: 0,
        betweenness: 0.5,
        pageRank: 0.4,
        degree: 0.8,
      });

      expect(analyticsMap.get("c")).toEqual({
        community: 1,
        betweenness: 0.1,
        pageRank: 0.3,
        degree: 0.2,
      });
    });
  });
});
