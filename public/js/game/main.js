const THIS_PLAYER_CONNECTED = 1
const callsPerSecond = 60

//UI
const CANVAS_DIMENSIONS = {width: 1000,height: 600}
const PLAYER_DIAMETER_STANDARD = 40
const PLAYER_DIAMETER_MEDIUM = 30
const PLAYER_DIAMETER_SMALL = 20

const FLAG_HEIGHT = 40

const PRISON_HEIGHT = 400
const PRISON_WIDTH = 180
const PRISON_PADDING = 30
const RED_PRISON_RECT = Box(PRISON_PADDING,(CANVAS_DIMENSIONS.height-PRISON_HEIGHT)/2,PRISON_WIDTH,PRISON_HEIGHT)
const GREEN_PRISON_RECT = Box(CANVAS_DIMENSIONS.width-PRISON_WIDTH-PRISON_PADDING,(CANVAS_DIMENSIONS.height-PRISON_HEIGHT)/2,PRISON_WIDTH,PRISON_HEIGHT)

//COLORS
var MAP_GREEN;
var MAP_RED;
var WHITE;
var BLACK;
var GOLD;
var PLAYER_RED;
var PLAYER_GREEN;
var PRISON_GREY;

//ASSETS
var red_flag_img;
var green_flag_img;

var socket = io();

var flags = [];
var players = {};


var controller;
var CONNECTED = false

function preload()
{
    red_flag_img = loadImage('/assets/flag_red.png');
    green_flag_img = loadImage('/assets/flag_green.png');
}

function setup()
{   

    frameRate(60)
    MAP_GREEN = color(42, 130, 62)
    MAP_RED = color(155, 49, 49)
    WHITE = color(255, 255, 255)
    BLACK = color(0)
    GOLD = color(255, 207, 34)
    PLAYER_RED = color(252, 93, 93)//red
    PLAYER_GREEN = color(80, 186, 104)//green
    PRISON_GREY = color(50,90)

    controller = new PlayerController()
    createCanvas(CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height)

    setInterval(Update,1000/callsPerSecond)
}

function Update()
{
    var myPlayer = players[socket.id]
    
    // ========================================== PLAYER MOVEMENT =================================================
    if(mouseIsPressed)
    {
        var deltaTime = 1/callsPerSecond
        var speed = myPlayer.stats.speed
        var oldPos = myPlayer.pos
        
        var vector = {x:mouseX-oldPos.x,y: mouseY-oldPos.y} //FROM PLAYER TO MOUSE
        var magnitude = Vector2Magnitude(vector)
        if(magnitude > 2)
        {
            var newPosDir = Vector2Divide(vector, magnitude) //direction vector
            
            var newPos = Vector2Addition(oldPos,Vector2Multiply(newPosDir,deltaTime*speed))
            
            //limit
            var box;

            if(myPlayer.captured)
            {
                box = myPlayer.team==1 ? RED_PRISON_RECT : GREEN_PRISON_RECT
            }
            else
            {
                box = Box(0,0,CANVAS_DIMENSIONS.width,CANVAS_DIMENSIONS.height)
            }

            var finalPos = PositionLimitedByBox(box,myPlayer.stats.diameter,newPos)
            controller.SendNewPos(finalPos);
        }
    }
}

