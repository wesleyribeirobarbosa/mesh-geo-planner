const xlsx = require('xlsx');
const commandLineArgs = require('command-line-args');
const skmeans = require('skmeans')
const utmLatLongObj = require('utm-latlng');
const utmLatLong = new utmLatLongObj();
const Queue_js = require('queue.js');
const fs = require('fs');

//Command line options
const optionDefinitions = [
    { name: 'coord_option', alias: 'c', type: String },
    { name: 'nodes_per_gw', alias: 'n', type: Number },
    { name: 'utm_zone', alias: 'u', type: String },
    { name: 'debug', alias: 'd', type: Number }
];
//Variables
var utm_zone;
const ladj_graph = [];
const cluster_array = [];
const nodes_array = [];
const poles_array = [];
var DEBUG = 0;
const MIN_DISTANCE_COMPONENT = 500;

/**
 * Command line arguments verification
 */
const commandLineOptions = commandLineArgs(optionDefinitions);
if (!(commandLineOptions.coord_option === 'utm' || commandLineOptions.coord_option === 'latlong') || isNaN(commandLineOptions.nodes_per_gw) || (commandLineOptions.coord_option === 'utm' && commandLineOptions.utm_zone === undefined)) {
    throw new Error('You must pass valid arguments for coord_option and nodes_per_gw');
}
else if (commandLineOptions.coord_option === 'utm' || commandLineOptions.coord_option === 'latlong') {
    utm_zone = commandLineOptions.utm_zone.match(/[\d\.]+|\D+/g);
    utm_zone[0] = parseInt(utm_zone[0]);
    if (utm_zone.length != 2 || isNaN(utm_zone[0]) || utm_zone <= 0 || utm_zone > 60 || !(typeof utm_zone[1] !== String)) {
        throw new Error('You must pass valid arguments for coord_option and nodes_per_gw');
    }
}
if (commandLineOptions.debug === 0 || commandLineOptions.debug === 1) {
    DEBUG = commandLineOptions.debug;
}

/**
 * Add coordinates to the objects and treat them
 */
addUtmLatLong = (element) => {
    let new_element = {
        city: element.city,
    };
    if (element.desc_1 !== undefined) {
        new_element.desc_1 = element.desc_1;
    }
    if (element.desc_2 !== undefined) {
        new_element.desc_2 = element.desc_2;
    }
    if (element.desc_3 !== undefined) {
        new_element.desc_3 = element.desc_3;
    }
    if (commandLineOptions.coord_option === 'utm') {
        new_element.utm_x = element.coord_x_lat;
        new_element.utm_y = element.coord_y_long;
        new_element.utm_zone = utm_zone[0];
        new_element.utm_letter = utm_zone[1];
        let convertLatLong = utmLatLong.convertUtmToLatLng(element.coord_x_lat, element.coord_y_long, utm_zone[0], utm_zone[1]);
        new_element.lat = convertLatLong.lat;
        new_element.long = convertLatLong.lng;
        new_element.component = -1;
    }
    else {
        new_element.lat = element.coord_x_lat;
        new_element.long = element.coord_y_long;
        let convertUtm = utmLatLong.convertLatLngToUtm(element.coord_x_lat, element.coord_y_long, 10);
        new_element.utm_x = convertUtm.Easting;
        new_element.utm_y = convertUtm.Northing;
        new_element.utm_zone = convertUtm.ZoneNumber;
        new_element.utm_letter = convertUtm.ZoneLetter;
        new_element.component = -1;
    }
    return new_element;
}


/**
 * Euclidian distance between two objects
 */
distance = (obj1, obj2) => {
    return Math.sqrt(Math.pow(obj1.utm_x - obj2.utm_x, 2) + Math.pow(obj1.utm_y - obj2.utm_y, 2));
}

/**
 * Breadth First Search to create the Minimum Spanning Tree on the cluster, equivalent to the Build_tree function of JSAC-06.
 */
