/**
 * @file   roster.js
 * @author alvayang <alvayang@sohu-inc.com>
 * @date   Wed Jun 29 09:43:27 2011
 * 
 * @brief  提供TCP的服务.
 *         A simple Echo Server.
 *         the carrier component is comming from  https://github.com/pgte/carrier
 */
var net = require('net');
var carrier = require('./carrier');

(function(){
    var server = net.createServer(function(socket) {
	socket.on('connect', function(){
	    console.log('connect\n');
	});
	carrier.carry(socket, function(line){
	    console.log('line:' + line);
	    return socket.write("[Server Send]:" + line + '\n');
	});
    });
    server.listen(22222, function(){
	console.log("server running at: tcp://0.22222");
    });
})();


