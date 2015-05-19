node-red-contrib-openzwave
==========================

*OpenZWave* nodes for Node-Red ( <http://nodered.org/> ). Uses the *shared* OpenZWave binding for Node.JS ( <https://github.com/ekarak/node-openzwave-shared> ), which is in turn forked off jperkin/node-openzwave to compile against Open ZWave shared library and patched to be able to handle multi-instance devices (as it was lacking the `_instance` field in OpenZWave ValueID's.)


*zwave-controller* : a unique CONFIG node that holds configuration for initializing OpenZWave and will act as the encapsulator for OZW access. As a node-red 'config' node, it cannot be added to a graph, but it acts as a singleton object that gets created in the the background when you add 'zwave-in' or 'zwave-out' nodes and configure them to point to a ZWave USB controller (usually /dev/ttyUSB0). It also holds the state for the openZWave library which is useful across flow edits (you surely don't want to wait for OpenZWave to reinitialise when you change your flows!)

*zwave-in* : a node that emits ZWave events as they are emitted from the ZWave controller. Use this node to get status feedback about what is happening in real time in your ZWave network. For example, the following message is injected into the NR flow when a ZWave node becomes ready for use:

`{ "topic": "zwave: node ready", "payload": { "nodeid": 9, "nodeinfo": { "manufacturer": "", "manufacturerid": "", "product": "", "producttype": "", "productid": "", "type": "Binary Switch", "name": "", "loc": "" } } }`

Ideally you should wait for a message with topic of 'scan complete' when booting up before you start sending commands to ZWave, otherwise your commands will be ignored.

*zwave-out* : use this to send arbitrary commands to the ZWave appliances.  For the moment there are four commands supported, namely:

 - `{topic: 'switchOn',  payload: {"nodeId":2}}`  ==> to switch on basic switch #2

 - `{topic: 'switchOff', payload: {"nodeId":2}}`  ==> to switch off basic switch #2

 - `{topic: 'setLevel', payload: {"nodeid": 5, "value": 50}}`  ==> set level on dimmer #5 to 50%

 - `{topic: 'setValue', payload: {"nodeid":5, "cmdclass":38, "value":50}}` ==> same effect as above, set dimmer #5 to 50% using command class 38 (cmdClassSwitchMultilevel)

The `setValue` topic is the most flexible, as you can send arbitrary ZWave values to the unlderlying OpenZWave library. Currently only "plain/basic" datatypes are supported (ints, floats etc), more complex ones, eg values with units such as thermostat setpoints are not yet supported. Use this topic (setValue) to control multi-instance devices (such as the Fibaro FGS-221), where one single ZWave node controls multiple endpoints/relays. To control such devices, simply specify a valid instance (0 or 1 for the FGS-221):
  
 - `{topic: 'setValue', payload: {"nodeid":8, "instance":1, "value":1}}`   ==> switch on the 2nd relay of multiswitch #8

For a full list of ZWave command classes, see <http://wiki.micasaverde.com/index.php/ZWave_Command_Classes>

Here's an example flow, that uses its sibling KNX for Node-Red project ( <https://github.com/ekarak/node-red-contrib-eibd> ) to bind KNX and ZWave together as one happy home automation network:
![openzwave example](https://lh6.googleusercontent.com/-g4i3cJ_Anp8/VCG4uThDUQI/AAAAAAAAAvw/EoOagZZ8u34/s1600/teaser.png)
