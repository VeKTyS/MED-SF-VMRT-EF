function createGraph(stations, links) {
  const graph = {};

  // Initialize graph nodes with station info
  stations.forEach(station => {
    graph[station.id || station.stop_id] = {
      name: station.name || station.stop_name,
      neighbors: []
    };
  });

  // Add all links (trips and pathways)
  links.forEach(link => {
    let weight = 1;
    if (link.weight !== undefined && link.weight > 0) {
      weight = link.weight;
    } else if (link.traveling_time_in_sec !== undefined && link.traveling_time_in_sec > 0) {
      weight = link.traveling_time_in_sec;
    }
    if (graph[link.from] && graph[link.to]) {
      graph[link.from].neighbors.push({
        id: link.to,
        name: graph[link.to].name,
        weight,
        type: link.type || null
      });
    }
  });

  return graph;
}


function Djikstra(graph, startId, endId = null) {
  const distances = {};
  const previous = {};
  const queue = new Set();

  // Initialize distances and queue
  for (const id in graph) {
    distances[id] = Infinity;
    previous[id] = null;
    queue.add(id);
  }
  distances[startId] = 0;

  while (queue.size > 0) {
    // Get the node with the smallest distance
    let currentId = null;
    for (const id of queue) {
      if (currentId === null || distances[id] < distances[currentId]) {
        currentId = id;
      }
    }

    if (distances[currentId] === Infinity) break;
    queue.delete(currentId);

    // Early exit if we reached the destination
    if (endId && currentId === endId) break;

    graph[currentId].neighbors.forEach(neighbor => {
      const alt = distances[currentId] + neighbor.weight;
      if (alt < distances[neighbor.id]) {
        distances[neighbor.id] = alt;
        previous[neighbor.id] = currentId;
      }
    });
  }

  // Helper to reconstruct the path with station names
  function reconstructPathWithNames(toId) {
    const path = [];
    let current = toId;
    while (current) {
      path.unshift({
        id: current,
        name: graph[current]?.name || null,
        distance : distances[current]
      });
      current = previous[current];
    }
    return path;
  }

  return endId
    ? {
        distances,
        previous,
        path: reconstructPathWithNames(endId),
        totalDistance: distances[endId]
      }
    : { distances, previous };
}


function kruskal_acpm(graph) {
  const edges = [];
  for (const id in graph) {
    graph[id].neighbors.forEach(neighbor => {
      edges.push({ from: id, to: neighbor.id, weight: neighbor.weight });
    });
  }

  const uniqueEdges = Array.from(new Set(edges.map(e => JSON.stringify(e)))).map(e => JSON.parse(e));

  // Sort edges by weight
  uniqueEdges.sort((a, b) => a.weight - b.weight);

  const parent = {};
  const rank = {};

  function find(id) {
    if (parent[id] === undefined) {
      parent[id] = id;
      rank[id] = 0;
    }
    if (parent[id] !== id) {
      parent[id] = find(parent[id]);
    }
    return parent[id];
  }

  function union(id1, id2) {
    const root1 = find(id1);
    const root2 = find(id2);
    if (root1 !== root2) {
      if (rank[root1] > rank[root2]) {
        parent[root2] = root1;
      } else if (rank[root1] < rank[root2]) {
        parent[root1] = root2;
      } else {
        parent[root2] = root1;
        rank[root1]++;
      }
    }
  }

  const mst = [];
  uniqueEdges.forEach(edge => {
    if (find(edge.from) !== find(edge.to)) {
      union(edge.from, edge.to);
      mst.push(edge);
    }
  });

  return mst;
}

function prim_acpm(graph){
  const mst = [];
  const visited = new Set();
  const edges = [];

  // Start from the first node
  const startNode = Object.keys(graph)[0];
  visited.add(startNode);
  
  // Add all edges from the start node to the edges list
  graph[startNode].neighbors.forEach(neighbor => {
    edges.push({ from: startNode, to: neighbor.id, weight: neighbor.weight });
  });

  while (edges.length > 0) {
    // Sort edges by weight
    edges.sort((a, b) => a.weight - b.weight);
    
    // Get the smallest edge
    const edge = edges.shift();
    
    if (visited.has(edge.to)) continue; // Skip if the destination is already visited

    // Add edge to MST
    mst.push(edge);
    visited.add(edge.to);

    // Add all edges from the newly visited node to the edges list
    graph[edge.to].neighbors.forEach(neighbor => {
      if (!visited.has(neighbor.id)) {
        edges.push({ from: edge.to, to: neighbor.id, weight: neighbor.weight });
      }
    });
  }

  return mst;
}

function connexite(graph){
  const stationIds = Object.keys(graph);
  const isolated = stationIds.filter(id => (graph[id] || []).length === 0);
  console.log('Isolated stations:', isolated);
  if (stationIds.length === 0) return true;

  const visited = new Set();
  const queue = [stationIds[0]];

  while (queue.length) {
    const current = queue.shift();
    visited.add(current);
    const neighbors = graph[current] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
        visited.add(neighbor);
      }
    }
  }
  return visited.size === stationIds.length;
}

module.exports = { createGraph, Djikstra, kruskal_acpm, prim_acpm, connexite};