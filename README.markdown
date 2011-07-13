This module is a tcp pool for nodejs

## Install
   Just move the lib directory or the pool.js in to your node_modules


## Simple Usage:

    var config = {port : 22222, host : '127.0.0.1', minsize : 1, maxsize : 2, callback : main};
    var pool = poolmodule.pool(config);
    pool.get_connection(function(connect){
         var carry = carrier.carry(connect);
         carry.on('line', function doline(line){
	       pool.release(carry.reader);
         });
         connect.write("aaaa\n");
    });

See the bench.js in test directory.



