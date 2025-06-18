/**
 * Creates a graph representation of the metro network.
 * @param {Array} stations - List of stations with their details.
 * @param {Array} links - List of links between stations with travel times.
 * @returns {Object} - Graph representation where each station is a node and links are edges with weights.
 */
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

    // If the smallest distance is Infinity, we are done
    if (distances[currentId] === Infinity) break;

    queue.delete(currentId);

    // Update neighbors
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
module.exports = { createGraph, Djikstra };