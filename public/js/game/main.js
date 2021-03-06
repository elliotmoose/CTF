const callRate = 40
const fps = 60
const LERP_TOLERANCE = 150
// ============================================ UI ============================================ 

//game
var game_menu_item_width = 100
var game_menu_item_height = 50
var eventsPadding = 16

var scoreFontSize = 30
var scoreTopPadding = 30

const CANVAS_DIMENSIONS = config.CANVAS_DIMENSIONS
const DOCUMENT_MARGIN = 8

var CANVAS_HORIZONTAL_OFFSET = (window.innerWidth-CANVAS_DIMENSIONS.width)/2;
var CANVAS_VERTICAL_OFFSET = 22;

//menu
var menuItemWidth = 300
var menuItemHeight = 50

var roomsPadding = 20
var titleFontSize = 20
var spaceBetweenTitleAndList = 4
var refreshButtonHeight = menuItemHeight
var roomsTitleHeight = menuItemHeight
var roomsTableHeight = CANVAS_DIMENSIONS.height - roomsPadding*2 - refreshButtonHeight - roomsTitleHeight - spaceBetweenTitleAndList

//game 
var chatHeight = 25
var chatPadding = 6
var eventsTableHeight = window.innerHeight-CANVAS_VERTICAL_OFFSET*2-CANVAS_DIMENSIONS.height-eventsPadding - chatHeight - chatPadding

var p5setup = false

// ============================================ COLORS ============================================ 
var CANVAS_BG;
var MAP_GREEN;
var MAP_RED;
var WHITE;
var BLACK;
var GREY;
var GOLD;
var PLAYER_RED;
var PLAYER_GREEN;
var PRISON_GREY;

var ROOMS_TITLE_BG_COLOR;
var ROOMS_TABLE_BG_COLOR;
var EVENTS_TEXT_COLOR;
var SCORE_TEXT_COLOR;

//ASSETS
var red_flag_img;
var green_flag_img;

//game
var socket;
var flags = [];
var players = {};
var scores = {0:0,1:0}
var this_player_name = "ANON"

var CONNECTED_TO_ROOM = false
var GAME_IN_PROGRESS = false
var update_clock;
var game_start_time = 0

//ui elements

//      ui - intro 
var start_button;
var name_input;

//      ui - menu
var create_room_input;
var create_room_button;
var rooms_title;
var rooms_table;
var rooms_title_child;
var refresh_button;

//      ui - game
var event_table;
var open_close_menu_button;
var quit_button;
var chat_input;

document.bgColor = "#5a5460"


// socket.on('connect', function () { 
//     console.log('connected')
//     socket.on('disconnect', function() {
//         console.log('disconnected')
//     });
// });
window.onkeydown = function(e) {
    if (e.keyCode == 32 && e.target == document.body && current_scene == "GAME" && document.activeElement != chat_input.elt) {
      e.preventDefault();
    }
};

function preload()
{
    
    red_flag_img = loadImage('/assets/flag_red.png');
    green_flag_img = loadImage('/assets/flag_green.png');

    
}

