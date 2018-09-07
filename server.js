var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io').listen(http)


const THIS_PLAYER_CONNECTED = 1

const CANVAS_DIMENSIONS = {width: 1600,height: 800}
const PLAYER_DIAMETER_STANDARD = 40
const PLAYER_DIAMETER_MEDIUM = 30
const PLAYER_DIAMETER_SMALL = 20

const FLAG_HEIGHT = 40

const PRISON_HEIGHT = 400
const PRISON_WIDTH = 180
const PRISON_PADDING = 30
const RED_PRISON_RECT = Box(PRISON_PADDING,(CANVAS_DIMENSIONS.height-PRISON_HEIGHT)/2,PRISON_WIDTH,PRISON_HEIGHT)
const GREEN_PRISON_RECT = Box(CANVAS_DIMENSIONS.width-PRISON_WIDTH-PRISON_PADDING,(CANVAS_DIMENSIONS.height-PRISON_HEIGHT)/2,PRISON_WIDTH,PRISON_HEIGHT)

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


var callRate = 10


//#region SERVER LOBBY

var lobby = io.of('/lobby')

var rooms = {}

function CreateRoom(creator_socket)
{
  var newRoomName = GetNewRoomName()
  var newRoomSocket = io.of(newRoomName)
  var newRoom = NewRoomObject(newRoomName)
  rooms[newRoomName] = newRoom //ADD ROOM
  InitializeGameRoom(newRoomName)
  
  creator_socket.emit('ON_ROOM_CREATED',newRoomName) //TELL CLIENT HE CREATED ROOM
  creator_socket.emit('SET_NAMESPACE',newRoomName) //GET CLIENT TO CONNECT TO ROOM
  
  
  newRoomSocket.on('connection',function(socket){ //SET CALLBACKS FOR ROOM
    console.log('THIS ROOM JUST GOT A CONNECTION: ' + socket.id)
        
    NewPlayerConnectedToRoom(newRoomName,socket.id)

    socket.emit('JOINED_ROOM',newRoomName)
    socket.on('PLAYER_MOVED',function(request){

      if(!rooms[newRoomName].GAME_IN_PROGRESS)
      {
        return
      }

      //============================== RECEIVE PLAYER REQUEST TO CHANGE POSITION ==============================
      var thisPlayer = rooms[newRoomName].players[socket.id]              
      var oldPos = thisPlayer.pos
      
      var vector = {x:request.x-oldPos.x,y: request.y-oldPos.y} //FROM PLAYER TO MOUSE
      var magnitude = Vector2Magnitude(vector)
      
      if(magnitude > 5)
      {
          var newPosDir = Vector2Divide(vector, magnitude) //direction vector of where to head
          
          //PUSH TO DATA, UPDATE WILL OCCUR IN UPDATE QUEUE
          rooms[newRoomName].players[socket.id].newPosDir = newPosDir
          rooms[newRoomName].players[socket.id].newPosRequestMagnitude = magnitude //The request has a limit
          rooms[newRoomName].players[socket.id].sprint = request.sprint
      }
    });

    socket.on('disconnect',function(){

      socket.broadcast.emit('PLAYER_DISCONNECTED',rooms[newRoomName].players[socket.id])
      
      console.log('PLAYER LEFT ROOM: ' + socket.id)
      delete rooms[newRoomName].players[socket.id]

      //if flag carrier disconnects, drop flag
      //Should flag be dropped
      for (var flag of rooms[newRoomName].flags) 
      {
        if (flag.captured && flag.capturer_id == socket.id) 
        {
          FlagDropped(newRoomName,flag)
        }
      }
      
      if(Object.keys(rooms[newRoomName].players).length == 0)
      {
        rooms[newRoomName] = null //delete the room
      }
    })
  })

}

var roomNameCounter = 0
function GetNewRoomName()
{
  roomNameCounter+=1
  return "/room-" + roomNameCounter
}


//#endregion

setInterval(Update,1000/callRate)



function Update()
{

  for(var roomName in rooms)
  {
    if(rooms[roomName] == null)
    {
      continue
    }

    UpdateFlagPosition(roomName)
    UpdatePlayerPosition(roomName)
    CheckPlayerCollision(roomName)
    CheckWinCondition(roomName)

    rooms[roomName].package['players'] = rooms[roomName].players
    rooms[roomName].package['flags'] = rooms[roomName].flags
    io.of(roomName).emit('FULL_PACKAGE',rooms[roomName].package)

    rooms[roomName].package = {}
  }

  // var copy = package
  // setTimeout(() => {
  //   Emit(copy)
  // }, 6000);
  //reset package
  
}