bfs_msp = (ladj_graph, index, map_array) => {
    //Variables
    let distance = Array(ladj_graph.length).fill(-1);
    let queue = new Queue_js();
    let actual_index = 0;
    let max_relay_load = -1;
    let max_hops = -1;
    let ladj_ds = [];
    distance[index] = 0;
    //Initialize adjacency list
    for (let i = 0; i < ladj_graph.length; ++i) {
        ladj_ds[i] = [];
    }
    //Add first index to the queue
    queue.push(index);
    //Iterate between all the vertices
    while (queue.length != 0) {
        //Remove vertex from queue
        actual_index = queue.shift();
        //Verify maximum distance
        max_hops = Math.max(max_hops, distance[actual_index]);
        //Iterate between the neighbours and add them to the queue
        for (let i = 0; i < ladj_graph[actual_index].length; ++i) {
            let idx = ladj_graph[actual_index][i];
            //Verify if idx is inside the cluster
            if (map_array[idx] == 1) {
                map_array[idx] = 2;
                distance[idx] = distance[actual_index] + 1;
                ladj_ds[actual_index].push(idx);
                queue.push(idx);
            }
        }
        //Verify maximum relay load
        if (actual_index != index) {
            max_relay_load = Math.max(max_relay_load, ladj_ds[actual_index].length);
        }
    }
    return {
        ladj_msp: ladj_ds,
        dist_msp: distance,
        max_hops: max_hops,
        max_relay_load: max_relay_load
    };
}

/**
 * Breadth First Search with maximum nodes, relay load and maximum depth constraints
 */
bfs_qos = (ladj_graph, index, max_hops, max_nodes_per_gateway, max_relay_load) => {
    //Variables
    let distance = Array(ladj_graph.length).fill(-1);
    let queue = new Queue_js();
    let actual_index = 0;
    let actual_nodes_per_gateway = 0;
    let ladj_ds = [];
    distance[index] = 0;
    //Add first index to the queue
    queue.push(index);
    //Iterate between all the vertices
    while (queue.length != 0) {
        //Variables
        let actual_relay_load = 0;
        //Remove vertex from queue
        actual_index = queue.shift();
        ++actual_nodes_per_gateway;
        //Verify if the depth is reached
        if (distance[actual_index] >= max_hops || actual_nodes_per_gateway >= max_nodes_per_gateway)
            break;
        //Iterate between the neighbours and add them to the queue
        for (let i = 0; i < ladj_graph[actual_index].length; ++i) {
            if (distance[ladj_graph[actual_index][i]] == -1 && actual_relay_load < max_relay_load) {
                distance[ladj_graph[actual_index][i]] = distance[actual_index] + 1;
                queue.push(ladj_graph[actual_index][i]);
                ladj_ds.push(ladj_graph[actual_index][i]);
                ++actual_relay_load;
            }
        }
    }
    //Return all the possible nodes
    return ladj_ds;
}

/**
 * Breadth First Search between two vertices and a maximum depth, if not using a final vertice or maximum depth,
 * place -1 in them.
 */
bfs_ds = (ladj_graph_original, index, final_index, depth) => {
    //Variables
    let distance = [];
    let queue = new Queue_js();
    let actual_index = 0;
    let ladj_ds = [];
    distance[index] = 0;
    //Add first index to the queue
    queue.push(index);
    //Iterate between all the vertices
    while (queue.length != 0) {
        //Remove vertex from queue
        actual_index = queue.shift();
        //Verify if the depth is reached
        if (depth != -1 && distance[actual_index] >= depth)
            break;
        //Verify if the final vertex is reached
        if (final_index != -1 && actual_index == final_index)
            return distance[actual_index];
        //Iterate between the neighbours and add them to the queue
        for (let i = 0; i < ladj_graph_original[actual_index].length; ++i) {
            if (distance[ladj_graph_original[actual_index][i]] === undefined) {
                distance[ladj_graph_original[actual_index][i]] = distance[actual_index] + 1;
                queue.push(ladj_graph_original[actual_index][i]);
                ladj_ds.push(ladj_graph_original[actual_index][i]);
            }
        }
    }
    //Verify if there was a final vertex
    if (final_index != -1)
        return -1;
    //If not, return all the possible distances
    return ladj_ds;
}

/**
 * Equivalent to the Greedy_selection from JSAC-06, but only for the first dominating set, since it considers only one hop
 */
