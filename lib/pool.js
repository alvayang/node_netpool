/**
 * @file   pool.js
 * @author alvayang <alvayang@sohu-inc.com>
 * @date   Wed Jul 13 17:08:04 2011
 * 
 * @brief  TCP链接池.
 *         参数列表:
 * {
 *    minsize : '最小链接数',
 *    maxsize : '最大连接数',
 *    timeout : '链接超时时间(s)',
 *    errback : '出错的callback',
 *    callback : '初始化完成后的callback',
 *    reuse : '使用次数'
 * }
 * 
 */

var net = require('net'),
events = require('events'),
util = require('util');
var ConnectionPool = function(config){
    var self = this;
    self.pool = [];
    /// 等待的callback queue.hmm,等待事件触发的时候,就可以分配了.
    self.waitpool = [];
    self.minsize = config.minsize || 5;
    self.maxsize = config.maxsize || 10;
    /// 超时的时长,单位秒
    self.init_timeout = config.timeout || 5;
    self.cursize = 0;
    self.readysize = 0;
    /// 初始化错误回调
    self.errback = config.errback;
    /// 初始化成功回调
    self.callback = config.callback;
    /// 重试次数.
    self.retry_times = config.retry_times || 10;
    self.retry = 0;
    self.maxreuse = config.reuse || 20;
    
    /// 用于存储配置文件
    /**
     * config:{port : xxx, host : xxx, maxsize: 10, minsize : 5}
     * port : server port
     * host : server host
     * maxsize : 最大缓存数量
     * minsize : 最小缓存数量
     * callback: 初始化完成后的callback
     * errback : 初始化失败的callback
     */
    self.config = config;

    /** 
     * 超时时候的处理方法
     * 
     * 
     * @return 
     */
    var init_timeout = function(){
	clearTimeout(self.init_timer);
	self.init_timer = null;
	delete self.init_timer;
	if(self.readysize != self.minsize){
	    try{
		self.errback();
		return;
	    }catch(e){}
	}
    }

    // 设置定时器
    self.init_timer = setTimeout(init_timeout, self.init_timeout * 1000);

    /** 
     * 创建链接.
     * 如果已经到了最大的链接池数量,则返回false
     * 
     * @return 链接句柄|false
     */
    self.createConnection = function(){
	if(self.cursize >= self.maxsize){
	    console.log("not enough size:", self.cursize, self.maxsize);
	    return false;
	}
	console.log('new connection');
	var z = net.createConnection(self.config.port, self.config.host);
	self.cursize++;
	z.connection_index = self.cursize;
	z.use_time = 0;
	z.on('connect', function(){
	    self.retry = 0;
	    self.pool.push(this);
	    console.log('connected');
	    self.emit('entertain_guest', null);
	});
	z.on('close', function(e){
	    // 设置一个超时.此时的this是一个connection对象.okey,重新链接它.
	    // connect被关闭了,那么这时候应该主动放弃当前的这个链接,重新创建一个链接出来顶替.
	    delete this;
	    this = null;
	    self.cursize--;
	    self.createConnection();
	});
	z.on('error', function(e){
	    delete this;
	    this = null;
	    self.cursize--;
	    self.createConnection();
	});
	return null;
    };

    /** 
     * 初始化
     * 
     * @param callback 如果带有callback的话,将执行callback
     * 
     * @return 
     */
    self.init = function(callback){
	for(var i = 0; i < self.minsize; i++){
	    console.log('create connection');
	    self.createConnection();
	}
    };

    /** 
     * 验证一个connection是否可读写.
     * 
     * @param connection 
     * 
     * @return 
     */
    self.valid_connection = function(connection){
	return (true && connection['readable']) && connection['writable'];
    }


    self.on('entertain_guest', function(){
	if(self.waitpool.length > 0 && self.pool.length > 0){
	    var call = self.waitpool.shift();
	    var conn = self.pool.shift();
	    if(!self.valid_connection(conn)){
		//bad link, let's fuck
		console.log('bad connection');
		delete conn;
		conn = null;
		self.cursize--;
		self.createConnection();
	    }
	    try{
		//console.log('callback', conn, call);
		console.log('callback', conn.connection_index);
		call(conn);
	    }catch(e){
		console.log(e.message);
	    }
	}
	if(self.waitpool.length > 0 && self.pool.length > 0){
	    process.nextTick(function(){
		self.emit('entertain_guest', null);
	    });
	}
    });

    /** 
     * 发起一个请求
     * 
     * @param callback 当得到链接的时候的回调函数.callback(connection)
     * @param wait 如果链接池为空,是否等待.默认等待
     * 
     * @return 
     */

    self.get_connection = function(callback){
	self.waitpool.push(callback);
	if(self.waitpool.length > self.pool.length){
	    self.createConnection();
	}
	self.emit("entertain_guest", null);
    };

    /** 
     * 释放链接到链接池
     * 
     * @param connection 要释放的句柄.
     * 
     * @return 
     */
    self.release = function(connection){
	// 因为我的error是最先绑定的,那么肯定是在队列的尾巴上,因此.弹出上面的,就是保住了最下面的.
	console.log('release');

	try{
	    if(connection._events['close'].length > 1){
		(connection._events['close']).pop();
	    }
	    if(connection._events.hasOwnProperty('end') && connection._events['end'].length > 0){
		(connection._events['end']).pop();
	    }
	    delete connection._events['data'];
	    connection._events['data'] = null;
	}catch(e){
	    console.log(e.message);
	}
	connection.use_time++;
	console.log("REUSE:", self.maxreuse, connection.use_time);

/*	
	if(connection.use_time > self.maxreuse){
	    console.log("SO, IT's HAPPEN");
	    connection.end();
	    delete connection;
	    connection = null;
	    self.cursize--;
	    self.createConnection();
	}
*/
	// 如果链接okey的话,入队,并发送信号,否则...否则...就是重新创建的逻辑了.
	if(connection){
	    console.log('free, and emit', self.pool.length);
	    self.pool.push(connection);
	    self.emit('entertain_guest', null);
	}

    };

    /** 
     * 通过status方法返回一些队列的信息.
     * 
     * 
     * @return 
     */
    self.status = function(){
	//console.log("Pool Size:", self.pool.length);
    }
    if(self.config.callback){
	self.waitpool.push(self.config.callback);
    }
    self.init();

}
util.inherits(ConnectionPool, events.EventEmitter);
exports.pool = function(config){
    return new ConnectionPool(config);
}
