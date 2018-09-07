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


var callRate = 10
setInterval(Update,1000/callRate)

var package = {}

function Update()
{

  CheckPlayerCollision()
  CheckWinCondition()


  package['players'] = players
  package['flags'] = flags

  io.sockets.emit('FULL_PACKAGE',package)
  //reset package
  package = {}
}

function CheckPlayerCollision()
{
  for(var each_player_ID in players)
  {
    //IF THIS WAS MY UPDATE => PLAYER RESPONSIBLE FOR HIS OWN COLLISIONS
    var eachPlayer = players[each_player_ID]

    for(var other_player_ID in players)
    {
        //ignore if is same himself
        if(other_player_ID == each_player_ID)
        {
            continue
        }

        var other_player = players[other_player_ID]
        var vectorFromMeToPlayer = Vector2Subtraction(other_player.pos,eachPlayer.pos)
        var distanceFromMeToPlayer = Vector2Magnitude(vectorFromMeToPlayer)
        var minDistance = other_player.stats.diameter/2 + eachPlayer.stats.diameter/2
        //NOTE: DO THIS CHECK ONLY FOR THIS PLAYER
        //      MEANING == CHECK THAT THIS PLAYER HAS COLLIDED WITH OTHERS ONLY
        
        // console.log(minDistance)
        // console.log(distanceFromMeToPlayer)
        if(distanceFromMeToPlayer < minDistance)
        {
            var dirVector = Vector2Divide(vectorFromMeToPlayer,distanceFromMeToPlayer)
            var pointOfContact = Vector2Addition(eachPlayer.pos,Vector2Multiply(dirVector,eachPlayer.stats.diameter/2))  //NOTE: USES MY PLAYER DIAMETER BECAUSE IM CHECKING FROM MYSELF...??

            //POINT OF COLLISION
            if(other_player.team != eachPlayer.team) //SMTH MUST HAPPEN
            {
                if (other_player.captured == false && eachPlayer.captured == false) 
                {
                    if (pointOfContact.x > CANVAS_DIMENSIONS.width / 2) //if contact green side and i am green
                    {
                        if (eachPlayer.team == 1) //if it was my side
                        {
                            //he gets caught
                            PlayerCaught(other_player)

                        }
                        else //it was his side
                        {
                            //i get caught
                            PlayerCaught(eachPlayer)
                        }
                    }
                    else {
                        if (eachPlayer.team == 0) //if it was his side
                        {
                            //he gets caught
                            PlayerCaught(other_player)
                        }
                        else //it was his side
                        {
                            //i get caught
                            PlayerCaught(eachPlayer)
                        }
                    }
                }
            }
            else
                {
                    //FREEEEEEEEEEDOOMMMMMMMM
                    if(!(other_player.captured && eachPlayer.captured)) //if not both captured
                    {
                        if(other_player.captured) //if he was the one captured
                        {
                          PlayerFreed(other_player)
                        }
                        else //if i was captured
                        {
                          PlayerFreed(eachPlayer)
                        }
                    }
                }

        }

    }
  }
}

function CheckWinCondition()
{
  for(var flag of flags)
  {
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
    
    console.log('user disconnected: ' + socket.id);
  });

  socket.on('PLAYER_MOVED',function(pos){

    if(!GAME_IN_PROGRESS)
    {
      return
    }

    //============================== UPDATE PLAYER POSITION ==============================
    players[socket.id].pos = pos

    //============================== UPDATE FLAG DATA ==============================
    for(var index in flags)
    {
      var flag = flags[index]

      if(flag.captured)
      {  
        //============================== UPDATE FLAG POSITION ==============================
        flags[index].pos = players[flag.capturer_id].pos
      }
      else
      {
        //============================== FLAG CAPTURING ==============================
        if(ShouldFlagBeCaptured(players[socket.id],flag))
        {
          FlagCapturedBy(players[socket.id],flag)
        }
      }
    }
    

  });
   
});

function PlayerCaught(player_caught)
{
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

   //Update player state (flag drop first)
   players[player_caught.id].captured = true
   players[player_caught.id].pos = player_caught.team==0?GREEN_SPAWN:RED_SPAWN
}


function PlayerFreed(player_freed){
  players[player_freed.id].captured = false
}

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

  if(distancePlayerFromFlag <= minDistFromFlag)
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
  SendAllClients('SCORE',score)
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
  // io.sockets.emit('RESET',players,flags)
  SendAllClients('RESET',{players: players,flags: flags})
}

function BeginCountdown()
{
  //SendAllClients('COUNTDOWN_BEGIN',1)
  SendAllClients('COUNTDOWN_BEGIN',1)

  // io.sockets.emit('SERVER_EVENT',ServerMessageObject('COUNTDOWN_BEGIN'))
  setTimeout(function(){
    //GAME STARTED 
    GAME_IN_PROGRESS = true
    SendAllClients('GAME_BEGIN',1)
    // io.sockets.emit('SERVER_EVENT',ServerMessageObject('GAME_BEGIN'))
  },3000)
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
      speed : 2000,
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


function SendAllClients(key,params)
{
  package[key] = params
}