var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io').listen(http)


const THIS_PLAYER_CONNECTED = 1

const CANVAS_DIMENSIONS = {width: 1000,height: 600}
const SPAWN_PADDING = 70
const RED_SPAWN = {x: SPAWN_PADDING,y: CANVAS_DIMENSIONS.height/2}
const GREEN_SPAWN = {x:CANVAS_DIMENSIONS.width-SPAWN_PADDING,y: CANVAS_DIMENSIONS.height/2}

app.use('/js',express.static(__dirname + "/public/js"))
app.use('/assets',express.static(__dirname + "/public/assets"))

app.get('/', function(req, res){
  res.sendFile(__dirname+'/index.html');
});

http.listen(3000, function(){
  console.log('listening on 3000');
});

var players = {}
var flags = []
var score = {
  "0": 0,
  "1": 0
}

var GAME_IN_PROGRESS = false


var callRate = 60
setInterval(Update,1000/callRate)

var package = []

function Update()
{
  io.sockets.emit('FULL_PACKAGE',package)
  //reset package
  package = []
}


io.on('connection', function (socket) {

  if(flags.length == 0)
  {
    var greenFlag = NewFlagObject(GREEN_SPAWN,1)
    var redFlag = NewFlagObject(RED_SPAWN,0)
    flags.push(greenFlag)
    flags.push(redFlag)

    GAME_IN_PROGRESS = true
  }

  console.log('a user connected: ' + socket.id);

  var startPos = {x: 200, y: 200}

  var teamToAddPlayerTo = DecideNewPlayerTeam();
  var newPlayer = NewPlayerObject(socket.id,startPos,teamToAddPlayerTo);

  newPlayer.pos = teamToAddPlayerTo==0? RED_SPAWN : GREEN_SPAWN
  players[socket.id] = newPlayer; 

  socket.emit('ON_CONNECTED',players)
  socket.emit('FLAGS_CREATED',flags)
  socket.broadcast.emit('NEW_PLAYER_CONNECTED',players)
  
  socket.on('disconnect', function () {
    
    socket.broadcast.emit('PLAYER_DISCONNECTED',players[socket.id])
    delete players[socket.id]

    //if flag carrier disconnects, drop flag
    //Should flag be dropped
    var flagNeedsUpdate = false
    for (var flag of flags) 
    {
      if (flag.captured && flag.capturer_id == socket.id) 
      {
        FlagDropped(flag)
        flagNeedsUpdate = true
      }
    }

    if (flagNeedsUpdate) 
    {
      io.sockets.emit('FLAGS_DATA_UPDATED', flags);
    }
    
    console.log('user disconnected: ' + socket.id);
  });

  socket.on('PLAYER_MOVED',function(pos){

    if(!GAME_IN_PROGRESS)
    {
      return
    }

    var player = players[socket.id]
    player.pos = pos


    var item = {
      name : 'PLAYERS_DATA_UPDATE',
      params: player
    }
    package.push(item)
    
    // io.sockets.emit('PLAYERS_DATA_UPDATE',player); //update this one player

    var flagNeedsUpdate = false
    for(var index in flags)
    {
      var flag = flags[index]

      if(flag.captured)
      {  
        //============================== UPDATE FLAG POSITION ==============================
        flags[index].pos = players[flag.capturer_id].pos
        flagNeedsUpdate = true

        //============================== FLAG WIN CONDITION ==============================
        if(flag.pos.x > CANVAS_DIMENSIONS.width/2) //if on green side
        {
          if (flag.team == 0)
          {
            //win
            TeamScored(1)
            ResetMap()
            BeginCountdown()
          }
        }
        else
        {
          if (flag.team == 1)
          {
            //win
            TeamScored(0)
            ResetMap()
            BeginCountdown()
          }
        }
      }
      else
      {
        //============================== FLAG CAPTURING ==============================
        if(ShouldFlagBeCaptured(player,flag))
        {
          FlagCapturedBy(player,flag)
          flagNeedsUpdate = true
        }
      }
    }

    //============================== FLAG UPDATING ==============================
    if(flagNeedsUpdate)
    {
      io.sockets.emit('FLAGS_DATA_UPDATED',flags);
    }
  });

  socket.on('PLAYER_CAUGHT',function(player_caught){
    //Should flag be dropped
    var flagNeedsUpdate = false
    for(var flag of flags)
    {
      if(flag.captured && flag.capturer_id == player_caught.id)
      {
        FlagDropped(flag)
        flagNeedsUpdate = true
      }
    }
  
    if(flagNeedsUpdate)
    {
      io.sockets.emit('FLAGS_DATA_UPDATED',flags);
    }

    //Update player state (flag drop first)
    var player = players[player_caught.id]
    player.captured = true
    player.pos = player_caught.team==0?GREEN_SPAWN:RED_SPAWN
    
    //Update player position
    io.sockets.emit('PLAYERS_DATA_UPDATE',player);
  })

  socket.on('PLAYER_FREED',function(player_freed){
    var player = players[player_freed.id]
    player.captured = false

    io.sockets.emit('PLAYERS_DATA_UPDATE',player);
  })
});

