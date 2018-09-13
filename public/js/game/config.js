var config = {
    CANVAS_DIMENSIONS: {
        width : 1800,
        height: 800
    },

    player: {
        size: {
            standard: 40,
            medium: 35,
            small: 25
        },
        reach:{
            distance:{
                standard: 20,
                large: 40,
                small: 10
            },
            duration: {
                standard: 0.3, //seconds
                long: 0.5,
                short: 0.15
            } 
        }
    },

    flag : {
        size: 40
    },

    game: {
        prison: {
            radius: 70,
            location: {
                red: {x: 0,y: 0}, //init later
                green: {x: 0,y: 0} //init later
            }
        },

        spawn: {
            padding: 38,
            location: {
                red: {x: 0,y: 0}, //init later
                green: {x: 0,y: 0} //init later
            }
        }
    }

}

init()



function init()
{
    config.game.prison.location.red = {x: 150,y: config.CANVAS_DIMENSIONS.height/2}
    config.game.prison.location.green = {x: config.CANVAS_DIMENSIONS.width-150,y: config.CANVAS_DIMENSIONS.height/2}

    config.game.spawn.location.red = {x: config.game.spawn.padding ,y: config.CANVAS_DIMENSIONS.height/2}
    config.game.spawn.location.green = {x: config.CANVAS_DIMENSIONS.width - config.game.spawn.padding ,y: config.CANVAS_DIMENSIONS.height/2}

    if(typeof module != "undefined") //server
    {
        module.exports = config
    }
}