initial_greedy_selection = (ladj_graph, max_nodes_per_gateway) => {
    //Variables
    let aux_ladj_graph = [];
    let clusters_indexes = [];
    let cont_ladj_graph = [];
    //Initialize vectors
    for (let i = 0; i < ladj_graph.length; ++i) {
        aux_ladj_graph.push(0);
        cont_ladj_graph.push(ladj_graph[i].length);
    }
    //Iteractive loop to find the dominating set
    while (1) {
        let max_value = -1;
        let max_index = -1;
        //Select the node with greatest number of connected nodes
        for (let i = 0; i < ladj_graph.length; ++i) {
            if (aux_ladj_graph[i] == 0 && cont_ladj_graph[i] >= max_value) {
                max_value = cont_ladj_graph[i];
                max_index = i;
            }
        }
        //If none found, stop the loop
        if (max_index == -1)
            break;
        //Make the node a cluster head
        aux_ladj_graph[max_index] = 2;
        let obj_aux = {
            index: max_index,
            size: cont_ladj_graph[max_index],
            members: []
        }
        let nodes_cont = 0;
        //Decrease the number of edges connected to the cluster head
        for (let i = 0; i < ladj_graph[max_index].length; ++i) {
            let idx_hop_1 = ladj_graph[max_index][i];
            cont_ladj_graph[max_index] -= 1;
            cont_ladj_graph[idx_hop_1] -= 1;
        }
        //Verify which nodes will be connected to the cluster, and remove the edges of them
        for (let i = 0; i < ladj_graph[max_index].length; ++i) {
            let idx_hop_1 = ladj_graph[max_index][i];
            if (aux_ladj_graph[idx_hop_1] == 0 && nodes_cont < max_nodes_per_gateway) {
                obj_aux.members.push(idx_hop_1);
                aux_ladj_graph[idx_hop_1] = 1;
                ++nodes_cont;
                for (let j = 0; j < ladj_graph[idx_hop_1].length; ++j) {
                    let idx_hop_2 = ladj_graph[idx_hop_1][j];
                    cont_ladj_graph[idx_hop_1] -= 1;
                    cont_ladj_graph[idx_hop_2] -= 1;
                }
            }
        }
        //Add cluster head to the array of clusters
        obj_aux.size = Math.min(obj_aux.size, nodes_cont);
        clusters_indexes.push(obj_aux);
    }
    //Return clusters indexes
    return clusters_indexes;
}

/**
 * Equivalent to the Recursive_DS from JSAC-06, but using an iterative approach
 */