var scale = 1
function setup()
{   
    //size to fit
    var body = document.getElementsByTagName('body')


    var screen_height = CANVAS_DIMENSIONS.height + eventsTableHeight + chatHeight + eventsPadding + chatPadding + 50
    var screen_width = CANVAS_DIMENSIONS.width

    var ratio = window.innerWidth/window.innerHeight //has to be 3:2
    
    
    if(ratio < screen_width/screen_height) //if the window width is larger
    {
        //configure by width
        scale = window.innerWidth/screen_width
    }
    else
    {
        scale = window.innerHeight/screen_height
    }

    
    body[0].style.transform = `scale(${scale})`

    p5setup = true
    // frameRate(fps)
    MAP_GREEN = color(42, 130, 62)
    MAP_RED = color(155, 49, 49)
    WHITE = color(255, 255, 255,255)
    BLACK = color(0)
    GREY = color(40)
    GOLD = color(255, 207, 34)
    PLAYER_RED = color(252, 93, 93)//red
    PLAYER_GREEN = color(80, 186, 104)//green
    PRISON_GREY = color(50,90)
    CANVAS_BG = color(54, 49, 63)
    ROOMS_TITLE_BG_COLOR = color(94, 83, 104)
    ROOMS_TABLE_BG_COLOR = color(46, 39, 53)
    EVENTS_TEXT_COLOR = color(164, 157, 173)
    SCORE_TEXT_COLOR = color(255, 253, 249)

    //#region DRAW INTRO
 

    name_input = CreateInput('',0,0,menuItemWidth,menuItemHeight,menuItemHeight*3/5,true,null)
    name_input.elt.placeholder = 'ENTER NAME'
    

    start_button = createButton('START')
    start_button.style('font-size',menuItemHeight*2/5+'px')    
    start_button.style('height',menuItemHeight+'px')
    start_button.style('width',menuItemWidth+'px')
    start_button.mousePressed(StartPressed);
    //#endregion

    //#region DRAW MENU
    create_room_input = CreateInput('ROOM NAME',0,0,menuItemWidth,menuItemHeight,menuItemHeight*3/5,true,null)
    create_room_button = CreateButton('CREATE ROOM',0,0,menuItemWidth,menuItemHeight,menuItemHeight*2/5,null,CreateRoomPressed)


    rooms_title = createDiv('')
    rooms_title.style('width','400px')
    rooms_title.style('height',roomsTitleHeight+'px')
    rooms_title.style('background-color',ROOMS_TITLE_BG_COLOR)
    
    rooms_title_child = createDiv('LOBBY')
    rooms_title_child.parent(rooms_title)
    rooms_title_child.style('margin-top',menuItemHeight/2-titleFontSize/2+'px')
    rooms_title_child.style('text-align','center')
    rooms_title_child.style('color',WHITE)
    rooms_title_child.style('font-size',titleFontSize)


    rooms_table = createElement('tbody')
    rooms_table.style('width','400px')
    rooms_table.style('height',roomsTableHeight+'px')
    rooms_table.style('background-color',ROOMS_TABLE_BG_COLOR)
    
    refresh_button = CreateButton('REFRESH',roomsPadding,roomsPadding+roomsTableHeight,400,refreshButtonHeight,menuItemHeight*2/5,null,GetRooms)
    //#endregion

    //#region DRAW GAME
    createCanvas(CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height)
    background(CANVAS_BG)


    open_close_menu_button = CreateButton('MENU',0,0,game_menu_item_width,game_menu_item_height,16,null,ToggleMenu);
    quit_button = CreateButton('QUIT TO LOBBY',0,0,game_menu_item_width,game_menu_item_height,16,null,QuitToLobby);

    
    event_table = createElement('tbody')
    event_table.style('width', CANVAS_DIMENSIONS.width+'px')
    event_table.style('height',eventsTableHeight-8 +'px')
    event_table.style('background-color',ROOMS_TABLE_BG_COLOR)
    event_table.style('padding-left','8px')
    event_table.style('padding-top','6px')
    event_table.style('overflow-y','scroll')

    
    chat_input = CreateInput('Type to send a message...',0,0,CANVAS_DIMENSIONS.width,chatHeight,chatHeight*3/5,true,null)
    chat_input.style('text-align','left')
    chat_input.elt.addEventListener("keyup", function(event) {
        // Cancel the default action, if needed
        event.preventDefault();
        // Number 13 is the "Enter" key on the keyboard
        if (event.keyCode === 13) {
          // Trigger the button element with a click

          var message = {message: chat_input.elt.value, name: this_player_name}
          socket.emit('PLAYER_BROADCAST_MESSAGE',message)
          chat_input.elt.value = ""
        }
      });
    
    PositionMenuItems()
    //#endregion
    
    Scene('INTRO')
}

function GetGameTime()
{
    var time = Math.floor((Date.now() - game_start_time)/1000)
    var mins = Math.floor(time / 60);
    var secs = time - mins * 60;
    var minString = mins < 10? `0${mins}`:`${mins}`
    var secString = secs < 10? `0${secs}`:`${secs}`
    var formattedTime = `${minString}:${secString}`
    return formattedTime
}
function AddToChat(content,style)
{
    var td = createElement('td')
    var tr = createElement('tr')
    var date = new Date()
    tr.parent(event_table)
    td.parent(tr)



    td.html(`${GetGameTime()}: `+content)
    td.style('color',EVENTS_TEXT_COLOR)
    td.style('font-size','16px')
    //td.style('padding-left','8px')
    td.style('padding-top','4px')

    event_table.elt.scrollTop = event_table.elt.scrollHeight
}

//#region ========================================== UI - DOM FUNCTIONS ==========================================
function CreateButton(title,x,y,w,h,fontSize,parent,onclick)
{
    var newButton;
    newButton = createButton(title)
    newButton.style('font-size',fontSize+'px')    
    newButton.style('height',h+'px')
    newButton.style('width',w + 'px')
    newButton.position(x,y);
    newButton.mousePressed(onclick);

    if(parent != null)
    {
        newButton.parent(parent)
    }

    return newButton
}

