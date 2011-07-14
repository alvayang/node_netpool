/**
 * @file   pool.js
 * @author alvayang <alvayang@sohu-inc.com>
 * @date   Wed Jul 13 17:08:04 2011
 * 
 * @brief  TCP链接池.
 * 
 * 
 */

/**
 * TODOS:
 * 错误检查.每个句柄都要有错误检查
 * 
 */

var net = require('net'),
events = require('events'),
util = require('util');

var ConnectionPool = function(config){
    self = this;
    self.pool = [];
    /// 等待的callback queue.hmm,等待事件触发的时候,就可以分配了.
    self.waitpool = [];
    self.minsize = config.minsize || 5;
    self.maxsize = config.maxsize || 10;
    self.cursize = 0;
    self.readysize = 0;
    /// 初始化错误回调
    self.errback = config.errback;
    /// 初始化成功回调
    self.callback = config.callback;
    
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
     * free事件.当free事件触发的时候,说明池中有可用的链接句柄.
     * 这时候可以从wait状态的func中取出一些,进行逻辑处理.
     * 同时做一下检查,如果有问题的话.hmm,就干掉重来.
     * 
     * @return 
     */
    self.on('free', function(){
	func = self.waitpool.shift();
	if(func){
	    //TODO: detect bad connections
	    connection = self.pool.shift();
	    if(!connection.writable) {
		connection = null;
		delete connection;
		self.cursize--;
		connection = self.createConnection();
	    }
	    func(connection);
	}
    });

    /** 
     * 链接事件.当一个链接成功后会触发一次.
     * 当触发的次数和传入的minsize相当的时候,就可以开启回调了.
     * 
     * @return 
     */
    self.on('connected', function(){
	self.readysize++;
	if(self.readysize == self.minsize){
	    console.log("They All Here");
	    clearTimeout(self.init_timer);
	    self.callback();
	} else {
	    console.log("Connected:", self.readysize, self.minsize);
	}
    });

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
	    console.log('init timeout');
	    self.errback();
	    return;
	}
    }

    // 设置定时器
    self.init_timer = setTimeout(init_timeout, 5000);

    /** 
     * 创建链接.
     * 如果已经到了最大的链接池数量,则返回false
     * 
     * @return 链接句柄|false
     */
    self.createConnection = function(){
	if(self.cursize >= self.maxsize){
	    return false;
	}
	var z = require('net').createConnection(self.config.port, self.config.host);
	self.cursize++;
	z.connection_index = self.cursize;
	z.on('connect', function(){
	    self.emit('connected', null);
	});
	return z;
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
	    self.pool.push(self.createConnection());
	}
	console.log("the pool was full inited");
    };


    /** 
     * 发起一个请求
     * 
     * @param callback 当得到链接的时候的回调函数.callback(connection)
     * @param wait 如果链接池为空,是否等待.默认等待
     * 
     * @return 
     */
    self.get_connection = function(callback, wait){
	if(wait === undefined){
	    wait = true;
	}
	if(self.pool.length > 0) {
	    connection = self.pool.shift();
	}else{
	    connection = self.createConnection(wait);
	    if(!connection){
		if(wait){
		    /**
		     * 如果线程池已经到了最大,那么应当在这里等待.
		     * 
		     */
		    self.waitpool.push(callback);
		}
		return;
	    }
	}
	return callback(connection);
    };

    /** 
     * 释放链接到链接池
     * 
     * @param connection 要释放的句柄.
     * 
     * @return 
     */
    self.release = function(connection){
	connection._events = null;
	delete connection._events;
	self.pool.push(connection);
	self.emit('free', null);
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
	self.init();
    }

}
util.inherits(ConnectionPool, events.EventEmitter);
exports.pool = function(config){
    return new ConnectionPool(config);
}