recursive_ds = (ladj_graph, max_hops, max_relay_load, max_nodes_per_gateway) => {
    //Variables
    let clusters_hop = 1;
    //Find the r_1 values
    let r1_lut = Array(31).fill(-1);
    for (let r_1 = 1; r_1 < 31; ++r_1) {
        for (let i = 1; i < 31; ++i) {
            let r_i = (i * (i + 1) * 0.5) + (r_1 - 1) * i;
            if (r_i < 31 && r1_lut[r_i] == -1)
                r1_lut[r_i] = r_1;
        }
    }
    //Verify r_1, at this time the algorithm will only work if r_1 == 1
    if (max_hops > 30 || r1_lut[max_hops] != 1) {
        return -1;
    }
    //Find the initial dominating set
    let dominating_set = initial_greedy_selection(ladj_graph, max_nodes_per_gateway);
    //Initialize the current nodes hop
    let current_nodes_hop = clusters_hop * (clusters_hop + 1) / 2;
    //Iteractive loop to find the best clusters
    while (current_nodes_hop < max_hops) {
        //Variables
        let temp_cluster_array = [];
        //Update iteraction number and hop counts
        ++clusters_hop;
        current_nodes_hop = clusters_hop * (clusters_hop + 1) / 2;
        //Create the adjacency list of the new graph and the auxiliary vector
        let curr_ladj_graph = [];
        let aux_ladj_graph = [];
        for (let i = 0; i < ladj_graph.length; ++i) {
            curr_ladj_graph[i] = [];
            aux_ladj_graph[i] = 0;
        }
        //Verify hops between dominating sets
        for (let i = 0; i < dominating_set.length; ++i) {
            for (let j = i + 1; j < dominating_set.length; ++j) {
                let dist_i_j = bfs_ds(ladj_graph, dominating_set[i].index, dominating_set[j].index, -1);
                //Connect them if they are below or equal the maximum hops count
                if (dist_i_j != -1 && dist_i_j <= clusters_hop) {
                    curr_ladj_graph[dominating_set[i].index].push(dominating_set[j].index);
                    curr_ladj_graph[dominating_set[j].index].push(dominating_set[i].index);
                }
            }
        }
        //Iterate between the current cluster heads, and try to merge them
        for (let i = 0; i < dominating_set.length; ++i) {
            let idx_curr = dominating_set[i].index;
            //Create cluster head object master
            let master_head_cluster_obj = JSON.parse(JSON.stringify(dominating_set[i]));
            //Verify if cluster head is available
            if (aux_ladj_graph[idx_curr] == 0) {
                //Verify neighbours nodes
                for (let j = 0; j < curr_ladj_graph[idx_curr].length; ++j) {
                    let idx_hop = curr_ladj_graph[idx_curr][j];
                    //Verify if the cluster is not connected
                    if (aux_ladj_graph[idx_hop] == 0) {
                        //Create objects of the clusters
                        let curr_cluster_obj = JSON.parse(JSON.stringify(master_head_cluster_obj));
                        let next_cluster_obj = dominating_set.find(obj => obj.index == idx_hop);
                        //Verify nodes per gateway QoS constraint (must include the gateway itself), before doing other things
                        if (curr_cluster_obj.size + next_cluster_obj.size + 2 <= max_nodes_per_gateway) {
                            curr_cluster_obj.members.push(next_cluster_obj.index);
                            for (let k = 0; k < next_cluster_obj.members.length; ++k) {
                                curr_cluster_obj.members.push(next_cluster_obj.members[k]);
                            }
                            curr_cluster_obj.size = curr_cluster_obj.members.length;
                            //Initialize arrays and adjacency list
                            //let curr_ladj_graph_cluster = [];
                            let aux_ladj_graph_cluster = [];
                            for (let k = 0; k < ladj_graph.length; ++k) {
                                //curr_ladj_graph_cluster[k] = [];
                                aux_ladj_graph_cluster[k] = 0;
                            }
                            for (let k = 0; k < curr_cluster_obj.members.length; ++k) {
                                aux_ladj_graph_cluster[curr_cluster_obj.members[k]] = 1;
                            }

                            //Create minimum spanning tree of the current cluster
                            let ladj_msp = bfs_msp(ladj_graph, curr_cluster_obj.index, aux_ladj_graph_cluster);
                            //Verify QoS constraints, verifying 1 less node on maximum relay load
                            if (ladj_msp.max_hops >= clusters_hop && ladj_msp.max_hops <= current_nodes_hop && ladj_msp.max_relay_load < max_relay_load) {
                                //Merge clusters and mark them as visited
                                master_head_cluster_obj = JSON.parse(JSON.stringify(curr_cluster_obj));
                                aux_ladj_graph[idx_hop] = 1;
                            }
                        }
                    }
                }
                //Mark cluster head as visited and add it to the array of clusters
                aux_ladj_graph[idx_curr] = 1;
                temp_cluster_array.push(master_head_cluster_obj);
            }
        }
        //Update dominating set
        dominating_set = temp_cluster_array;
    }
    return dominating_set;
}

/**
 * Iterative dominating set algorithm, fastest method
 */
iterative_ds_drauzio = (ladj_graph, max_hops, max_relay_load, max_nodes_per_gateway) => {
    //Variables
    let visited = Array(ladj_graph.length).fill(0);
    let ladj_dom = [];
    //Find the initial dominating set
    let dominating_set = initial_greedy_selection(ladj_graph, max_nodes_per_gateway);
    for (let i = 0; i < dominating_set.length; ++i) {
        let cluster_head_idx = dominating_set[i].index;
        if (visited[cluster_head_idx] == 0) {
            //Initialize object
            let obj_aux = {
                index: cluster_head_idx,
                size: -1,
                members: []
            };
            //Mark cluster head as visited
            visited[cluster_head_idx] = 1;
            //Run BFS with constraints
            let ladj_bfs = bfs_qos(ladj_graph, cluster_head_idx, max_hops, max_nodes_per_gateway, max_relay_load);
            //Iterate all neighbours
            for (let j = 0; j < ladj_bfs.length; ++j) {
                let member_idx = ladj_bfs[j];
                //Verify if member is visited
                if (visited[member_idx] == 0) {
                    visited[member_idx] = 1;
                    obj_aux.members.push(member_idx);
                }
            }
            //Add object to array
            obj_aux.size = obj_aux.members.length;
            ladj_dom.push(obj_aux);
        }
    }
    return ladj_dom;
}