function CreateInput(placeholder,x,y,w,h,fontSize,clearOnFocus,parent)
{
    var newInput;
    newInput = createInput()
    newInput.elt.placeholder = placeholder
    newInput.style('height',h+'px')
    newInput.style('width',w+'px')
    newInput.style('font-size',fontSize+'px')
    newInput.style('text-align','center')
    
    if(clearOnFocus)
    {
        newInput.elt.onfocus = function(){
            newInput.elt.value = ""
        }    
    }

    if(parent != null)
    {
        newInput.parent(parent)
    }

    newInput.position(x,y);
    
    return newInput
}

function CreateTableCell(table,html)
{
    var td = createElement('td')
    td.parent(table)
    td.html(html)
    td.style('color',EVENTS_TEXT_COLOR)
    td.style('font-size','20px')
    td.style('font-family','Calibri')
    td.style('padding-left','10px')
    td.style('padding-top','8px')

    return td
}

var current_scene = 'INTRO'

function Scene(name)
{
    current_scene = name
    
    if(!p5setup)
    {
        return
    }

    background(CANVAS_BG)

    in_game_menu = false
    countingDown = false
    clearInterval(counterInterval)

    name_input.hide()
    start_button.hide()
    create_room_input.hide()
    create_room_button.hide()
    rooms_title.hide()
    rooms_table.hide()
    refresh_button.hide()
    event_table.hide()
    open_close_menu_button.hide()
    quit_button.hide()
    chat_input.hide()
    
    

    event_table.html("")

    switch(name)
    {
        
        case 'INTRO':
        name_input.show()
        start_button.show()
        break;

        case 'MENU':
        create_room_input.show()
        create_room_button.show()
        rooms_title.show()
        rooms_table.show()
        refresh_button.show()
        break;

        case 'GAME':
        open_close_menu_button.show()
        event_table.show()
        chat_input.show()

        clearInterval(update_clock)
        update_clock = setInterval(Update,1000/callRate)
        break;
    }
}

//#endregion

//#region ========================================== UI ACTIONS ==========================================
function StartPressed()
{
    var player_name = "Some dude"
    if(name_input.elt.value != "" && name_input.elt.value != "ENTER NAME")
    {
        player_name = name_input.elt.value
    }

    this_player_name = player_name


    JoinRoom("/")
    
    Scene("MENU")
    
}

function CreateRoomPressed()
{
    var roomName = this_player_name + "'s room"
    if(create_room_input.elt.value != "" && create_room_input.elt.value != "ROOM NAME")
    {
        roomName = create_room_input.elt.value
    }

    CreateRoom(roomName)
}

function CreateRoom(display_name)
{
    socket.emit('CREATE_ROOM',display_name)
}

function JoinRoom(namespace)
{
    if(socket != null)
    {
        
        socket.disconnect()
        // socket.removeAllListeners()
    }
    
    socket = io(namespace)
    socket.on('JOINED_ROOM',OnJoinedRoom)
    socket.on('JOINED_LOBBY',OnJoinedLobby)
}

function GetRooms()
{
    socket.emit('GET_ROOMS')
}

var in_game_menu = false
function ToggleMenu()
{
    in_game_menu = !in_game_menu
    in_game_menu ? quit_button.show() : quit_button.hide()
}

function QuitToLobby()
{
    JoinRoom('/')
}

//#endregion

//#region ========================================== FRAME FUNCTIONS ==========================================
function Update()
{
    // ========================================== PLAYER MOVEMENT =================================================

    var myPlayer = players[socket.id]

    if(myPlayer == null)
    {
        return
    }

    if(GAME_IN_PROGRESS)
    {
        if(document.activeElement != chat_input.elt)
        {
            if(mouseX != myPlayer.pos.x && mouseY != myPlayer.pos.y )
            {
                console.log({mouseX, mouseY});
                socket.emit('PLAYER_MOVED',{x: mouseX/scale, y:mouseY/scale, sprint: keyIsDown(32)})
            }
        }
    }

    framesSinceLastPing += 1
    //ping every second
    if(framesSinceLastPing > callRate)
    {
        framesSinceLastPing = 0
        
        pingCalls["PING-"+pingCounter] = Date.now()
        socket.emit('PING',pingCounter) 
        pingCounter += 1
    }

}

