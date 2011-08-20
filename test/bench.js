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
    while(i < 1000){
	(function(){
	    pool.get_connection(function(connect){
		console.log("logic b get connection:", connect.connection_index, i);
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
    var timer = function(){
	var  i = 0;
	while(i < 10){
	    console.log('now:', i);

	    process.nextTick(function(){
		//console.log('running');
		pool.get_connection(function(connect){
		    //console.log("logic a get connection:", connect.connection_index);
		    connect.on('data', function(line){
			pool.release(connect);
			console.log(line);
			//var lines = line.split("\n");
			encoding = 'utf8';
			var decoded = line.toString(encoding);
			var lines = decoded.split("\n");
			if (decoded.charAt(decoded.length - 1) == "\n") {
			    // get rid of last "" after last "\n"
			    lines.pop(1);
			}
			if (lines.length > 0) {
			    lines.forEach(function(one_line, index) {
				console.log(one_line);
				line += one_line;
				var emit = true;
				if (index == lines.length - 1) {
				    if (decoded.charAt(decoded.length - 1) != "\n") {
					emit = false;
				    }
				}
				if (emit) {
				    line = '';
				}
			    });
			    console.log(line);
			}
		    });
		    try{
			console.log('send');
			connect.write("aaaa\n");
		    }catch(e){
			console.log(e.message);
		    }
		}, true);
	    });
	    i++;
	}
	clearInterval(timer);
    }
    setInterval(timer, 1000);
}

//pool.init(main);
function main(){
    //console.log("main called");
    process.nextTick(function(){
	logica();
    });
    // process.nextTick(function(){
    // 	logicb();
    // });
}
var config = {port : 22222, host : '127.0.0.1', minsize : 1, maxsize : 2, callback : main};
var pool = poolmodule.pool(config);

//main();