function CheckPlayerCollision(roomName)
{
  for(var each_player_ID in rooms[roomName].players)
  {
    //IF THIS WAS MY UPDATE => PLAYER RESPONSIBLE FOR HIS OWN COLLISIONS
    var eachPlayer = rooms[roomName].players[each_player_ID]

    for(var other_player_ID in rooms[roomName].players)
    {
        //ignore if is same himself
        if(other_player_ID == each_player_ID)
        {
            continue
        }

        var other_player = rooms[roomName].players[other_player_ID]
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
                            PlayerCaught(roomName,other_player)

                        }
                        else //it was his side
                        {
                            //i get caught
                            PlayerCaught(roomName,eachPlayer)
                        }
                    }
                    else {
                        if (eachPlayer.team == 0) //if it was his side
                        {
                            //he gets caught
                            PlayerCaught(roomName,other_player)
                        }
                        else //it was his side
                        {
                            //i get caught
                            PlayerCaught(roomName,eachPlayer)
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

function CheckWinCondition(roomName)
{
  for(var flag of rooms[roomName].flags)
  {
    //============================== FLAG WIN CONDITION ==============================
    if(flag.pos.x > CANVAS_DIMENSIONS.width/2) //if on green side
    {
      if (flag.team == 0)
      {
        //win
        TeamScored(roomName,1)
        ResetMap(roomName)
        BeginCountdown(roomName)
      }
    }
    else
    {
      if (flag.team == 1)
      {
        //win
        TeamScored(roomName,0)
        ResetMap(roomName)
        BeginCountdown(roomName)
      }
    }
  }
}

function UpdateFlagPosition(roomName)
{
  //============================== UPDATE FLAG DATA ==============================
  for(var index in rooms[roomName].flags)
  {
    var flag = rooms[roomName].flags[index]

    if(flag.captured)
    {  
      //============================== UPDATE FLAG POSITION ==============================
      rooms[roomName].flags[index].pos = rooms[roomName].players[flag.capturer_id].pos
    }
    else
    {
      //============================== FLAG CAPTURING ==============================
      for(var playerID in rooms[roomName].players)
      {
        if(ShouldFlagBeCaptured(rooms[roomName].players[playerID],flag))
        {
          FlagCapturedBy(rooms[roomName].players[playerID],flag)
        }
      }
    }
  }
}

function UpdatePlayerPosition(roomName)
{
  var deltaTime = 1000/callRate
  for(var playerID in rooms[roomName].players)
  {
    var newPosDir = rooms[roomName].players[playerID].newPosDir
    
    if(newPosDir == null)
    {
      //Player did not request this round
      continue
    }

    var thisPlayer = rooms[roomName].players[playerID]

    var requestMagnitude = thisPlayer.newPosRequestMagnitude
    var multiplier = thisPlayer.sprint ? 2: 1
    var newPosDirMagnitude = deltaTime*thisPlayer.stats.speed/1000*multiplier
    var finalMagnitude = Math.min(requestMagnitude,newPosDirMagnitude)

    var newPos = Vector2Addition(thisPlayer.pos,Vector2Multiply(newPosDir,finalMagnitude))
    
    //limit
    var box;

    if(thisPlayer.captured)
    {
        box = thisPlayer.team==1 ? RED_PRISON_RECT : GREEN_PRISON_RECT
    }
    else
    {
        box = Box(0,0,CANVAS_DIMENSIONS.width,CANVAS_DIMENSIONS.height)
    }

    var finalPos = PositionLimitedByBox(box,thisPlayer.stats.diameter,newPos)
    rooms[roomName].players[playerID].pos = finalPos
    rooms[roomName].players[playerID].newPosDir = null //position has been committed this frame, dont need it anymore
    rooms[roomName].players[playerID].newPosRequestMagnitude = null
  }
}


io.on('connection', function (socket) {
  console.log('User joined lobby: ' + socket.id);
  
  socket.on('CREATE_ROOM',function(){
    CreateRoom(socket)
  })

  socket.on('disconnect', function () {
    console.log('User left lobby: ' + socket.id);
  });
});

//#region =================================== GAME SERVER EVENTS ===================================
function InitializeGameRoom(roomName)
{
  var greenFlag = NewFlagObject(GREEN_SPAWN,1)
  var redFlag = NewFlagObject(RED_SPAWN,0)
  rooms[roomName].flags.push(greenFlag)
  rooms[roomName].flags.push(redFlag)
  rooms[roomName].GAME_IN_PROGRESS = true
}

function NewPlayerConnectedToRoom(roomName,socket_id)
{
  var room = rooms[roomName]
  var count0 = room.teams_count[0]
  var count1 = room.teams_count[1]
  var teamToAddPlayerTo = 0 //red
  //if(room.teams_count[0] > rooms.teams_count[1])
  if(count0 < count1)
  {
    teamToAddPlayerTo = 1 //green
    rooms[roomName].teams_count[teamToAddPlayerTo] += 1
  }

  var spawnPos = teamToAddPlayerTo==0? RED_SPAWN : GREEN_SPAWN
  var newPlayer = NewPlayerObject(socket_id,spawnPos,teamToAddPlayerTo);

  rooms[roomName].players[socket_id] = newPlayer; 
}

//#endregion

//#region =================================== LOBBY SERVER EVENTS ===================================


//#endregion

//#region =================================== LOCAL GAME MANAGEMENT ===================================


function PlayerCaught(roomName,player_caught)
{
   //Should flag be dropped
   for(var flag of rooms[roomName].flags)
   {
     if(flag.captured && flag.capturer_id == player_caught.id)
     {
       FlagDropped(flag)
     }
   }

   //Update player state (flag drop first)
   rooms[roomName].players[player_caught.id].captured = true
   rooms[roomName].players[player_caught.id].pos = player_caught.team==0?GREEN_SPAWN:RED_SPAWN
}

function PlayerFreed(roomName,player_freed){
  rooms[roomName].players[player_freed.id].captured = false
}

function ShouldFlagBeCaptured(player,flag)
{
  if(player.team == flag.team)
  {
    return false
  }

  var distancePlayerFromFlag = Vector2Magnitude(Vector2Subtraction(player.pos,flag.pos))
  var flagEstimatedWidth = FLAG_HEIGHT
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

function TeamScored(roomName,team)
{
  rooms[roomName].score[team] += 1
  SendAllClients(roomName,'SCORE',rooms[roomName].score)
}

function ResetMap(roomName)
{
  for(var playerID in rooms[roomName].players)
  {
    rooms[roomName].players[playerID].pos = rooms[roomName].players[playerID].team==0 ? RED_SPAWN : GREEN_SPAWN 
  }

  for(var index in rooms[roomName].flags)
  {
    FlagDropped(rooms[roomName].flags[index])
    rooms[roomName].flags[index].pos = rooms[roomName].flags[index].team==0? RED_SPAWN : GREEN_SPAWN
  }

  rooms[roomName].GAME_IN_PROGRESS = false
  // io.sockets.emit('RESET',players,flags)
  SendAllClients(roomName, 'RESET',{players: rooms[roomName].players,flags: rooms[roomName].flags})
}

function BeginCountdown(roomName)
{
  //SendAllClients('COUNTDOWN_BEGIN',1)
  SendAllClients(roomName,'COUNTDOWN_BEGIN',1)

  // io.sockets.emit('SERVER_EVENT',ServerMessageObject('COUNTDOWN_BEGIN'))
  setTimeout(function(){
    //GAME STARTED 
    rooms[roomName].GAME_IN_PROGRESS = true
    SendAllClients(roomName,'GAME_BEGIN',1)
    // io.sockets.emit('SERVER_EVENT',ServerMessageObject('GAME_BEGIN'))
  },3000)
}

//#endregion

//#region =================================== OBJECT CREATION ===================================

function NewPlayerObject(id,startPos,team)
{
  return {
    id : id,
    pos : startPos,
    old_pos : startPos,
    team : team,
    captured : false,
    hasFlag : false,
    sprint: false,
    stats : {
      speed : 300,
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


function NewRoomObject(name)
{
  return {
    name: name,
    GAME_IN_PROGRESS: false,
    players : {},
    flags: [],
    package : {},
    score: {
      0: 0,
      1: 0
    },
    teams_count:{
      0: 0,
      1: 1
    }
  }
}

//#endregion

//#region =================================== HELPER FUNCTIONS ===================================
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

function Box(x,y,width,height)
{
    return {x: x,y: y,width: width,height: height}
}

function PositionLimitedByBox(box,player_diameter,next_pos)
{
    var x = box.x
    var y = box.y
    var width = box.width
    var height = box.height

    var new_x = 0
    var new_y = 0
    var player_radius = player_diameter/2

    if(next_pos.x-player_radius < x) //left bound
    {
        new_x = x+player_radius
    }
    else if(next_pos.x+player_radius > x+width) //right bound
    {
        new_x = x+width-player_radius
    }
    else
    {
        new_x = next_pos.x
    }

    if(next_pos.y-player_radius < y) //top bound
    {
        new_y = y+player_radius
    }
    else if(next_pos.y+player_radius > y+height) //bottom bound
    {
        new_y = y+height-player_radius
    }
    else
    {
        new_y = next_pos.y
    }

    var output_pos = {x: new_x,y: new_y}
    return output_pos
}

//#endregion

function SendAllClients(roomName,key,params)
{
  rooms[roomName].package[key] = params
}