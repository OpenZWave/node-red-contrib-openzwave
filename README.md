node-red-contrib-openzwave
==========================

*OpenZWave* nodes for Node-Red ( <http://nodered.org/> ). Uses the OpenZWave binding for Node.JS ( <https://github.com/ekarak/node-openzwave> ). It includes:

*zwave-controller* : a unique CONFIG node that holds configuration for initializing OpenZWave and will acts as the encapsulator for OZW access. As a node-red 'config' node, it cannot be added to a graph, but it acts as a singleton object that gets created in the the background when you add 'zwave-in' or 'zwave-out' nodes and configure them to point to a ZWave USB controller (usually /dev/ttyUSB0).

*zwave-in* : a node that emits ZWave events as they are emitted from the ZWave controller. Use this node to get status feedback about what is happening in real time in your ZWave network. For example, the following message is injected into the NR flow when a ZWave node becomes ready for use:

`{ "topic": "zwave: node ready", "payload": { "nodeid": 9, "nodeinfo": { "manufacturer": "", "manufacturerid": "", "product": "", "producttype": "", "productid": "", "type": "Binary Switch", "name": "", "loc": "" } } }`

*zwave-out*: use this to send arbitrary commands to the ZWave appliances.  For the moment there are four commands supported, namely:

 - `{topic: 'switchOn',  payload: {"nodeId":2}}`  ==> to switch on basic switch #2

 - `{topic: 'switchOff', payload: {"nodeId":2}}`  ==> to switch off basic switch #2

 - `{topic: 'setLevel', payload: {"nodeid": 5, "value": 50}}`  ==> set level on dimmer #5 to 50%

 - `{topic: 'setValue', payload: {"nodeid":5, "cmdclass":38, "value":50}}` ==> same effect as above, switch on the 2nd relay of multiswitch #8 using command class 38 (cmdClassSwitchMultilevel)

The `setValue` topic is the most flexible, as you can send arbitrary ZWave values to the unlderlying OpenZWave library. Currently only "plain/basic" datatypes are supported (ints, floats etc), more complex ones, eg values with units such as thermostat setpoints are not yet supported.  For a full list of ZWave command classes, see <http://wiki.micasaverde.com/index.php/ZWave_Command_Classes>

*WARNING* multi-instance devices (such as the Fibaro FGS-221), where one single ZWave node controls multiple endpoints/relays,  won't work with the stock jperkin/node-openzwave library, as it lacks the `_instance` field in OpenZWave ValueID's.  You need to patch your installation as per the following: https://github.com/jperkin/node-openzwave/pull/31 , or simply use repo "ekarak/node-openzwave" instead.
 
Here's an example flow, that uses its sibling KNX for Node-Red project ( <https://github.com/ekarak/node-red-contrib-eibd> ) to bind KNX and ZWave together as one happy home automation network:
![openzwave example](https://lh6.googleusercontent.com/-g4i3cJ_Anp8/VCG4uThDUQI/AAAAAAAAAvw/EoOagZZ8u34/s1600/teaser.png)