function keyPressed() {
    if (keyCode === 67) {
        socket.emit('PLAYER_REACH')
    }

    if (document.activeElement == chat_input.elt)
    {
        return true
    }

    if (current_scene != "GAME")
    {
        return true
    }

    return false;
}
var framesSinceLastPing = 0
var pingCounter = 0
var pingCalls = {}
var latestPing = 0
var latestFrameCount = 0

function draw()
{
    // console.log(frameRate())
    // ========================================== UI - GAME =================================================
    if(CONNECTED_TO_ROOM && current_scene == "GAME")
    {
        timeElapsedSincePackage += 1000/frameRate()
        //#region ========================================== UI - MAP =================================================
        
        
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
        ellipse(config.game.prison.location.red.x,config.game.prison.location.red.y,config.game.prison.radius)
        
        //DRAW GREEN PRISON
        fillColor = PRISON_GREY
        fill(fillColor)
        ellipse(config.game.prison.location.green.x,config.game.prison.location.green.y,config.game.prison.radius)

        
        fill(WHITE)
        textSize(30);
        textAlign(CENTER)
        text(`RED: ${scores[0]}`,CANVAS_DIMENSIONS.width/2-180,CANVAS_VERTICAL_OFFSET+45)
        text(`GREEN: ${scores[1]}`,CANVAS_DIMENSIONS.width/2+180,CANVAS_VERTICAL_OFFSET+45)


        //#endregion
        //#region ========================================== UI - PLAYER =================================================
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
            


            var playerSize = thisPlayer.stats.diameter
            var nameLabelWidth = playerSize*3
            var nameLabelOffset = 40
            var playerFontNameSize = 12
            var playerFontHeight = playerFontNameSize+4

            var stamina = thisPlayer.stamina
            var staminaBarMaxWidth = 75
            var staminaBarCurWidth = stamina/thisPlayer.max_stamina*staminaBarMaxWidth
            var staminaBarHeight = playerFontHeight
            var staminaBarRounded = staminaBarHeight/2
            var staminaBarOffset = nameLabelOffset+1


            var timeDiff = (recentPackageTime-previousPackageTime)
            var lerp_weight = Math.min((timeElapsedSincePackage/timeDiff),1)

            if(Vector2Magnitude(Vector2Subtraction(thisPlayer.pos,thisPlayer.old_pos)) > LERP_TOLERANCE)
            {
                lerp_weight = 1
            }

            var lerp_x = lerp(thisPlayer.old_pos.x,thisPlayer.pos.x,lerp_weight)
            var lerp_y = lerp(thisPlayer.old_pos.y,thisPlayer.pos.y,lerp_weight)
            var lerpPos = {x:lerp_x,y:lerp_y}

            if(thisPlayer.isReaching) //reach circle
            {
                fill(PRISON_GREY)
                stroke(GREY)
                strokeWeight(0.7)
                ellipse(lerpPos.x,lerpPos.y,playerSize + thisPlayer.reach*2,playerSize + thisPlayer.reach*2)
            }

            //PLAYER
            fill(fillColor)
            strokeWeight(weight)
            stroke(strokeColor)
            ellipse(lerpPos.x,lerpPos.y,playerSize,playerSize)

            //PLAYER STAMINA
            noStroke()

            fill(PLAYER_RED)
            rect(lerpPos.x-staminaBarMaxWidth/2,lerpPos.y - staminaBarOffset,staminaBarMaxWidth,staminaBarHeight,staminaBarRounded)

            fill(PLAYER_GREEN)
            rect(lerpPos.x-staminaBarMaxWidth/2,lerpPos.y - staminaBarOffset,staminaBarCurWidth,staminaBarHeight,staminaBarRounded)

            //PLAYER NAME
            textAlign(CENTER)
            textSize(12)
            fill(WHITE)
            textSize(playerFontNameSize)
            text(thisPlayer.display_name,lerpPos.x - nameLabelWidth/2,lerpPos.y - nameLabelOffset,nameLabelWidth,staminaBarHeight)

        }

        

        //#endregion
        //#region ========================================== UI - FLAGS =================================================
        for(var flag of flags)
        {
            let team_flag_image = flag.team==0?red_flag_img : green_flag_img

            if(Vector2Magnitude(Vector2Subtraction(flag.pos,flag.old_pos)) > LERP_TOLERANCE)
            {
                image(team_flag_image,flag.pos.x-config.flag.size/2,flag.pos.y-config.flag.size/2,config.flag.size,config.flag.size)
                continue
            }
            
            var lerp_weight = Math.min((timeElapsedSincePackage/(recentPackageTime-previousPackageTime)),1)
            var lerp_x = lerp(flag.old_pos.x,flag.pos.x,lerp_weight)
            var lerp_y = lerp(flag.old_pos.y,flag.pos.y,lerp_weight)
            var lerpPos = {x:lerp_x,y:lerp_y}

            image(team_flag_image, lerp_x-config.flag.size/2,lerp_y-config.flag.size/2,config.flag.size,config.flag.size)
        }
        //#endregion
    }

    


    if(CONNECTED_TO_ROOM && current_scene == "GAME")
    {
        //#region ========================================== UI - COUNT DOWN TEXT ==========================================
        noStroke()
        // fill(100,countdownAlpha*100)
        fill(255,255,255,countdownAlpha*255)
        textSize(150);
        textAlign(CENTER)
        text(countDownText,CANVAS_DIMENSIONS.width/2 - 100,CANVAS_DIMENSIONS.height/2-100, 200,200)

        countdownAlpha -= 1/frameRate()

        //#endregion
        
        //#region ========================================== UI - BENCHMARK UI ==========================================
        fill(WHITE)
        textSize(20)
        text(`Ping: ${latestPing}`,CANVAS_DIMENSIONS.width - 100,50, 100,30)
        text(`Server Fps: ${latestFrameCount}`,CANVAS_DIMENSIONS.width - 165,18, 165,30)

        //#region ========================================== UI - TIMER ==========================================
        var timerFontSize = 40
        textSize(timerFontSize)
        textAlign(LEFT)
        text(GetGameTime(),22,CANVAS_DIMENSIONS.height - 22)
    }
    


}


