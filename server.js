var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io').listen(http)

const CANVAS_DIMENSIONS = {width: 1600,height: 800}
const PLAYER_DIAMETER_STANDARD = 40
const PLAYER_DIAMETER_MEDIUM = 30
const PLAYER_DIAMETER_SMALL = 20

const FLAG_HEIGHT = 40


const PRISON_RADIUS = 150;
const RED_PRISON_LOC = {x: 150,y: CANVAS_DIMENSIONS.height/2}
const GREEN_PRISON_LOC = {x: CANVAS_DIMENSIONS.width-150,y: CANVAS_DIMENSIONS.height/2}

const RED_SPAWN = {x: 12,y: CANVAS_DIMENSIONS.height/2}
const GREEN_SPAWN = {x: CANVAS_DIMENSIONS.width-12,y: CANVAS_DIMENSIONS.height/2}

app.use('/js',express.static(__dirname + "/public/js"))
app.use('/assets',express.static(__dirname + "/public/assets"))

app.get('/', function(req, res){
  res.sendFile(__dirname+'/index.html');
});

http.listen(8080, function(){
  console.log('listening on 8080');
});


var callRate = 20
var update_clock = setInterval(Update,1000/callRate)

//#region SERVER LOBBY

// var lobby = io.of('/lobby')
var rooms = {}


var roomId = 0
function GetnewRoomId()
{
  roomId+=1
  return "/room-" + roomId
}


//#endregion

var lastIntervalCheckTime = 1
var updatesSinceLastCheck = 0
function Update()
{
  for(var roomId in rooms)
  {
    if(rooms[roomId] == null)
    {
      continue
    }

    UpdateFlagPosition(roomId)
    UpdatePlayerPosition(roomId)
    CheckPlayerReach(roomId)
    CheckWinCondition(roomId)

    rooms[roomId].package['players'] = rooms[roomId].players
    rooms[roomId].package['flags'] = rooms[roomId].flags
    io.of(roomId).emit('FULL_PACKAGE',rooms[roomId].package)

    rooms[roomId].package = {}
  }


  for(var index in playersThatDisconnectedThisUpdate)
  {
    var object = playersThatDisconnectedThisUpdate[index]
    PlayerDisconnectedFromRoom(object.roomId,object.playerId)
  }

  playersThatDisconnectedThisUpdate = []

  //#region FRAME CHECK
  if(Date.now() - lastIntervalCheckTime < 1000) //if its under one second since the last check
  {
    updatesSinceLastCheck += 1
  }
  else
  {
    // io.of(roomId).emit('SERVER_FRAME_CHECK',updatesSinceLastCheck)
    for(var roomId in rooms)
    {
      io.of(roomId).emit('SERVER_FRAME_CHECK',updatesSinceLastCheck)
    }

    updatesSinceLastCheck = 0
    lastIntervalCheckTime = Date.now()
  }

  //#endregion
  
}



//#region =================================== GAME SERVER EVENTS ===================================

