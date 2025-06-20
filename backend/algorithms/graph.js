function createGraph(stations, links) {
  const graph = {};

  // Initialize graph nodes
  stations.forEach(station => {
    graph[station.id.trim()] = {
      name: station.name, // Use the station's name
      neighbors: [] // List of connected stations with weights
    };
  });

  // Add edges to the graph
  links.forEach(link => {
    const from = link.from.trim();
    const to = link.to.trim();
    const time = link.time;

    // Ensure both stations exist in the graph
    if (graph[from] && graph[to]) {
      // Add the connection from "from" to "to"
      graph[from].neighbors.push({ id: to, name: graph[to].name, weight: time });

      // Add the connection from "to" to "from" (assuming undirected graph)
      graph[to].neighbors.push({ id: from, name: graph[from].name, weight: time });
    } else {
      console.warn(`Link references missing station(s): from=${from}, to=${to}`);
    }
  });

  return graph;
}

function Djikstra(graph, startId) {
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

    graph[currentId].neighbors.forEach(neighbor => {
      const alt = distances[currentId] + neighbor.weight;
      if (alt < distances[neighbor.id]) {
        distances[neighbor.id] = alt;
        previous[neighbor.id] = currentId;
      }
    });
  }

  return { distances, previous };
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