function windowResized()
{
    CANVAS_HORIZONTAL_OFFSET = (window.innerWidth-CANVAS_DIMENSIONS.width)/2;
    PositionMenuItems()
}

function PositionMenuItems()
{
    name_input.position(CANVAS_HORIZONTAL_OFFSET+CANVAS_DIMENSIONS.width/2-menuItemWidth/2,CANVAS_VERTICAL_OFFSET+ CANVAS_DIMENSIONS.height/2-menuItemHeight);
    start_button.position(CANVAS_HORIZONTAL_OFFSET+CANVAS_DIMENSIONS.width/2-menuItemWidth/2, CANVAS_VERTICAL_OFFSET+CANVAS_DIMENSIONS.height/2);

    create_room_input.position(CANVAS_HORIZONTAL_OFFSET+CANVAS_DIMENSIONS.width/2-menuItemWidth/2, CANVAS_VERTICAL_OFFSET+CANVAS_DIMENSIONS.height/2-menuItemHeight);
    create_room_button.position(CANVAS_HORIZONTAL_OFFSET+CANVAS_DIMENSIONS.width/2-menuItemWidth/2,CANVAS_VERTICAL_OFFSET+CANVAS_DIMENSIONS.height/2)

    refresh_button.position(CANVAS_HORIZONTAL_OFFSET+roomsPadding,CANVAS_VERTICAL_OFFSET+roomsPadding+roomsTableHeight)
    rooms_title.position(CANVAS_HORIZONTAL_OFFSET+roomsPadding,CANVAS_VERTICAL_OFFSET+roomsPadding)
    rooms_table.position(CANVAS_HORIZONTAL_OFFSET+roomsPadding,CANVAS_VERTICAL_OFFSET+roomsPadding+spaceBetweenTitleAndList+roomsTitleHeight)

    open_close_menu_button.position((window.innerWidth)/2-game_menu_item_width/2,CANVAS_VERTICAL_OFFSET+22);
    quit_button.position((window.innerWidth)/2-game_menu_item_width/2,CANVAS_VERTICAL_OFFSET+22 + game_menu_item_height + 22);
    // event_table.position(CANVAS_DIMENSIONS.width+12,8)
    
    eventsTableHeight = window.innerHeight-CANVAS_VERTICAL_OFFSET*2-CANVAS_DIMENSIONS.height-eventsPadding - chatHeight - chatPadding
    event_table.style('height',eventsTableHeight + 'px')
    event_table.position(CANVAS_HORIZONTAL_OFFSET,CANVAS_VERTICAL_OFFSET + CANVAS_DIMENSIONS.height + eventsPadding)
    chat_input.position(CANVAS_HORIZONTAL_OFFSET,CANVAS_VERTICAL_OFFSET + CANVAS_DIMENSIONS.height + eventsPadding + eventsTableHeight + chatPadding*2)
}