iterative_rf_planner = (ladj_graph_original, nodes_array_original, max_hops, max_neighbors, max_relay_load, max_nodes_per_gateway) => {
    //Create distance array and fill with -1
    let distance_arr = Array(ladj_graph_original.length).fill(-1);
    //Create cont array to memo the number of nodes connect to a certain node
    let cont_arr = Array(ladj_graph_original.length).fill(0);
    //Father's array
    let father_arr = Array(ladj_graph_original.length).fill(-1);
    //Create object array
    let obj_arr = [];
    //Create adjacency list for final tree and fill cont array
    let ladj_graph_ds = [];
    for (let i = 0; i < ladj_graph_original.length; ++i) {
        ladj_graph_ds.push([]);
        cont_arr[i] = ladj_graph_original[i].length;
    }
    //Iterative loop for finding the best candidates and add them
    while (1) {
        //Auxiliary variables
        let best_id = -1, best_cont = -1, cluster_members = [], centroid_x = 0, centroid_y = 0;
        //Verify the highest order node
        for (let i = 0; i < ladj_graph_original.length; ++i) {
            if (distance_arr[i] == -1 && cont_arr[i] >= best_cont) {
                best_id = i;
                best_cont = cont_arr[i];
            }
        }
        //Verify if none was found and stop the loop
        if (best_id == -1 && best_cont == -1) {
            break;
        }
        //Mark as visited
        distance_arr[best_id] = 0;
        //Create member object
        let obj_aux = {
            index: best_id,
            size: -1,
            max_hops: 0,
            members: []
        };
        //Create member array by hops
        for (let i = 0; i < max_hops + 1; ++i) {
            obj_aux.members.push([]);
        }
        //BFS variables
        let bfs_queue = new Queue_js();
        let bfs_idx = 0;
        let max_hop_cluster = 0;
        let max_cluster_neighbors = 0;
        let max_cluster_relay_load = 0;
        let bfs_nodes_per_gateway = 1; /* Start with 1 to consider the cluster head*/
        bfs_queue.push(best_id);
        //Run BFS, consdering QoS constraints
        while (bfs_queue.length != 0) {
            //Variables
            let bfs_neighbors = 0;
            //Remove vertex from queue
            bfs_idx = bfs_queue.shift();
            //Add it to member array and verify maximum hop distance
            obj_aux.members[distance_arr[bfs_idx]].push(bfs_idx);
            max_hop_cluster = Math.max(max_hop_cluster, distance_arr[bfs_idx]);
            //Update cluster centroid
            centroid_x += nodes_array_original[bfs_idx].utm_x;
            centroid_y += nodes_array_original[bfs_idx].utm_y;
            //Add node to cluster array
            cluster_members.push(bfs_idx);
            //Iterate between neighbours
            for (let i = 0; i < ladj_graph_original[bfs_idx].length; ++i) {
                let bfs_next_idx = ladj_graph_original[bfs_idx][i];
                let bfs_max_rload = 0;
                //Verify QoS and if the node is not already merged
                if (distance_arr[bfs_next_idx] == -1 && (bfs_neighbors < max_neighbors || best_id == bfs_idx) && bfs_nodes_per_gateway < max_nodes_per_gateway && distance_arr[bfs_idx] < max_hops) {
                    //Make backwards path to verify relay load
                    let rload_idx = bfs_idx;
                    while (1) {
                        //Verify if it's cluster head
                        if (rload_idx == best_id) {
                            break;
                        }
                        //Run BFS on the nodes to verify the relay load
                        bfs_max_rload = Math.max(bfs_max_rload, bfs_ds(ladj_graph_ds, rload_idx, -1, -1).length);
                        //Update index to father index
                        rload_idx = father_arr[rload_idx];
                    }
                    //Verify max relay load
                    if (bfs_max_rload < max_relay_load) {
                        //Update max relay load
                        max_cluster_relay_load = Math.max(max_cluster_relay_load, bfs_max_rload + 1);
                        //Fill next_idx father
                        father_arr[bfs_next_idx] = bfs_idx;
                        //Increase hop
                        distance_arr[bfs_next_idx] = distance_arr[bfs_idx] + 1;
                        //Add member to the graph
                        ladj_graph_ds[bfs_idx].push(bfs_next_idx);
                        //Increase members in the current node
                        ++bfs_neighbors;
                        //Increase members in the current cluster
                        ++bfs_nodes_per_gateway;
                        //Add member to the queue
                        bfs_queue.push(bfs_next_idx);
                    }
                }
            }
            if (best_id != bfs_idx) {
                max_cluster_neighbors = Math.max(max_cluster_neighbors, bfs_neighbors);
            }
        }
        //Make the counter of the members merged zero
        for (let i = 0; i < cluster_members.length; ++i) {
            cont_arr[cluster_members[i]] = 0;
        }
        //Verify all its neighbors and subtract their edges
        for (let i = 0; i < cluster_members.length; ++i) {
            let cluster_idx = cluster_members[i];
            for (let j = 0; j < ladj_graph_original[cluster_idx].length; ++j) {
                let cluster_next_idx = ladj_graph_original[cluster_idx][j];
                if (cont_arr[cluster_next_idx] != 0) {
                    --cont_arr[cluster_next_idx];
                }
            }
        }
        //Update centroid and create LatLong centroid
        centroid_x = centroid_x / bfs_nodes_per_gateway;
        centroid_y = centroid_y / bfs_nodes_per_gateway;
        let centroid_latlong = utmLatLong.convertUtmToLatLng(centroid_x, centroid_y, utm_zone[0], utm_zone[1]);
        //Set object number of devices and maximum hops
        obj_aux.centroid_utm = [centroid_x, centroid_y];
        obj_aux.centroid_latlong = [centroid_latlong.lat, centroid_latlong.lng];
        obj_aux.max_hops = max_hop_cluster;
        obj_aux.size = bfs_nodes_per_gateway;
        obj_aux.max_neighbors = max_cluster_neighbors;
        obj_aux.max_relay_load = max_cluster_relay_load;
        //Add object to array
        obj_arr.push(obj_aux);
    }
    //Return object array
    return [obj_arr, cont_arr, distance_arr, ladj_graph_ds];
}

