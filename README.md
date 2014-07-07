node-red-contrib-openzwave
==========================

OpenZWave nodes for node-red. Uses the OpenZWave binding for Node.JS (https://github.com/jperkin/node-openzwave). It includes:

*'zwave-controller'* : a unique CONFIG node (not able to participate in flows) that holds configuration for initializing OpenZWave and will acts as the encapsulator for OZW access. As a node-red 'config' node, it cannot be added to a graph, but it acts as a singleton object that gets created in the the background when you add 'zwave' or 'zwave-node' nodes and configure them accordingly.

*'zwave-node'* : a generic zwave node that can do ZWave I/O with arbitrary messages, so it can be used with function blocks.
- example messages processed:

 -- {topic: 'switchOn', payload: 2}   ==> switch on basic switch #2

 -- {topic: 'switchOff', payload: 2}  ==> switch off basic switch #2

 -- {topic: 'setLevel', payload: {nodeid: 5, level: 50}}  ==> set level on dimmer #5 to 50%

 -- {topic: 'setValue', payload: {nodeid: 8, cmdclass: 0x25, cmdidx:1, value: true}} ==> switch on the 2nd relay of multiswitch #8 

*'zwave-in' / 'zwave-out'*: use this to target a specific ZWave node's function ("ValueID" in OpenZWave terminology) that can be parameterised for individual ZWave device endpoints. 
- 'Input nodes' can listen for value changes in the ZWave network so as to generate flow messages 
- 'Output nodes' can be setup so you can send ZWave commands from flow messages

Here's an example flow, utilising the generic 'zwave-node'. Use an inject node to send arbitrary zwave commands:
![openzwave example](https://github.com/ekarak/node-red-contrib-openzwave/raw/master/node-red-openzwave.png)
