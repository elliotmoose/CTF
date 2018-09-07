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

const LERP_TOLERANCE = 150

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
        if(magnitude > 5)
        {
            var newPosDir = Vector2Divide(vector, magnitude) //direction vector
            

            var newPosDirMagnitude = deltaTime*speed
            var finalMagnitude = Math.min(magnitude,newPosDirMagnitude)

            var newPos = Vector2Addition(oldPos,Vector2Multiply(newPosDir,finalMagnitude))
            
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
            socket.emit('PLAYER_MOVED',finalPos)
        }
    }
}

function draw()
{
    timeElapsedSincePackage += 1000/frameRate()

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

        if(Vector2Magnitude(Vector2Subtraction(thisPlayer.pos,thisPlayer.old_pos)) > LERP_TOLERANCE)
        {
            ellipse(thisPlayer.pos.x,thisPlayer.pos.y,PLAYER_DIAMETER_STANDARD,PLAYER_DIAMETER_STANDARD)
            continue
        }

        var lerp_weight = Math.min((timeElapsedSincePackage/(recentPackageTime-previousPackageTime)),1)
        var lerp_x = lerp(thisPlayer.old_pos.x,thisPlayer.pos.x,lerp_weight)
        var lerp_y = lerp(thisPlayer.old_pos.y,thisPlayer.pos.y,lerp_weight)
        var lerpPos = {x:lerp_x,y:lerp_y}

        ellipse(lerpPos.x,lerpPos.y,PLAYER_DIAMETER_STANDARD,PLAYER_DIAMETER_STANDARD)
    }

    // ========================================== UI - FLAGS =================================================
    for(var flag of flags)
    {
        let team_flag_image = flag.team==0?red_flag_img : green_flag_img

        if(Vector2Magnitude(Vector2Subtraction(flag.pos,flag.old_pos)) > LERP_TOLERANCE)
        {
            ellipse(flag.pos.x,flag.pos.y,PLAYER_DIAMETER_STANDARD,PLAYER_DIAMETER_STANDARD)
            continue
        }

        var lerp_weight = Math.min((timeElapsedSincePackage/(recentPackageTime-previousPackageTime)),1)
        var lerp_x = lerp(flag.old_pos.x,flag.pos.x,lerp_weight)
        var lerp_y = lerp(flag.old_pos.y,flag.pos.y,lerp_weight)
        var lerpPos = {x:lerp_x,y:lerp_y}

        image(team_flag_image, lerp_x-FLAG_HEIGHT/2,lerp_y-FLAG_HEIGHT/2,FLAG_HEIGHT,FLAG_HEIGHT)
    }
}

socket.on('ON_CONNECTED',function(all_players){
    players = all_players
    //UI
    CONNECTED = true
})

socket.on('PLAYER_DISCONNECTED',function(disconnected_player_data){
    delete players[disconnected_player_data.id]
})

var countDown = 3;
var counterInterval;
var previousPackageTime = 0
var recentPackageTime = 0
var timeElapsedSincePackage = 0
socket.on('FULL_PACKAGE',function(package){

    previousPackageTime = recentPackageTime
    recentPackageTime = Date.now()
    timeElapsedSincePackage = 0

    if(package['players'] != null)
    {
        var oldPositions = {}
        for(var playerID in players)
        {
            oldPositions[playerID] = players[playerID].pos
        }

        players = package['players']
        
        for(var playerID in players)
        {
            players[playerID].old_pos = oldPositions[playerID]

            if(oldPositions[playerID] == null) //just joined
            {
                players[playerID].old_pos = players[playerID].pos
            }
        }
    }

    if(package['flags'] != null)
    {
        var oldPositions = []
        for(var index in flags)
        {
            oldPositions[index] = flags[index].pos
        }

        flags = package['flags']
        
        for(var index in flags)
        {
            flags[index].old_pos = oldPositions[index]

            if(oldPositions[index] == null) //just joined
            {
                flags[index].old_pos = flags[index].pos
            }
        }
    }

    if(package['RESET'] != null)
    {
        players = package['RESET'].players
        flags = package['RESET'].flags

        for(var index in flags)
        {
            flags[index].old_pos = flags[index].pos
        }
    }

    if(package["COUNTDOWN_BEGIN"] != null)
    {
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
    }

    if(package['GAME_BEGIN'] != null)
    {
        clearInterval(counterInterval)
        console.log('LOCAL GAME READY')
    }

    if(package["SCORE"] != null)
    {
        console.log(JSON.stringify(package['SCORE']))
    }
})


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
