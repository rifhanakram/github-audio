#!/usr/bin/env nodejs

var express = require('express');
var app = express();
var request = require("request");  // To make HTTP requests at the server side

var server = require('http').Server(app);
var io = require('socket.io')(server);

var helmet = require('helmet');  // To change response headers

// To temporarily store JSON data from GitHub and also
// the number of connected users
// var redis = require("redis"),
//     redis_client = redis.createClient();

var path = require('path');

const logger = require('./logger');
const argv = require('minimist')(process.argv.slice(2));
const isDev = process.env.NODE_ENV !== 'production';

// Get the intended port number, use port 8000 if not provided
const port = argv.port || process.env.PORT || 8000;
server.listen(port, (err) => {
  if(err){
    return logger.error(err.message);
  }
});
if(isDev)
  logger.appStarted(port, 'http://localhost');
else
  logger.appStarted(port);

// Apply security middlewares
app.use(helmet());

// Remove x-powered-by header
app.disable('x-powered-by');

// server static files
app.use('/static', express.static('app'));

// Load main web page
app.get('/', function (req, res) {
  res.sendFile(path.resolve('app/index.html'));
});

//twitter

var Twitter = require('twitter');

var client = new Twitter({
  consumer_key: 'LCA15Mn8xJeZtVCMrQxSFzZCJ',
    consumer_secret: 'xCgGISwHRM7WfGoewAlEurlo6zdJmiqinb6NUQ4mLTIx1RC8XR',
  access_token_key: '1843922168-jQCnVmptUsCRLWX207fjl6DHZbEwGhzpvK02RKu',
    access_token_secret: 'nscpVmRnqB0hUAsu5q4kaeDM6fx9kek3nkowgVjGmoet3'
});


var allClients = [];

// When a socket connection is created
io.on('connection', function (socket) {
  allClients.push(socket);
  //redis_client.incr('connected_users');
  socket.on('disconnect', function() {
     logger.v('Got disconnect!');
     var i = allClients.indexOf(socket);
     allClients.splice(i, 1);

     //redis_client.decr('connected_users');
  });
  socket.on('error', function(){
    logger.error('Got errored!');
    //redis_client.decr('connected_users');
  })
});

//twitter
function fetchDataFromTwitter() {
  client.stream('statuses/filter', { track:'#99XTHackathon' },function(stream){
    stream.on('data', function(tweet) {
      console.log('tweeetsssss', tweet);
      io.emit('tweet', { tweet: tweet });
    });
    stream.on('error',function(error) {
      console.log(error);
    });
  });
}

fetchDataFromTwitter();
// setTimeout(fetchDataFromTwitter, 2000);
//twitter


// Function to get events from GitHub API
function fetchDataFromGithub(){
  var options = {
    url: 'https://api.github.com/events',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 5.1.1; Nexus 5 Build/LMY48B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/43.0.2357.65 Mobile Safari/537.36',
      'Authorization': 'token ' + '3a2cda4f2db1a6c21df48d6c1f55bbd309c9d4de'
    }
  };
  request(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var data = JSON.parse(body);
      var stripedData = stripData(data);  // Keep only useful keys
      allClients.forEach(function(socket){  
        if(socket != null && socket.connected == true){
            // redis_client.get('connected_users', function(err, count) {
            //     if(!err && count != null){
              console.log('emiting');
                     socket.volatile.json.emit('github', {data: stripedData, connected_users: allClients.length});
            //     }else{
            //       logger.error(err.message);
            //     }
            // });
        }
      });

    }else{
      logger.error("GitHub status code: " + response.statusCode + body);
    }
  })
  setTimeout(fetchDataFromGithub, 2000);
}
setTimeout(fetchDataFromGithub, 2000);


function stripData(data){
  var stripedData = [];
  var pushEventCounter = 0;
  var IssueCommentEventCounter = 0;
  var IssuesEventCounter = 0;
  data.forEach(function(data){
    if(data.type == 'PushEvent'){
      if(pushEventCounter > 3) return;
      if(data.payload.size != 0){
        stripedData.push({
          'id': data.id,
          'type': data.type,
          'user': data.actor.display_login,
          'user_avatar': data.actor.avatar_url + 'v=3&s=64',
          'repo_id': data.repo.id,
          'repo_name': data.repo.name,
          'payload_size': data.payload.size,
          'message': data.payload.commits[0].message,
          'created': data.created_at
        });
        pushEventCounter++;
      }
    }else if(data.type == 'IssueCommentEvent'){
      stripedData.push({
        'id': data.id,
        'type': data.type,
        'user': data.actor.display_login,
        'user_avatar': data.actor.avatar_url + 'v=3&s=64',
        'repo_id': data.repo.id,
        'repo_name': data.repo.name,
        'payload_size': 0,
        'message': data.body,
        'created': data.created_at
      });
    }else if(data.type == 'PullRequestEvent'){
      stripedData.push({
        'id': data.id,
        'type': data.type,
        'user': data.actor.display_login,
        'user_avatar': data.actor.avatar_url + 'v=3&s=64',
        'repo_id': data.repo.id,
        'repo_name': data.repo.name,
        'action': data.payload.action,  // opened, reopened, closed, merged
        'message': data.payload.pull_request.title,
        'created': data.created_at
      });
    }else if(data.type == 'IssuesEvent'){
      stripedData.push({
        'id': data.id,
        'type': data.type,
        'user': data.actor.display_login,
        'user_avatar': data.actor.avatar_url + 'v=3&s=64',
        'repo_id': data.repo.id,
        'repo_name': data.repo.name,
        'action': data.payload.action,  // opened, reopened, closed
        'message': data.payload.issue.title,
        'created': data.created_at
      });
    }
  });
  return stripedData;
}