function CreateRoom(creator_socket,display_name)
{
  var newRoomId = GetnewRoomId()
  var newRoomSocket = io.of(newRoomId)
  var newRoom = NewRoomObject(newRoomId,display_name)
  rooms[newRoomId] = newRoom //ADD ROOM
  InitializeGameRoom(newRoomId)
  

  console.log("ROOM CREATED: " + newRoomId)
  creator_socket.emit('ON_ROOM_CREATED',newRoomId) //TELL CLIENT HE CREATED ROOM
  creator_socket.emit('SET_NAMESPACE',newRoomId) //GET CLIENT TO CONNECT TO ROOM
  
  newRoomSocket.on('connection',function(socket){ //SET CALLBACKS FOR ROOM    
    socket.emit('JOINED_ROOM',newRoomId)
    
    socket.on('PLAYER_INITIALIZED',function(display_name){
      NewPlayerConnectedToRoom(newRoomId,socket.id,display_name)
      io.of(newRoomId).emit('IN_GAME_MESSAGE',NewGameMessage(`${display_name} joined the room!`))
      console.log('PLAYER JOINED GAME:' + display_name)
    })

    socket.on('PLAYER_MOVED',function(request){

      if(!rooms[newRoomId].GAME_IN_PROGRESS)
      {
        return
      }

      //============================== RECEIVE PLAYER REQUEST TO CHANGE POSITION ==============================
      var thisPlayer = rooms[newRoomId].players[socket.id]              

      if(!NotNull(thisPlayer))
      {
        console.log("WARNING!!: player null")
        return
      }      
         
      //PUSH TO DATA, UPDATE WILL OCCUR IN UPDATE QUEUE
      rooms[newRoomId].players[socket.id].waypoint = request
      rooms[newRoomId].players[socket.id].sprint = request.sprint
    });

    socket.on('PLAYER_PASSED_FLAG',function(){
      rooms[newRoomId].players[socket.id].attemptingPass = true
    })

    socket.on('PLAYER_BROADCAST_MESSAGE',function(message){
      io.of(newRoomId).emit('PLAYER_BROADCAST_MESSAGE',message)
    })

    socket.on('PING',function(id){
      socket.emit('PING_RETURN',id)
    })


    socket.on('disconnect',function(){
      var display_name = rooms[newRoomId].players[socket.id].display_name
      socket.broadcast.emit('PLAYER_DISCONNECTED',rooms[newRoomId].players[socket.id])
      io.of(newRoomId).emit('IN_GAME_MESSAGE',NewGameMessage(`${display_name} left the room :(`))
      console.log('PLAYER LEFT GAME: ' + socket.id)

      //LET THE QUEUE REMOVE IT SO NO CONFLICTS
      playersThatDisconnectedThisUpdate.push({roomId: newRoomId, playerId: socket.id})
    })
  })
}

var playersThatDisconnectedThisUpdate = []


function InitializeGameRoom(roomId)
{
  var greenFlag = NewFlagObject(GREEN_PRISON_LOC,1)
  var redFlag = NewFlagObject(RED_PRISON_LOC,0)
  rooms[roomId].flags.push(greenFlag)
  rooms[roomId].flags.push(redFlag)
  rooms[roomId].GAME_IN_PROGRESS = true
}

function NewPlayerConnectedToRoom(roomId,socket_id,player_display_name)
{
  var room = rooms[roomId]

  if(!NotNull(room))
  {
    console.log('WARNING: room found to be null')
    return
  }

  var count0 = room.teams_count[0]
  var count1 = room.teams_count[1]
  var teamToAddPlayerTo = 0 //red
  //if(room.teams_count[0] > rooms.teams_count[1])
  if(count0 >= count1)
  {
    teamToAddPlayerTo = 1 //green
    rooms[roomId].teams_count[teamToAddPlayerTo] += 1
  }
  else
  {
    teamToAddPlayerTo = 0//red
    rooms[roomId].teams_count[teamToAddPlayerTo] += 1
  }

  var spawnPos = teamToAddPlayerTo==0? RED_SPAWN : GREEN_SPAWN
  var newPlayer = NewPlayerObject(socket_id,spawnPos,teamToAddPlayerTo,player_display_name);

  rooms[roomId].players[socket_id] = newPlayer; 
}

function PlayerDisconnectedFromRoom(roomId,socket_id)
{
  //clean up empty room
  if(Object.keys(rooms[roomId].players).length == 1) //IF IT IS THE LAST PLAYER -> HE IS ABOUT TO LEAVE
  {
    console.log("ROOM DELETED: " + roomId)
    io.of(roomId).removeAllListeners()
    delete rooms[roomId]//delete the room
  }
  else
  {

    //if flag carrier disconnects, drop flag
    //Should flag be dropped
    for (var flag of rooms[roomId].flags) 
    {
      if (flag.captured && flag.capturer_id == socket_id) 
      {
        FlagDropped(roomId,flag)
      }
    }

    var playerTeam = rooms[roomId].players[socket_id].team
    rooms[roomId].teams_count[playerTeam] -= 1 //update team counter
    delete rooms[roomId].players[socket_id]
  }
  


}

//#endregion

//#region =================================== LOBBY SERVER EVENTS ===================================

io.on('connection', function (socket) {
  console.log('User joined lobby: ' + socket.id);
  
  socket.emit('JOINED_LOBBY')

  socket.on('CREATE_ROOM',function(display_name){
    CreateRoom(socket,display_name)
  })

  socket.on('GET_ROOMS',function(){
    
    var roomsDataToSend = {}
    //needs room.id (key), room.display_name

    for(var key in rooms)
    {
      if(NotNull(rooms[key]))
      {
        var display_name = rooms[key].display_name
        roomsDataToSend[key] = {display_name: display_name}
      }
    }

    socket.emit('ROOMS',roomsDataToSend)
  })

  socket.on('disconnect', function () {
    console.log('User left lobby: ' + socket.id);
  });
});