/*

//DFS over the objects
dfs = (index, component_number) => {
    nodes_array[index].component = component_number;
    for (let i = 0; i < nodes_array.length; ++i) {
        if (i !== index && nodes_array[i].component === -1 && distance(nodes_array[index], nodes_array[i]) <= MIN_DISTANCE_COMPONENT) {
            ladj_graph[index].push(i);
            ladj_graph[i].push(index);
            dfs(i, component_number);
        }
    }
}



//Algorithm to prepare ladj with 1 hop, using greedy selection and graph iteration (best method)
adj_list_1_hop = (ladj_graph) => {
    let aux_ladj_graph = [];
    let clusters_indexes = [];
    let cont_ladj_graph = [];
    for (let i = 0; i < ladj_graph.length; ++i) {
        aux_ladj_graph.push(0);
        cont_ladj_graph.push(ladj_graph[i].length);
    }
    while (1) {
        let max_value = -1;
        let max_index = -1;
        for (let i = 0; i < ladj_graph.length; ++i) {
            if (aux_ladj_graph[i] == 0 && cont_ladj_graph[i] >= max_value) {
                max_value = cont_ladj_graph[i];
                max_index = i;
            }
        }
        if (max_index == -1)
            break;
        aux_ladj_graph[max_index] = 2;
        let obj_aux = {
            index: max_index,
            size: cont_ladj_graph[max_index],
            members: []
        }
        cont_ladj_graph[max_index] = 0;
        for (let i = 0; i < ladj_graph[max_index].length; ++i) {
            let idx_hop_1 = ladj_graph[max_index][i];
            if (aux_ladj_graph[idx_hop_1] == 0) {
                obj_aux.members.push(idx_hop_1);
                aux_ladj_graph[idx_hop_1] = 1;
                for (let j = 0; j < ladj_graph[idx_hop_1].length; ++j) {
                    let idx_hop_2 = ladj_graph[idx_hop_1][j];
                    if (aux_ladj_graph[idx_hop_2] != 2) {
                        cont_ladj_graph[idx_hop_2] -= 1;
                    }
                }
            }
        }
        clusters_indexes.push(obj_aux);
    }
    return clusters_indexes;
}

//Prepare graph for greedy algorithm
adj_list_greedy = (ladj_graph_aux, depth) => {
    let index_list = [];
    let new_ladj = [];
    let new_ladj_with_indexes = [];
    //First, run BFS with the proposed depth to create the new Adjacency List
    for (let i = 0; i < ladj_graph_aux.length; ++i) {
        new_ladj[i] = bfs_ds(ladj_graph_aux, i, depth);
        //console.log(new_ladj[i]);
    }
    //Create the new Adjacency List with the proper indexes
    for (let i = 0; i < ladj_graph_aux.length; ++i) {
        new_ladj_with_indexes[i] = [];
        new_ladj_with_indexes[i] = new_ladj_with_indexes[i].concat(i, new_ladj[i]);
        //console.log(new_ladj_with_indexes[i]);
    }
    new_ladj_with_indexes.sort((a, b) => {
        if (a.length < b.length)
            return 1;
        return -1;
    });
    for (let i = 0; i < new_ladj_with_indexes.length; ++i) {
        index_list.push(new_ladj_with_indexes[i][0]);
    }
    return index_list;
}

//BFS with depth
bfs_ds = (ladj_graph_aux, index, depth) => {
    let distance = [];
    let queue = new Queue_js();
    let actual_index = 0;
    let ladj_ds = [];
    distance[index] = 0;
    queue.push(index);
    while (queue.length !== 0) {
        actual_index = queue.shift();
        if (distance[actual_index] >= depth)
            break;
        for (let i = 0; i < ladj_graph_aux[actual_index].length; ++i) {
            if (distance[ladj_graph_aux[actual_index][i]] === undefined) {
                distance[ladj_graph_aux[actual_index][i]] = distance[actual_index] + 1;
                queue.push(ladj_graph_aux[actual_index][i]);
                ladj_ds.push(ladj_graph_aux[actual_index][i]);
            }
        }
    }
    return ladj_ds;
}

//Dominanting set algorithm
dominant_set = (ladj_graph_aux, index_list, depth) => {
    let visited = [];
    let ladj_dom = [];
    let max_nodes_per_gw = commandLineOptions.nodes_per_gw;
    for (let i = 0; i < index_list.length; ++i) {
        let index = index_list[i];
        let cont = 0;
        let obj_aux = {
            index: -1,
            size: -1,
            members: []
        };
        if (visited[index] === undefined) {
            visited[index] = 1;
            let ladj_ds = bfs_ds(ladj_graph_aux, index, depth);
            let ladj_ds_max = Math.min(ladj_ds.length, max_nodes_per_gw);
            obj_aux.index = index;
            for (let j = 0; j < ladj_ds.length; ++j) {
                //Verificar aqui o QoS
                if (visited[ladj_ds[j]] === undefined) {
                    visited[ladj_ds[j]] = 1;
                    obj_aux.members.push(ladj_ds[j]);
                    ++cont;
                    if (cont >= ladj_ds_max)
                        break;
                }
            }
            obj_aux.size = cont;
            ladj_dom.push(obj_aux);
        }
    }
    return ladj_dom;
}
*/
//Code