function DecideNewPlayerTeam()
{
    var red_count = 0
    var green_count = 0

    for(var playerID in players)
    {
      var player = players[playerID]

      if (player.team == 0)
      {
        red_count+=1 
      }
      else
      {
        green_count+=1
      } 
    }

    if(green_count <= red_count)
    {
      return 1
    }
    else
    {
      return 0
    }
}



function ShouldFlagBeCaptured(player,flag)
{
  if(player.team == flag.team)
  {
    return false
  }

  var distancePlayerFromFlag = Vector2Magnitude(Vector2Subtraction(player.pos,flag.pos))
  var flagEstimatedWidth = 10
  var minDistFromFlag = player.stats.diameter/2 + flagEstimatedWidth

  if(distancePlayerFromFlag <= flagEstimatedWidth)
  {
    return true
  }
  else
  {
    return false
  }
}

function FlagCapturedBy(player,flag)
{
  flag.captured = true
  flag.capturer_id = player.id

  console.log("Flag captured by " + player.id)
}

function FlagDropped(flag)
{
  flag.captured = false
  flag.capturer_id = ""
}

function TeamScored(team)
{
  score[team] += 1
  console.log(JSON.stringify(score))
}

function ResetMap()
{
  for(var playerID in players)
  {
    players[playerID].pos = players[playerID].team==0 ? RED_SPAWN : GREEN_SPAWN 
  }

  for(var index in flags)
  {
    FlagDropped(flags[index])
    flags[index].pos = flags[index].team==0? RED_SPAWN : GREEN_SPAWN
  }

  GAME_IN_PROGRESS = false
  io.sockets.emit('RESET',players,flags)
}

function BeginCountdown()
{
  io.sockets.emit('SERVER_EVENT',ServerMessageObject('COUNTDOWN_BEGIN'))
  setTimeout(function(){
    //GAME STARTED 
    GAME_IN_PROGRESS = true
    io.sockets.emit('SERVER_EVENT',ServerMessageObject('GAME_BEGIN'))
  },3000)
}


function ServerMessageObject(code)
{
  return {
    what: code
  }
}

function NewPlayerObject(id,startPos,team)
{
  return {
    id : id,
    pos : startPos,
    old_pos : startPos,
    team : team,
    captured : false,
    hasFlag : false,
    stats : {
      speed : 400,
      diameter : 40,
    }
  }
}

function NewFlagObject(startPos,team)
{
  
  return {
    pos : startPos,
    team: team,
    captured: false,
    capturer_id: ""
  }
}


function Vector2Addition(vec1,vec2)
{
    return {x: vec1.x + vec2.x,y: vec1.y + vec2.y}
}

function Vector2Subtraction(vec1,vec2)
{
    return {x: vec1.x - vec2.x,y: vec1.y - vec2.y}
}

function Vector2Multiply(vec,value)
{
    return {x: vec.x * value,y: vec.y*value}
}

function Vector2Divide(vec,value)
{
    return {x: vec.x/value,y: vec.y/value}
}

function Vector2Magnitude(vec)
{
    return Math.sqrt(Math.pow(vec.x,2) + Math.pow(vec.y,2))
}