//#endregion

//#region =================================== LOCAL GAME MANAGEMENT ===================================
function CheckPlayerReach(roomId) //collisions and passing flags
{
  for(var each_player_ID in rooms[roomId].players)
  {
    //IF THIS WAS MY UPDATE => PLAYER RESPONSIBLE FOR HIS OWN COLLISIONS
    var eachPlayer = rooms[roomId].players[each_player_ID]

    for(var other_player_ID in rooms[roomId].players)
    {
        //ignore if is same himself
        if(other_player_ID == each_player_ID)
        {
            continue
        }

        var other_player = rooms[roomId].players[other_player_ID]
        var vectorFromMeToPlayer = Vector2Subtraction(other_player.pos,eachPlayer.pos)
        var distanceFromMeToPlayer = Vector2Magnitude(vectorFromMeToPlayer)
        var minReachDistance = other_player.stats.diameter/2 + eachPlayer.stats.diameter/2 + eachPlayer.reach
        
        if(distanceFromMeToPlayer < minReachDistance)
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
                            PlayerCaught(roomId,other_player)

                        }
                        else //it was his side
                        {
                            //i get caught
                            PlayerCaught(roomId,eachPlayer)
                        }
                    }
                    else {
                        if (eachPlayer.team == 0) //if it was his side
                        {
                            //he gets caught
                            PlayerCaught(roomId,other_player)
                        }
                        else //it was his side
                        {
                            //i get caught
                            PlayerCaught(roomId,eachPlayer)
                        }
                    }
                }
            }
            else //if in reach of same team
                {
                    //FREEEEEEEEEEDOOMMMMMMMM
                    if(!(other_player.captured && eachPlayer.captured)) //if not both captured
                    {
                        if(other_player.captured) //if he was the one captured
                        {
                          PlayerFreed(roomId,other_player)
                        }
                        else if(eachPlayer.captured) //if i was captured
                        {
                          PlayerFreed(roomId,eachPlayer)
                        }
                    }

                    if(eachPlayer.attemptingPass)
                    {
                      
                      var team = eachPlayer.team
                      for(var index in rooms[roomId].flags)
                      {
                        if(rooms[roomId].flags[index].team != team)
                        {
                          rooms[roomId].flags[index].capturer_id = other_player.id //this is called when other player is already within reach
                          rooms[roomId].flags[index].pos = other_player.pos
                          console.log("FLAG PASSED TO" + other_player.display_name)
                          rooms[roomId].players[each_player_ID].attemptingPass = false
                          
                        }
                      }
                    }
                }

        }

    }
  }
}

function CheckWinCondition(roomId)
{
  for(var flag of rooms[roomId].flags)
  {
    //============================== FLAG WIN CONDITION ==============================
    if(flag.pos.x > CANVAS_DIMENSIONS.width/2 ) //if on green side
    {
      if (flag.team == 0 && flag.captured)
      {
        //win
        var player = rooms[roomId].players[flag.capturer_id]
        var player_display_name = ""

        if(NotNull(player))
        {
          var player_display_name = player.display_name
        }


        TeamScored(roomId,1,player_display_name)
        ResetMap(roomId)
        BeginCountdown(roomId)
      }
    }
    else
    {
      if (flag.team == 1 && flag.captured)
      {
        var player = rooms[roomId].players[flag.capturer_id]
        var player_display_name = ""

        if(NotNull(player))
        {
          var player_display_name = player.display_name
        }

        //win
        TeamScored(roomId,0,player_display_name)
        ResetMap(roomId)
        BeginCountdown(roomId)
      }
    }
  }
}

function UpdateFlagPosition(roomId)
{
  //============================== UPDATE FLAG DATA ==============================
  for(var index in rooms[roomId].flags)
  {
    var flag = rooms[roomId].flags[index]

    if(flag == null)
    {
      // continue
    }

    if(flag.captured)
    {  
      //============================== UPDATE FLAG POSITION ==============================
      rooms[roomId].flags[index].pos = rooms[roomId].players[flag.capturer_id].pos
    }
    else
    {
      //============================== FLAG CAPTURING ==============================
      for(var playerID in rooms[roomId].players)
      {
        if(ShouldFlagBeCaptured(rooms[roomId].players[playerID],flag))
        {
          FlagCapturedBy(rooms[roomId].players[playerID],flag)
        }
      }
    }
  }
}