/**
 * First, all the sheats are read and processed according to the input parameters
 */

//Read nodes sheet
let nodes_sheet = xlsx.utils.sheet_to_json(xlsx.readFile('./sheets/nodes.xlsx').Sheets.sheet1);
//Iterate through all elements and adjust them
nodes_sheet.forEach(element => {
    nodes_array.push(addUtmLatLong(element));
});
if (DEBUG) {
    console.log('### EXCEL PROCESSING OF NODES_ARRAY');
    console.log(nodes_array);
}

//Read poles sheet
let poles_sheet = xlsx.utils.sheet_to_json(xlsx.readFile('./sheets/poles.xlsx').Sheets.sheet1);
//Iterate through all elements and adjust them
poles_sheet.forEach(element => {
    poles_array.push(addUtmLatLong(element));
});
if (DEBUG) {
    console.log('### EXCEL PROCESSING OF POLES_ARRAY');
    console.log(poles_array);
}

/**
 * Create graph
 */

//Initialize Adjacency List
for (let i = 0; i < nodes_array.length; ++i) {
    ladj_graph.push([]);
}


//Create all possible links
for (let i = 0; i < nodes_array.length; ++i) {
    for (let j = i + 1; j < nodes_array.length; ++j) {
        let dist_aux = distance(nodes_array[i], nodes_array[j]);
        if (dist_aux <= MIN_DISTANCE_COMPONENT) {
            ladj_graph[i].push(j);
            ladj_graph[j].push(i);
        }
    }
}