//#endregion

//#region ========================================== STATE INITIALIZERS =================================================

function OnJoinedLobby() //AFTER JOIN LOBBY ===== INIT LOBBY CALLBACKS
{
    console.log('JOINED LOBBY')
    socket.on('ROOMS',function(rooms){
        rooms_table.html('')
        for(var key in rooms)
        {
            var room = rooms[key]
            var newTableItem = CreateTableCell(rooms_table)
            var newButton = CreateButton(room.display_name,0,0,400,30,20,newTableItem,function(){
                JoinRoom(key)
            })
        }
    })

    socket.on('ON_ROOM_CREATED',function(newNameSpace){
        AddToChat(`You(${this_player_name}) created a room`)
        console.log('I CREATED A ROOM' + newNameSpace)  
    })
    
    socket.on('SET_NAMESPACE',function(newNameSpace){
        
        console.log('JOINING ROOM ' + newNameSpace)
        JoinRoom(newNameSpace)
    })

    //GAME
    CONNECTED_TO_ROOM = false
    GAME_IN_PROGRESS = false

    GetRooms()

    //UI
    Scene('MENU')
}

function OnJoinedRoom(room_metadata) //AFTER JOIN ROOM ===== INIT LOBBY ROOM
{
    //UI
    Scene('GAME')

    game_start_time = room_metadata.create_time
    AddToChat('JOINED ROOM: ' + room_metadata.roomId,0)

    socket.on('FULL_PACKAGE',function(package){
        ReceivePackage(package,socket.nsp)
    })

    socket.on('PLAYER_DISCONNECTED',PlayerDisconnected)
    socket.on('IN_GAME_MESSAGE',ReceiveGameMessage)
    
    socket.on('PLAYER_BROADCAST_MESSAGE',ReceiveGamePlayerMessage)
    socket.on('SERVER_FRAME_CHECK',function(frameCount){
        // AddToChat('SERVER RUNNING AT FRAMES: ' + frameCount,0)
        latestFrameCount = frameCount
    })

    socket.on('PING_RETURN',function(id){
        var callTime = pingCalls["PING-"+id]
        latestPing = Date.now() - callTime
        pingCalls[id] = undefined
    })

    socket.on('disconnect', function() {
        console.log('disconnected')
        AddToChat("You have been disconnected. Please refresh the page",0)
    });


    //GAME
    CONNECTED_TO_ROOM = true
    GAME_IN_PROGRESS = true
    previousPackageTime = 0
    recentPackageTime = 0

    

    socket.emit('PLAYER_INITIALIZED',this_player_name)
}

//#endregion

//#region GAME EVENTS
var countDown = 3;
var countDownText = ''
var countingDown = false
var countdownAlpha = 0;
var counterInterval;
var previousPackageTime = 0
var recentPackageTime = 0
var timeElapsedSincePackage = 0
function ReceivePackage(package,nsp){
    previousPackageTime = recentPackageTime
    recentPackageTime = Date.now()
    timeElapsedSincePackage = 0


    // console.log('received' + new Date().getSeconds())

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

        clearInterval(counterInterval)
    }

    if(package["COUNTDOWN_BEGIN"] != null)
    {
        GAME_IN_PROGRESS = false
        countingDown = true
        countDown = 3
        countDownText = '3'
        countdownAlpha = 1
        
        counterInterval = setInterval(function(){
            countDown-=1
            countdownAlpha = 1 //SHOW COUNT DOWN UI
            
            if(countDown <= 0)
            {
                countDownText = 'GO'
            }
            else
            {
                countDownText = `${countDown}`
            }
        },1000)
    }

    if(package['GAME_BEGIN'] != null)
    {
        GAME_IN_PROGRESS = true
        clearInterval(counterInterval)
        countingDown = false
    }

    if(package["SCORE"] != null)
    {
        scores = package["SCORE"]
    }

    if(package["TEAM_WIN"] != null)
    {
        var winner = package["TEAM_WIN"]
        GAME_IN_PROGRESS = false
    }

}



function ReceiveGameMessage(message)
{
    AddToChat(message.content,message.style)
}

function ReceiveGamePlayerMessage(message)
{
    AddToChat(`${message.name}: ${message.message}`)
}

function PlayerDisconnected(disconnected_player_data){
    delete players[disconnected_player_data.id]
}

//#endregion

//#region HELPER FUNCTIONS
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