function UpdatePlayerPosition(roomId)
{
  var deltaTime = 1000/callRate
  for(var playerID in rooms[roomId].players)
  {    
    var thisPlayer = rooms[roomId].players[playerID]

    var sprint_multiplier = 1
    var recoveryFactor = 0.02 //100 stamina will recover 1000 (milliseconds) * factor
    var depletionFactor = 0.1 //100 stamina will deduuct 1000 (milliseconds) * factor

    if(thisPlayer.waypoint == null)
    {
      //Player did not request this round
      //stamina
      rooms[roomId].players[playerID].stamina = Math.min(100,thisPlayer.stamina+deltaTime*recoveryFactor*3) //recovers thrice as fast when not moving 
      continue
    }

    var vectorPlayerToWaypoint = Vector2Subtraction(thisPlayer.waypoint,thisPlayer.pos)
    var distanceFromWaypoint = Vector2Magnitude(vectorPlayerToWaypoint)
    var requestMagnitude = distanceFromWaypoint

    var newPosDir = Vector2Divide(vectorPlayerToWaypoint,distanceFromWaypoint)

    if(distanceFromWaypoint <= 10)
    {
      rooms[roomId].players[playerID].stamina = Math.min(100,thisPlayer.stamina+deltaTime*recoveryFactor*3) //recovers thrice as fast when not moving 
      continue
    }
    
    
    if(thisPlayer.sprint)
    { 
      if(thisPlayer.stamina > 0)
      {
        sprint_multiplier = 1.6
      }
    }
    else
    {
      rooms[roomId].players[playerID].stamina = Math.min(100,thisPlayer.stamina+deltaTime*recoveryFactor) 
    }

    var newPosDirMagnitude = deltaTime*thisPlayer.stats.speed/1000*sprint_multiplier
    var finalMagnitude = Math.min(requestMagnitude,newPosDirMagnitude)
    // var finalMagnitude = newPosDirMagnitude

    if(thisPlayer.stamina > 0 && thisPlayer.sprint)
    {
      rooms[roomId].players[playerID].stamina = Math.max((rooms[roomId].players[playerID].stamina-deltaTime*depletionFactor),0) 
    }

    var prison_center = thisPlayer.team==0?GREEN_PRISON_LOC:RED_PRISON_LOC
    var base_center = thisPlayer.team==1?GREEN_PRISON_LOC:RED_PRISON_LOC

    var oldPos = thisPlayer.pos
    var newPos = Vector2Addition(thisPlayer.pos,Vector2Multiply(newPosDir,finalMagnitude))
    var radius = PRISON_RADIUS

    var finalPos;

    if(thisPlayer.captured)
    {
      // finalPos = {x:0,y:0}
      finalPos = PositionLimitedInsideCircle(prison_center,radius,thisPlayer.stats.diameter,oldPos,newPos)
    }
    else
    {
      finalPos = PositionLimitedOutsideCircle(base_center,radius,thisPlayer.stats.diameter,oldPos,newPos)
    }

    var box = Box(0,0,CANVAS_DIMENSIONS.width,CANVAS_DIMENSIONS.height)
    finalPos = PositionLimitedByBox(box,thisPlayer.stats.diameter,finalPos)
    rooms[roomId].players[playerID].pos = finalPos
  }
}


function PlayerCaught(roomId,player_caught)
{
   //Should flag be dropped
   for(var flag of rooms[roomId].flags)
   {
     if(flag.captured && flag.capturer_id == player_caught.id)
     {
       FlagDropped(flag)
     }
   }

   //Update player state (flag drop first)
   rooms[roomId].players[player_caught.id].captured = true
   rooms[roomId].players[player_caught.id].pos = player_caught.team==0?GREEN_PRISON_LOC:RED_PRISON_LOC
}

function PlayerFreed(roomId,player_freed){
  if(rooms[roomId] != null)
  {
    rooms[roomId].players[player_freed.id].captured = false
  }
  else
  {
    console.log("ERROR COULD NOT FIND ROOM WITH ID: "+ roomId)
  }
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
  flag.pos = flag.team==0?RED_PRISON_LOC:GREEN_PRISON_LOC
}

