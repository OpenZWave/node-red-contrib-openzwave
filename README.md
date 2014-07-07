node-red-contrib-openzwave
==========================

OpenZWave nodes for node-red. Uses the OpenZWave binding for Node.JS (https://github.com/jperkin/node-openzwave). It includes:

'zwave-controller' : a unique CONFIG node (not able to participate in flows) that holds configuration for initializing OpenZWave and will acts as the encapsulator for OZW access. As a node-red 'config' node, it cannot be added to a graph, but it acts as a singleton object that gets created in the the background when you add 'zwave' or 'zwave-node' nodes and configure them accordingly.

'zwave-node' : a generic zwave node that can do ZWave I/O with arbitrary messages, so it can be used with function blocks.

'zwave-in' / 'zwave-out': use this to target a specific ZWave node's function ("ValueID" in OpenZWave terminology) that can be parameterised for individual ZWave device endpoints. 
- 'Input nodes' can listen for value changes in the ZWave network so as to generate flow messages 
- 'Output nodes' can be setup so you can send ZWave commands from flow messages


