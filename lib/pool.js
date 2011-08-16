/**
 * @file   pool.js
 * @author alvayang <alvayang@sohu-inc.com>
 * @date   Wed Jul 13 17:08:04 2011
 * 
 * @brief  TCP链接池.
 * 
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
     * free事件.当free事件触发的时候,说明池中有可用的链接句柄.
     * 这时候可以从wait状态的func中取出一些,进行逻辑处理.
     * 同时做一下检查,如果有问题的话.hmm,就干掉重来.
     * 
     * @return 
     */
    self.on('free', function(connection){
	var func = self.waitpool.shift();
	if(func){
	    //TODO: detect bad connections
	    connection = self.pool.shift();
	    if(!self.valid_connection(connection)){
		connection = null;
		delete connection;
		self.cursize--;
		connection = self.createConnection();
		self.waitpool.unshift(func);
	    }else{
		func(connection);
	    }
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
	// hmm,这里可能会出现脏数据,好吧,忽略吧.忽略掉
	// alvayang @ 2011/07/19 15:20:42
	/**
	 * 为自己辩解下: 因为是异步的connected事件,
	 * 因此如果retry被置为0是不是会影响重连逻辑呢,我猜会,
	 * 不过影响面应当很小,试想一个链接如果创建成功了,
	 * 那么接下来的链接应该也是可以创建成功的,那么重试次数本身,没意义了应该.
	 * 
	 */
	self.retry = 0;
	if(self.readysize == self.minsize){
	    clearTimeout(self.init_timer);
	    self.callback();
	} else {
	    self.emit('free', null);
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
	    return false;
	}
	var z = require('net').createConnection(self.config.port, self.config.host);
	self.cursize++;
	z.connection_index = self.cursize;
	z.use_time = 0;
	z.on('connect', function(){
	    self.emit('connected', null);
	});
	z.on('close', function(e){
	    // 设置一个超时.此时的this是一个connection对象.okey,重新链接它.
	    if(self.retry <= self.retry_times){
		var timer;
		function reconnect(){
		    clearTimeout(timer);
		    self.createConnection();
		}
		timer = setTimeout(function(){
		    self.cursize--;
		    self.retry++;
		    // 检查一下pool,有问题的剔除掉.
		    var clear_queue = [];
		    for(var i = 0; i < self.pool.length; i++){
			if(!self.valid_connection(self.pool[i])){
			    clear_queue.push(i);
			}
		    }
		    clearTimeout(timer);
		    z = self.createConnection();
		    if(z){
			self.pool.push(z);
		    }
		}, 1000);
	    }
	});
	z.on('error', function(e){
	    var timer;
	    function reconnect(){
		clearTimeout(timer);
		self.createConnection();
	    }
	    timer = setTimeout(function(){
		self.cursize--;
		clearTimeout(timer);
		z = self.createConnection();
		if(z){
		    self.pool.push(z);
		}
	    }, 1000);
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
	var connection = null;
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
	if(self.valid_connection(connection)){
	    return callback(connection);
	}else{
	    // when the link is bad, try another one
	    return self.get_connection(callback, wait);
	    return;
	}
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
	try{
	    if(connection._events['close'].length > 1){
		(connection._events['close']).pop();
	    }
	    if(connection._events.hasOwnProperty('end') && connection._events['end'].length > 0){
		(connection._events['end']).pop();
	    }
	    connection._events['data'] = null;
	    delete connection._events['data'];
	}catch(e){
	    console.log(e.message);
	}
	connection.use_time++;
	if(connection.use_time > self.maxreuse){
	    delete connection;
	    connection = null;
	    self.cursize--;
	    connection = self.createConnection();
	}
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