function TeamScored(roomId,team,player_display_name)
{
  rooms[roomId].score[team] += 1
  var teamName = team==0? 'Red' : 'Green'
  MessageAllClients(roomId,'IN_GAME_MESSAGE',`${player_display_name} Scored For ${teamName} Team! `,0)  
  SendAllClients(roomId,'SCORE',rooms[roomId].score)
}

function ResetMap(roomId)
{
  for(var playerID in rooms[roomId].players)
  {
    rooms[roomId].players[playerID].pos = rooms[roomId].players[playerID].team==0 ? RED_SPAWN : GREEN_SPAWN 
    rooms[roomId].players[playerID].waypoint = rooms[roomId].players[playerID].pos
    rooms[roomId].players[playerID].stamina = 100
    rooms[roomId].players[playerID].captured = false
    rooms[roomId].players[playerID].hasFlag = false
  }

  for(var index in rooms[roomId].flags)
  {
    FlagDropped(rooms[roomId].flags[index])
    rooms[roomId].flags[index].pos = rooms[roomId].flags[index].team==0? RED_PRISON_LOC:GREEN_PRISON_LOC
  }

  rooms[roomId].GAME_IN_PROGRESS = false
  // io.sockets.emit('RESET',players,flags)
  SendAllClients(roomId, 'RESET',{players: rooms[roomId].players,flags: rooms[roomId].flags})
}

function BeginCountdown(roomId)
{
  //SendAllClients('COUNTDOWN_BEGIN',1)
  SendAllClients(roomId,'COUNTDOWN_BEGIN',1)

  // io.sockets.emit('SERVER_EVENT',ServerMessageObject('COUNTDOWN_BEGIN'))
  setTimeout(function(){
    //GAME STARTED 
    rooms[roomId].GAME_IN_PROGRESS = true
    SendAllClients(roomId,'GAME_BEGIN',1)
    // io.sockets.emit('SERVER_EVENT',ServerMessageObject('GAME_BEGIN'))
  },3000)
}

//#endregion

//#region =================================== OBJECT CREATION ===================================

function NewPlayerObject(id,startPos,team,player_display_name)
{
  return {
    id : id,
    display_name : player_display_name,
    pos : startPos,
    old_pos : startPos,
    waypoint: startPos,
    attemptingPass : false,
    reach: 20,
    team : team,
    captured : false,
    hasFlag : false,
    sprint: false,
    stamina : 100,
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


function NewRoomObject(id,display_name)
{
  return {
    id: id,
    display_name: display_name,
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

function NewGameMessage(content,style)
{
  return {
    content : content,
    style : style
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


function PositionLimitedInsideCircle(center,diameter,player_diameter,oldPos,newPos)
{
  var radius = diameter/2-player_diameter/2
  var distanceFromPlayerToCircleCenter = Vector2Magnitude(Vector2Subtraction(newPos,center))
  var displacementY = (newPos.y-center.y)
  var displacementX = (newPos.x-center.x)
  var angle = Math.atan2(displacementY,displacementX)

  var magnitude = Math.min(radius,distanceFromPlayerToCircleCenter)
  var output = {x: center.x + magnitude*Math.cos(angle),y: center.y + magnitude*Math.sin(angle)}

  
  return output
}

function PositionLimitedOutsideCircle(center,diameter,player_diameter,oldPos,newPos)
{
  var radius = diameter/2+player_diameter/2
  var distanceFromPlayerToCircleCenter = Vector2Magnitude(Vector2Subtraction(newPos,center))
  var displacementY = (newPos.y-center.y)
  var displacementX = (newPos.x-center.x)
  var angle = Math.atan2(displacementY,displacementX)

  var magnitude = Math.max(radius,distanceFromPlayerToCircleCenter)
  var output = {x: center.x + magnitude*Math.cos(angle),y: center.y + magnitude*Math.sin(angle)}

  
  return output
}



//#endregion

function SendAllClients(roomId,key,params)
{
  rooms[roomId].package[key] = params
}

function MessageAllClients(roomId,key,content,style)
{
  io.of(roomId).emit(key,NewGameMessage(content,style))
}

function NotNull(object)
{
  return object != null
}