function draw()
{
    
    
    // ========================================== UI - MAP =================================================
    background(50, 89, 100);
    
    strokeWeight(1)
    stroke(BLACK)

    //DRAW RED
    var fillColor = MAP_RED
    fill(fillColor)
    rect(0,0,CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height);
    
    //DRAW GREEN
    fillColor = MAP_GREEN
    fill(fillColor)
    rect(CANVAS_DIMENSIONS.width/2,0,CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height);
    
    //DRAW RED PRISON
    fillColor = PRISON_GREY
    fill(fillColor)
    rect(RED_PRISON_RECT.x,RED_PRISON_RECT.y,RED_PRISON_RECT.width,RED_PRISON_RECT.height)
    
    //DRAW GREEN PRISON
    fillColor = PRISON_GREY
    fill(fillColor)
    rect(GREEN_PRISON_RECT.x,GREEN_PRISON_RECT.y,GREEN_PRISON_RECT.width,GREEN_PRISON_RECT.height)
    
    fillColor = WHITE
    fill(fillColor)

    // ========================================== UI - PLAYER =================================================

    if(CONNECTED)
    {
        text(socket.id,10,20)
       
        var team = players[socket.id].team

        if(team != null)
        {
            text("Team:" + team,10,30)
        }
    }

    for(var playerID in players)
    {
        thisPlayer = players[playerID]
     
        fillColor = color(255,255,255)

        var teamColor;
        
        if (thisPlayer.team == 0)
        {
            teamColor = PLAYER_RED
        } 
        else
        {
            teamColor = PLAYER_GREEN
        }

        var strokeColor = color(0,0,0)
        var weight = 1

        if (thisPlayer.id == socket.id)
        {
            weight = 4
            strokeColor = teamColor
            fillColor = GOLD
        }
        else
        {
            weight = 1
            strokeColor = BLACK
            fillColor = teamColor
        }
        
        fill(fillColor)
        strokeWeight(weight)
        stroke(strokeColor)
        ellipse(thisPlayer.pos.x,thisPlayer.pos.y,PLAYER_DIAMETER_STANDARD,PLAYER_DIAMETER_STANDARD)
        
    }

    // ========================================== UI - FLAGS =================================================
    for(var flag of flags)
    {
        let team_flag_image = flag.team==0?red_flag_img : green_flag_img
        image(team_flag_image, flag.pos.x-FLAG_HEIGHT/2,flag.pos.y-FLAG_HEIGHT/2,FLAG_HEIGHT,FLAG_HEIGHT)
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

// function Vector2Magnitude(x,y)
// {
//     return Math.sqrt(Math.pow(x,2) + Math.pow(y,2))
// }

function PlayerController()
{
   this.SendNewPos = function(pos)
   {
       socket.emit('PLAYER_MOVED',pos)
   } 
}

socket.on('ON_CONNECTED',function(all_players){
    players = all_players

    //UI
    CONNECTED = true
})

socket.on('FLAGS_CREATED',function(all_flags){
    flags = all_flags
})

socket.on('NEW_PLAYER_CONNECTED',function(all_players){
    players = all_players
})

socket.on('PLAYER_DISCONNECTED',function(disconnected_player_data){
    delete players[disconnected_player_data.id]
})

var countDown = 3;
var counterInterval;
socket.on('SERVER_EVENT',function(message){
    console.log(message.what)
    switch(message.what)
    {
        case 'COUNTDOWN_BEGIN':
        countingDown = true
        countDown = 3
        console.log(countDown)
        countDown-=1

        if(countDown == 0)
        {
            console.log('LOCAL GAME READY')
        }
        else
        {
            counterInterval = setInterval(function(){
                console.log(countDown)
                countDown-=1
            },1000)
        }
        
        break;
        
        case 'GAME_BEGIN':
            clearInterval(counterInterval)
            console.log('LOCAL GAME READY')
        break;
    }

})

socket.on('PLAYERS_DATA_UPDATE',function(player_data){
    if (players[player_data.id] != null)
    {
        players[player_data.id] = player_data
    }
    else
    {
        console.log("Cant find player: " + player_data.id)
    }


    //IF THIS WAS MY UPDATE => PLAYER RESPONSIBLE FOR HIS OWN COLLISIONS
    if(player_data.id == socket.id)
    {
        var myPlayer = players[socket.id]

        for(var playerID in players)
        {
            //ignore if is thisPlayer
            if(playerID == socket.id)
            {
                continue
            }

            var player = players[playerID]
            var vectorFromMeToPlayer = Vector2Subtraction(player.pos,myPlayer.pos)
            var distanceFromMeToPlayer = Vector2Magnitude(vectorFromMeToPlayer)
            var minDistance = player.stats.diameter/2 + myPlayer.stats.diameter/2
            //NOTE: DO THIS CHECK ONLY FOR THIS PLAYER
            //      MEANING == CHECK THAT THIS PLAYER HAS COLLIDED WITH OTHERS ONLY
            
            // console.log(minDistance)
            // console.log(distanceFromMeToPlayer)
            if(distanceFromMeToPlayer < minDistance)
            {
                var dirVector = Vector2Divide(vectorFromMeToPlayer,distanceFromMeToPlayer)
                var pointOfContact = Vector2Addition(myPlayer.pos,Vector2Multiply(dirVector,myPlayer.stats.diameter/2))  //NOTE: USES MY PLAYER DIAMETER BECAUSE IM CHECKING FROM MYSELF...??

                //POINT OF COLLISION

                if(player.team != myPlayer.team) //SMTH MUST HAPPEN
                {
                    if (player.captured == false && myPlayer.captured == false) 
                    {
                        if (pointOfContact.x > CANVAS_DIMENSIONS.width / 2) //if contact green side and i am green
                        {
                            if (myPlayer.team == 1) //if it was my side
                            {
                                //he gets caught
                                socket.emit('PLAYER_CAUGHT', player)
                            }
                            else //it was his side
                            {
                                //i get caught
                                socket.emit('PLAYER_CAUGHT', myPlayer)
                            }
                        }
                        else {
                            if (myPlayer.team == 0) //if it was his side
                            {
                                //he gets caught
                                socket.emit('PLAYER_CAUGHT', player)
                            }
                            else //it was his side
                            {
                                //i get caught
                                socket.emit('PLAYER_CAUGHT', myPlayer)
                            }
                        }
                    }
                }
                else
                    {
                        //FREEEEEEEEEEDOOMMMMMMMM
                        if(!(player.captured && myPlayer.captured)) //if not both captured
                        {
                            if(player.captured) //if he was the one captured
                            {
                                socket.emit('PLAYER_FREED', player) //free him
                            }
                            else //if i was captured
                            {
                                socket.emit('PLAYER_FREED', myPlayer) //free me
                            }
                        }
                    }

            }

        }
    }
})

socket.on('FLAGS_DATA_UPDATED',function(all_flags){
    flags = all_flags
})


socket.on('RESET',function(all_players,all_flags){
    players = all_players
    flags = all_flags
})

//PlayerObject Template
// {
//     id : "",

//     pos : {
//         x: 0,
//         y: 0 
//     },

//     stats: 
//     {
//         speed : 100
//     }

// }