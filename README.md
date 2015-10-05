### Decription

*OpenZWave* nodes for Node-Red ( <http://nodered.org/> ). Uses the *shared* OpenZWave addon for Node.js ( <https://github.com/ekarak/node-openzwave-shared> ).
Integrating this node onto your Node-Red installation enables you to have **bidirectional integration with ZWave networks**, ie you can:
- *send commands* to ZWave devices by sending special command messages in Node-Red flows
- *have ZWave devices report their status* as messages injected into Node-Red flows as feedback

#### Nodes in this package

- *zwave-controller* : a unique CONFIG node that holds configuration for initializing OpenZWave and will act as the encapsulator for OZW access. As a node-red 'config' node, it cannot be added to a graph, but it acts as a singleton object that gets created in the the background when you add 'zwave-in' or 'zwave-out' nodes and configure them to point to a ZWave USB controller (usually /dev/ttyUSB0). It also holds the state for the openZWave library which is useful across flow edits (you surely don't want to wait for OpenZWave to reinitialise when you change your flows!)

- *zwave-out* : use this to send arbitrary commands to the ZWave appliances.  For the moment there are four commands supported, namely:

 - `{topic: 'switchOn',  payload: {"nodeid":2}}`  ==> to switch on basic switch on ZWave node #2

 - `{topic: 'switchOff', payload: {"nodeid":2}}`  ==> to switch off basic switch on ZWave node #2

 - `{topic: 'setLevel', payload: {"nodeid": 5, "value": 50}}`  ==> set level on dimmer on ZWave node #5 to 50%

 - `{topic: 'setValue', payload: {"nodeid":5, "cmdclass":38, "value":50}}` ==> same effect as above, set dimmer on ZWave node #5 to 50% using command class 38 (cmdClassSwitchMultilevel)

  The `setValue` topic is the most flexible, as you can send arbitrary ZWave values to the unlderlying OpenZWave library. Currently only "plain/basic" datatypes are supported (ints, floats etc), more complex ones, eg values with units such as thermostat setpoints are not yet supported. Use this topic (setValue) to control multi-instance devices (such as the Fibaro FGS-221), where one single ZWave node controls multiple endpoints/relays. To control such devices, simply specify a valid instance (0 or 1 for the FGS-221):

   - `{topic: 'setValue', payload: {"nodeid":8, "instance":1, "value":1}}`   ==> switch on the 2nd relay of multiswitch #8

  For a full list of ZWave command classes, see <http://wiki.micasaverde.com/index.php/ZWave_Command_Classes>
  
  - **(New since version 1.1.0)** Experimental support for the *full OpenZWave API*: 
  You can try passing ANY of the commands accepted by openzwave-shared (which
  should be `properlyCamelCased` (convention is that `Manager::HealNetwork` 
  would be called as `healNetwork'), followed by a `payload` whose contents 
  is simply a JSON array of the command arguments **in the correct order**.
  
  - For example, to enable polling for ZWave node #5 for the on-off command class (0x25 == decimal 37):
    - `{"topic": "enablePoll", "payload": [5, 37]}`

- *zwave-in* : a node that emits ZWave events as they are emitted from the ZWave controller. Use this node to get status feedback about what is happening in real time in your ZWave network. For example, the following message is injected into the NR flow when ZWave node #9, a binary switch, is turned on:

`{"topic":"zwave: value changed","payload":{"nodeid":9,"cmdclass":37,"instance":1,"cmdidx":0,"oldState":false,"currState":true}}`

*Important note*: You should wait for a message with topic of `scan complete` when booting up your flow, before you start sending commands to ZWave, otherwise your commands will be ignored.


#### Installation

This package has one sole dependency: [node-openzwave-shared](https://github.com/OpenZWave/node-openzwave-shared). This is a fork of node-openzwave *that links to OpenZWave as a shared library*, therefore you *need to have the OpenZWave library installed in your system beforehand*, using the operating system's package manager, or by compiling OpenZWave yourself. Please take a look [at the Installation section of node-openzwave-shared README](https://github.com/OpenZWave/node-openzwave-shared#install) for more details on this matter.

#### Example

Here's an example flow, that uses its sibling KNX for Node-Red project ( <https://github.com/ekarak/node-red-contrib-eibd> ) to bind KNX and ZWave together as one happy home automation network:

![openzwave example](https://lh6.googleusercontent.com/-g4i3cJ_Anp8/VCG4uThDUQI/AAAAAAAAAvw/EoOagZZ8u34/s1600/teaser.png)
