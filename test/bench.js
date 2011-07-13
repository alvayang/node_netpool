/**
 * @file   bench.js
 * @author alvayang <alvayang@sohu-inc.com>
 * @date   Wed Jul 13 21:14:38 2011
 * 
 * @brief  a client
 * 
 * 
 */


var carrier = require('./carrier');
var poolmodule = require('../lib/pool');

function logicb(){
    var  i = 0;
    while( i < 10 ){
	(function(){
	    pool.get_connection(function(connect){
		console.log("logic b get connection:", connect.connection_index);
		var carry = carrier.carry(connect);
		carry.on('line', function doline(line){
		    console.log("in logic b:", line);
		    pool.release(carry.reader);	    
		    pool.status();
		});
		connect.write("bbb\n");
	    }, true);
	})();
	i++;
    }
}

function logica(){
    var  i = 0;
    while( i < 10 ){
	(function(){
	    pool.get_connection(function(connect){
		console.log("logic a get connection:", connect.connection_index);
		var carry = carrier.carry(connect);
		carry.on('line', function doline(line){
		    console.log("in logic a : ", line);
		    pool.release(carry.reader);
		    pool.status();
		});
		connect.write("aaaa\n");
	    }, true);
	})();
	i++;
    }
}

//pool.init(main);
function main(){
    console.log("main called");
    process.nextTick(function(){
	logica();
    });
    process.nextTick(function(){
	logicb();
    });
}
var config = {port : 22222, host : '127.0.0.1', minsize : 1, maxsize : 2, callback : main};
var pool = poolmodule.pool(config);

//main();
