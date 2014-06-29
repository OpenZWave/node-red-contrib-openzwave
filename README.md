node-red-contrib-openzwave
==========================

OpenZWave nodes for node-red. Uses the OpenZWave binding for Node.JS (https://github.com/jperkin/node-openzwave). It will include:

'zwave-controller' : a unique CONFIG node that holds configuration for initializing OpenZWave and will acts as the encapsulator for OZW access.

'zwave' : a generic zwave node that can do ZWave I/O with arbitrary messages, so it can be used with function blocks

'zwave-device': specific ZWave target nodes ("input" or "output" in node-red terminology) that can be parameterised for individual ZWave device endpoints (read: OpenZWave ValueID's)

