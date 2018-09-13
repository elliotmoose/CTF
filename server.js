var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io').listen(http)
var config = require('./public/js/game/config')

var rooms = {}

//#region server init
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
//#endregion


//#region =================================== UPDATE ===================================
var lastIntervalCheckTime = 1
var updatesSinceLastCheck = 0
function Update()
{
  for(var roomId in rooms)
  {
    var thisRoom = rooms[roomId]
    if(thisRoom == null)
    {
      continue
    }

    UpdateFlagPosition(thisRoom)
    UpdatePlayerPosition(thisRoom)
    CheckPlayerReach(thisRoom)
    CheckWinCondition(thisRoom)

    thisRoom.package['players'] = thisRoom.players
    thisRoom.package['flags'] = thisRoom.flags
    io.of(roomId).emit('FULL_PACKAGE',thisRoom.package)

    thisRoom.package = {}
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

//#endregion

//#region =================================== GAME SERVER EVENTS ===================================
var playersThatDisconnectedThisUpdate = []

var roomIdCounter = 0
function GetnewRoomId()
{
  roomIdCounter+=1
  return "/room-" + roomIdCounter
}


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
    socket.emit('JOINED_ROOM',{roomId: newRoomId, create_time: newRoom.create_time})
    
    socket.on('PLAYER_INITIALIZED',function(display_name){
      NewPlayerConnectedToRoom(newRoom,socket.id,display_name)
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

    socket.on('PLAYER_REACH',function(){
      rooms[newRoomId].players[socket.id].isReaching = true
    })

    socket.on('PLAYER_BROADCAST_MESSAGE',function(message){
      io.of(newRoomId).emit('PLAYER_BROADCAST_MESSAGE',message)
    })

    socket.on('PING',function(id){
      socket.emit('PING_RETURN',id)
    })


    socket.on('disconnect',function(){

      var player = rooms[newRoomId].players[socket.id]

      if(player != null)
      {
        var display_name = player.display_name
        socket.broadcast.emit('PLAYER_DISCONNECTED',rooms[newRoomId].players[socket.id])
        io.of(newRoomId).emit('IN_GAME_MESSAGE',NewGameMessage(`${display_name} left the room :(`))
        console.log('PLAYER LEFT GAME: ' + socket.id)
  
        //LET THE QUEUE REMOVE IT SO NO CONFLICTS
        playersThatDisconnectedThisUpdate.push({roomId: newRoomId, playerId: socket.id})
      }
    })
  })
}

function InitializeGameRoom(roomId)
{
  var thisRoom = rooms[roomId]
  var greenFlag = NewFlagObject(config.game.prison.location.green,1)
  var redFlag = NewFlagObject(config.game.prison.location.red,0)
  thisRoom.flags.push(greenFlag)
  thisRoom.flags.push(redFlag)
  thisRoom.GAME_IN_PROGRESS = true
}

function NewPlayerConnectedToRoom(thisRoom,socket_id,player_display_name)
{
  // var thisRoom = rooms[roomId]

  if(!NotNull(thisRoom))
  {
    console.log('WARNING: room found to be null')
    return
  }

  var count0 = thisRoom.teams_count[0]
  var count1 = thisRoom.teams_count[1]
  var teamToAddPlayerTo = 0 //red
  //if(room.teams_count[0] > rooms.teams_count[1])
  if(count0 >= count1)
  {
    teamToAddPlayerTo = 1 //green
    thisRoom.teams_count[teamToAddPlayerTo] += 1
  }
  else
  {
    teamToAddPlayerTo = 0//red
    thisRoom.teams_count[teamToAddPlayerTo] += 1
  }

  var spawnPos = teamToAddPlayerTo==0? config.game.spawn.location.red : config.game.spawn.location.green
  var newPlayer = NewPlayerObject(socket_id,spawnPos,teamToAddPlayerTo,player_display_name);

  thisRoom.players[socket_id] = newPlayer; 
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
function CheckPlayerReach(thisRoom) //collisions and passing flags
{
  for(var each_player_ID in thisRoom.players)
  {
    //IF THIS WAS MY UPDATE => PLAYER RESPONSIBLE FOR HIS OWN COLLISIONS
    var eachPlayer = thisRoom.players[each_player_ID]

    if(!eachPlayer.isReaching)
    {
      continue
    }
    else
    {
      eachPlayer.reach_period_cur += 1
      
      if(eachPlayer.reach_period_cur > eachPlayer.reach_period_max*callRate)
      {
        eachPlayer.isReaching = false 
        eachPlayer.reach_period_cur = 0
      }
    }

    for(var other_player_ID in thisRoom.players)
    {
        //ignore if is same himself
        if(other_player_ID == each_player_ID)
        {
            continue
        }

        var other_player = thisRoom.players[other_player_ID]
        var vectorFromMeToPlayer = Vector2Subtraction(other_player.pos,eachPlayer.pos)
        var distanceFromMeToPlayer = Vector2Magnitude(vectorFromMeToPlayer)
        var minReachDistance = other_player.stats.diameter/2 + eachPlayer.stats.diameter/2 + eachPlayer.reach
        
        if(distanceFromMeToPlayer < minReachDistance)
        {
            var dirVector = Vector2Divide(vectorFromMeToPlayer,distanceFromMeToPlayer)
            var pointOfContact = Vector2Addition(eachPlayer.pos,Vector2Multiply(dirVector,eachPlayer.stats.diameter/2 + eachPlayer.reach))  //NOTE: USES MY PLAYER DIAMETER BECAUSE IM CHECKING FROM MYSELF...??
          
            //POINT OF COLLISION
            if(other_player.team != eachPlayer.team) //SMTH MUST HAPPEN
            {
                if (other_player.captured == false && eachPlayer.captured == false) 
                {
                    if (pointOfContact.x > config.CANVAS_DIMENSIONS.width / 2) //if contact green side and i am green
                    {
                        if (eachPlayer.team == 1) //if it was my side
                        {
                            //he gets caught
                            PlayerCaught(thisRoom,other_player)

                        }
                        else //it was his side
                        {
                            //i get caught
                            PlayerCaught(thisRoom,eachPlayer)
                        }
                    }
                    else {
                        if (eachPlayer.team == 0) //if it was his side
                        {
                            //he gets caught
                            PlayerCaught(thisRoom,other_player)
                        }
                        else //it was his side
                        {
                            //i get caught
                            PlayerCaught(thisRoom,eachPlayer)
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
                          PlayerFreed(thisRoom,other_player)
                        }
                        else if(eachPlayer.captured) //if i was captured
                        {
                          PlayerFreed(thisRoom,eachPlayer)
                        }
                    }

                    if(eachPlayer.isReaching)
                    {
                      
                      var team = eachPlayer.team
                      for(var index in thisRoom.flags)
                      {
                        var thisFlag = thisRoom.flags[index]
                        if(thisFlag.team != team && thisFlag.capturer_id == eachPlayer.id) //if this is opponent flag and its captured by me, then pass
                        {
                          thisRoom.flags[index].capturer_id = other_player.id //this is called when other player is already within reach
                          thisRoom.flags[index].pos = other_player.pos
                          console.log("FLAG PASSED TO" + other_player.display_name)
                          thisRoom.players[each_player_ID].attemptingPass = false
                          
                        }
                      }
                    }
                }

        }

    }
  }
}

function CheckWinCondition(thisRoom)
{
  for(var flag of thisRoom.flags)
  {
    //============================== FLAG WIN CONDITION ==============================
    if(flag.pos.x > config.CANVAS_DIMENSIONS.width/2 ) //if on green side
    {
      if (flag.team == 0 && flag.captured)
      {
        //win
        var player = thisRoom.players[flag.capturer_id]
        var player_display_name = ""

        if(NotNull(player))
        {
          var player_display_name = player.display_name
        }


        TeamScored(thisRoom,1,player_display_name)
        ResetMap(thisRoom)
        BeginCountdown(thisRoom)
      }
    }
    else
    {
      if (flag.team == 1 && flag.captured)
      {
        var player = thisRoom.players[flag.capturer_id]
        var player_display_name = ""

        if(NotNull(player))
        {
          var player_display_name = player.display_name
        }

        //win
        TeamScored(thisRoom,0,player_display_name)
        ResetMap(thisRoom)
        BeginCountdown(thisRoom)
      }
    }
  }

  for (var key in thisRoom.score)
  {
    var thisScore = thisRoom.score[key]
    if(thisScore > thisRoom.properties.max_score)
    {
      TeamWon(thisRoom,key)
    }
  }
}

function UpdateFlagPosition(thisRoom)
{
  //============================== UPDATE FLAG DATA ==============================
  for(var index in thisRoom.flags)
  {
    var flag = thisRoom.flags[index]

    if(flag == null)
    {
      continue
    }

    if(flag.captured)
    {  
      var thisPlayer = thisRoom.players[flag.capturer_id]
      if(thisPlayer == null)
      {
        FlagDropped(flag)
        console.log('player left')
        continue
      }
      //============================== UPDATE FLAG POSITION ==============================
      flag.pos = thisPlayer.pos
    }
    else
    {
      //============================== FLAG CAPTURING ==============================
      for(var playerID in thisRoom.players)
      {
        if(ShouldFlagBeCaptured(thisRoom.players[playerID],flag))
        {
          FlagCapturedBy(thisRoom.players[playerID],flag)
        }
      }
    }
  }
}

function UpdatePlayerPosition(thisRoom)
{
  var deltaTime = 1000/callRate
  for(var playerID in thisRoom.players)
  {    
    var thisPlayer = thisRoom.players[playerID]

    var sprint_multiplier = 1
    var recoveryFactor = 0.02 //100 stamina will recover 1000 (milliseconds) * factor
    var depletionFactor = 0.1 //100 stamina will deduuct 1000 (milliseconds) * factor

    if(thisPlayer.waypoint == null)
    {
      //Player did not request this round
      //stamina
      thisRoom.players[playerID].stamina = Math.min(100,thisPlayer.stamina+deltaTime*recoveryFactor*3) //recovers thrice as fast when not moving 
      continue
    }

    var vectorPlayerToWaypoint = Vector2Subtraction(thisPlayer.waypoint,thisPlayer.pos)
    var distanceFromWaypoint = Vector2Magnitude(vectorPlayerToWaypoint)
    var requestMagnitude = distanceFromWaypoint

    var newPosDir = Vector2Divide(vectorPlayerToWaypoint,distanceFromWaypoint)

    if(distanceFromWaypoint <= 10)
    {
      thisPlayer.stamina = Math.min(100,thisPlayer.stamina+deltaTime*recoveryFactor*3) //recovers thrice as fast when not moving 
      continue
    }
    
    
    if(thisPlayer.sprint)
    { 
      if(thisPlayer.stamina > 0)
      {
        sprint_multiplier = 1.9
      }
    }
    else
    {
      thisPlayer.stamina = Math.min(100,thisPlayer.stamina+deltaTime*recoveryFactor) 
    }

    var newPosDirMagnitude = deltaTime*thisPlayer.stats.speed/1000*sprint_multiplier
    var finalMagnitude = Math.min(requestMagnitude,newPosDirMagnitude)
    // var finalMagnitude = newPosDirMagnitude

    if(thisPlayer.stamina > 0 && thisPlayer.sprint)
    {
      thisPlayer.stamina = Math.max((thisPlayer.stamina-deltaTime*depletionFactor),0) 
    }

    var prison_center = thisPlayer.team==0?config.game.prison.location.green:config.game.prison.location.red
    var base_center = thisPlayer.team==1?config.game.prison.location.green:config.game.prison.location.red

    var newPos = Vector2Addition(thisPlayer.pos,Vector2Multiply(newPosDir,finalMagnitude))
    var radius = config.game.prison.radius

    var finalPos;

    if(thisPlayer.captured)
    {
      finalPos = PositionLimitedInsideCircle(prison_center,radius,thisPlayer.stats.diameter,newPos)
    }
    else
    {
      finalPos = PositionLimitedOutsideCircle(base_center,radius,thisPlayer.stats.diameter,newPos)
    }

    var box = Box(0,0,config.CANVAS_DIMENSIONS.width,config.CANVAS_DIMENSIONS.height)
    finalPos = PositionLimitedByBox(box,thisPlayer.stats.diameter,finalPos)
    thisPlayer.pos = finalPos
  }
}

function PlayerCaught(thisRoom,player_caught)
{
   //Should flag be dropped
   for(var flag of thisRoom.flags)
   {
     if(flag.captured && flag.capturer_id == player_caught.id)
     {
       FlagDropped(flag)
     }
   }

   //Update player state (flag drop first)
   thisRoom.players[player_caught.id].captured = true
   thisRoom.players[player_caught.id].pos = player_caught.team==0?config.game.prison.location.green:config.game.prison.location.red
}

function PlayerFreed(thisRoom,player_freed){
  if(thisRoom != null)
  {
    thisRoom.players[player_freed.id].captured = false
  }
  else
  {
    console.log("ERROR COULD NOT FIND ROOM WITH ID: "+ thisRoom.id)
  }
}

function ShouldFlagBeCaptured(player,flag)
{
  if(player.team == flag.team)
  {
    return false
  }

  var distancePlayerFromFlag = Vector2Magnitude(Vector2Subtraction(player.pos,flag.pos))
  var flagEstimatedWidth = config.flag.size
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
  flag.pos = flag.team==0?config.game.prison.location.red:config.game.prison.location.green
}

function TeamScored(thisRoom,team,player_display_name)
{
  thisRoom.score[team] += 1
  var teamName = team==0? 'Red' : 'Green'
  //MessageAllClients(roomId,'IN_GAME_MESSAGE',`${player_display_name} Scored For ${teamName} Team! `,0)  
  SendAllClients(thisRoom,'SCORE',thisRoom.score)
}

function TeamWon(thisRoom,key)
{
  SendAllClients(thisRoom,'WIN',key)
}

function ResetMap(thisRoom)
{
  for(var playerID in thisRoom.players)
  {
    thisRoom.players[playerID].pos = thisRoom.players[playerID].team==0 ? config.game.spawn.location.red : config.game.spawn.location.green
    thisRoom.players[playerID].waypoint = thisRoom.players[playerID].pos
    thisRoom.players[playerID].stamina = 100
    thisRoom.players[playerID].captured = false
    thisRoom.players[playerID].hasFlag = false
  }

  for(var index in thisRoom.flags)
  {
    FlagDropped(thisRoom.flags[index])
    thisRoom.flags[index].pos = thisRoom.flags[index].team==0? config.game.prison.location.red:config.game.prison.location.green
  }

  thisRoom.GAME_IN_PROGRESS = false
  // io.sockets.emit('RESET',players,flags)
  SendAllClients(thisRoom, 'RESET',{players: thisRoom.players,flags: thisRoom.flags})
}

function BeginCountdown(thisRoom)
{
  //SendAllClients('COUNTDOWN_BEGIN',1)
  SendAllClients(thisRoom,'COUNTDOWN_BEGIN',1)

  // io.sockets.emit('SERVER_EVENT',ServerMessageObject('COUNTDOWN_BEGIN'))
  setTimeout(function(){
    //GAME STARTED 
    thisRoom.GAME_IN_PROGRESS = true
    SendAllClients(thisRoom,'GAME_BEGIN',1)
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
    team : team,
    captured : false,
    hasFlag : false,
    
    isReaching : false,
    reach: config.player.reach.distance.standard,
    reach_period_cur : 0,
    reach_period_max : config.player.reach.duration.standard,

    sprint: false,
    stamina : 100,
    stats : {
      speed : 300,
      diameter : config.player.size.small,
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
    create_time: Date.now(),
    score: {
      0: 0,
      1: 0
    },
    teams_count:{
      0: 0,
      1: 1
    },
    properties:{
      max_score: 20,
      max_players : 6,
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
    var player_radius = player_diameter/2

    var x_right_bounded = Math.min(box.width-player_radius,next_pos.x)
    var x = Math.max(0+player_radius,x_right_bounded) 

    var y_bottom_bounded = Math.min(box.height-player_radius,next_pos.y)
    var y = Math.max(0+player_radius,y_bottom_bounded) 
    return {x: x,y: y}
}


function PositionLimitedInsideCircle(center,diameter,player_diameter,newPos)
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

function PositionLimitedOutsideCircle(center,diameter,player_diameter,newPos)
{
  if(Vector2Magnitude(Vector2Subtraction(newPos,center)) > diameter + 50) // if the person is not even in range
  {
    return newPos
  }

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

function SendAllClients(thisRoom,key,params)
{
  thisRoom.package[key] = params
}

function MessageAllClients(roomId,key,content,style)
{
  io.of(roomId).emit(key,NewGameMessage(content,style))
}

function NotNull(object)
{
  return object != null
}