/*
let final_ans = recursive_ds(ladj_graph, 10, 500, commandLineOptions.nodes_per_gw);

for (let i = 0; i < final_ans.length; ++i) {
    console.log(final_ans[i].size);
}
*/
//console.log(iterative_ds_drauzio(ladj_graph, 8, 30, commandLineOptions.nodes_per_gw));





//console.log('iterative_rf_planner', iterative_rf_planner(ladj_graph, 6, 12, 500, 1000)[0].length);
//console.log('recursive_ds', recursive_ds(ladj_graph, 6, 12, 1000).length);

let teste_iterativo = iterative_rf_planner(ladj_graph, nodes_array, 10, 30, 200, 2500);
let teste_array = [];
//console.log(teste_iterativo[0]);
console.log(teste_iterativo[0].length);
for (let i = 0; i < teste_iterativo[0].length; ++i) {
    let idx = teste_iterativo[0][i].index;
    teste_array.push(nodes_array[idx]);
    //console.log(nodes_array[idx]);
}

let data1_json = JSON.stringify(nodes_array, null, "\t");
fs.writeFileSync('./visual-debugger/src/outputs/nodes_array.json', data1_json);

let data2_json = JSON.stringify(teste_array, null, "\t");
fs.writeFileSync('./visual-debugger/src/outputs/gateways_array.json', data2_json);

let data3_json = JSON.stringify(teste_iterativo, null, "\t");
fs.writeFileSync('./visual-debugger/src/outputs/iterative_rf_planner.json', data3_json);





//let hrstart = process.hrtime();
/*
let ladj_greedy_index = adj_list_1_hop(ladj_graph);
let aux_vector = [];
for (let i = 0; i < ladj_greedy_index.length; ++i) {
    aux_vector.push(ladj_greedy_index[i].index);
}
//let ladj_greedy_index_2 = adj_list_greedy(ladj_graph, 3);
let ans = dominant_set(ladj_graph, aux_vector, 8);

let percent_10 = 0;
let percent_11_30 = 0;
let percent_31_80 = 0;
let percent_81_100 = 0;

for (let i = 0; i < ans.length; ++i) {
    console.log(ans[i].size);
    let percent = ans[i].size * 100 / commandLineOptions.nodes_per_gw;
    if (percent <= 10) {
        percent_10++;
    }
    else if (percent >= 11 && percent <= 30) {
        percent_11_30++;
    }
    else if (percent >= 31 && percent <= 80) {
        percent_31_80++;
    }
    else {
        percent_81_100++;
    }
}
console.log('GWs:', ans.length);
console.log('qty > 80%:', percent_81_100);
console.log('30% < qty <= 80%:', percent_31_80);
console.log('10% < qty <= 30%:', percent_11_30);
console.log('qty <= 10%:', percent_10);
*/


//console.log(nodes_array[dominant_set(ladj_graph, ladj_greedy_index, 8)[0]]);
//let hrend = process.hrtime(hrstart);
//console.log(hrend[1] / 1000000);