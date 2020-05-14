const { Op, fn, col, literal, where } = require('sequelize');
const Game = require('../models/game');
const User = require('../models/user');
const Player = require('../models/player');
const Conversation = require('../models/conversation');
const Participant = require('../models/participant');
const Message = require('../models/message');
const validator = require('validator');
const dateTool = require('../util/dateTool');
const { withFilter } = require('apollo-server');
const pubsub = require('../util/redis');
const { SPORT } = require('../util/lists');

const debug = require('debug')('game');

GAMES_PER_PAGE = 15;

const resolvers = {
    Subscription: {
        gameAdded: {
            subscribe: withFilter(
                () => pubsub.asyncIterator('GAME_ADDED'), 
                (payload, variables) => {
                    const p = {
                        x: payload.gameAdded.node.location.coordinates[1],
                        y: payload.gameAdded.node.location.coordinates[0]
                    }
                    const bb = {
                        ix: variables.bounds[3],
                        iy: variables.bounds[2],
                        ax: variables.bounds[1],
                        ay: variables.bounds[0] 
                    }
                    // Make sure game is within users map bounds before sending 
                    const withinBounds = ( bb.ix <= p.x && p.x <= bb.ax && bb.iy <= p.y && p.y <= bb.ay )
                    // Don't send if game is beyond users datetime cursor unless user is looking at less than 15 games
                    return withinBounds && ((payload.gameAdded.node.dateTime < variables.cursor) || (variables.numGames < 15))
                }
            )
        },
        gameDeleted: {
            subscribe: withFilter(
                () => pubsub.asyncIterator('GAME_DELETED'), 
                (payload, variables) => {
                    // Only send if game user is currently looking at was deleted
                    return variables.loadedGames.includes(payload.gameDeleted);
                }
            )
        },
        participantJoined: {
            subscribe: withFilter(
                () => pubsub.asyncIterator('NEW_PARTICIPANT'),
                (payload, variables) => {
                    // Send if user is currently on the game page where participant was added
                    return variables.gameId === payload.gameId;
                }
            )
        },
        participantLeft: {
            subscribe: withFilter(
                () => pubsub.asyncIterator('PARTICIPANT_LEFT'),
                (payload, variables) => {
                    // Send if user is currently on the game page where participant left
                    return variables.gameId === payload.gameId;
                }
            )
        },
        notificationGame: {
            subscribe: withFilter(
                () => pubsub.asyncIterator('NOTIFICATION'),
                (payload, variables) => {
                    // Don't send notifications for your own actions
                    if (payload.currentUser == variables.userId) return false;
                    // Send notification if there was an update to a conversation a user is participating in
                    return Participant.findOne({
                        raw: true,
                        where: {
                            conversationId: payload.conversationId,
                            userId: variables.userId,
                            level: {
                                [Op.ne]: 3
                            }
                        }
                    })
                    .then( result => {
                        if (result) return true;
                    })
                }
            )
        }
    },
    Query: {
        /************************** 
        *     ADMIN FUNCTIONS     *
        ***************************/
        gamesAdmin: (parent, args, context) => {
            // Only admin user (mjw) can view full games list
            if (context.user != 1) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            let cursor = args.cursor ? args.cursor : 0;

            return Game.findAll({
                where: {
                    id: {
                        [Op.gt]: cursor
                    }
                },
                limit: 15
            })
            .then( games => {
                return games;
            }).catch(error => {
                debug(error);
                throw error;
            });
        },
        // Get public games feed for your area 
        // Need SQL group by mode = '' for this query to work!
        games: (parent, args, context) => {

            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();
            let category = args.category ? args.category : "ALL"
            let sport = args.sport ? args.sport : "ALL"
            let startDate = args.startDate ? args.startDate : "ALL"
            let bounds = (args.bounds && args.bounds.length === 4) ? args.bounds : [47.7169839910907, -122.32040939782564, 47.54058537009015, -122.3709744021744];

            const polygon = `POLYGON((${bounds[0].toString()}  ${bounds[1].toString()}, ${bounds[0].toString()}  ${bounds[3].toString()}, ${bounds[2].toString()}  ${bounds[3].toString()}, ${bounds[2].toString()}  ${bounds[1].toString()}, ${bounds[0].toString()}  ${bounds[1].toString()}))`;

            let options = {
                subQuery: false,
                raw: true,
                where: {
                    dateTime: {
                        [Op.gt]: cursor
                    }, 
                    location: where(
                        fn(
                            'ST_Within',
                            col('location'),
                            fn('ST_GEOMFROMTEXT', polygon)
                        ),
                        1
                    ),
                    public: true
                },
                limit: GAMES_PER_PAGE, 
                attributes: { 
                    include: [
                        [fn("COUNT", col("users.id")), "players"],
                        [literal('(spots - COUNT(`users`.`id`) - spotsReserved)'), 'openSpots']
                    ] 
                },
                include: [{
                    model: User, attributes: []
                }],
                order: [
                    ["dateTime", "ASC"]
                ],
                group: ['game.id', 'spots', 'spotsReserved', 'players', 'openSpots'],
            };

            if (category !== "ALL") {
                options.where.category = category; 
            }

            if (sport !== "ALL") {
                options.where.sport = sport; 
            }

            if (startDate !== "ALL") {
                if (startDate === "TODAY") {
                    options.where.dateTime = {
                        [Op.gt]: cursor,
                        [Op.lt]: dateTool.getTomorrow().valueOf()
                    }
                }
                else if (startDate === "TOMORROW") {
                    options.where.dateTime = {
                        [Op.gt]: dateTool.getTomorrow().valueOf(),
                        [Op.lt]: dateTool.getDayAfterTomorrow().valueOf()
                    }
                }
                else if (startDate === "LATERTHISWEEK") {
                    options.where.dateTime = {
                        [Op.gt]: dateTool.getDayAfterTomorrow().valueOf(),
                        [Op.lt]: dateTool.getEndOfWeek().valueOf()
                    }
                }
                else if (startDate === "NEXTWEEK") {
                    options.where.dateTime = {
                        [Op.gt]: dateTool.getEndOfWeek().valueOf(),
                        [Op.lt]: dateTool.getEndOfNextWeek().valueOf()
                    }
                }
                else if (startDate === "LATER") {
                    options.where.dateTime = {
                        [Op.gt]: dateTool.getEndOfNextWeek().valueOf()
                    }
                }
            }

            if (args.openSpots > 0) {
                options.having = literal('(spots - COUNT(`users`.`id`) - spotsReserved) > (' + args.openSpots + ' - 1)')
            }
            
            // Find all games not in the past
            return Game.findAndCountAll(options)
            .then( result => {
                let edges = [], endCursor; 
                result.rows.map( (game, index) => {
                    edges.push({
                        cursor: game.dateTime,
                        node: game
                    });

                    if (index === result.rows.length - 1) {
                        endCursor = game.dateTime;
                    }
                })
                return {
                    totalCount: result.count,
                    edges: edges,
                    pageInfo: {
                        endCursor: endCursor,
                        hasNextPage: result.count.length > GAMES_PER_PAGE
                    }
                }
            })
            .catch(error => {
                debug(error)
                throw error;
            });
        },
        // Get game info for game page
        game: (parent, args, context) => {
            // Don't allow users to view games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return Game.findOne({
                where: {
                    id: args.id
                },
                attributes: { 
                    include: [
                        [fn("COUNT", col("users.id")), "players"],
                    ] 
                },
                include: [{
                    model: User, attributes: []
                }],
            })
            .then( game => {
                if (!game.id) {
                    const error = new Error('Could not find game');
                    error.code = 404;
                    throw error;
                } 
                // If game is private, check if user has been invited
                else if (!game.public) {
                    return Participant.findOne({
                        where: {
                            conversationId: game.conversationId,
                            userId: context.user
                        }
                    })
                    .then( participant => {
                        if (participant) {
                            return game.dataValues;
                        } else {
                            const error = new Error('Unauthorized user');
                            error.code = 401;
                            throw error;
                        }
                    })
                }
                else {
                    return game.dataValues;
                }
            }).catch(error => {
                debug(error);
                throw error;
            });
        },
        // Get host for a game
        host: (parent, args, context) => {
            // Don't allow users to view games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return Player.findOne({
                raw: true,
                where: {
                    gameId: args.gameId,
                    level: 1
                }
            })
            .then(host => {
                if (!host) {
                    const error = new Error('Could not find host');
                    error.code = 404;
                    throw error;
                } else {
                    return { 
                        level: 1,
                        userId: host.userId,
                        isMe: host.userId == context.user 
                    };
                }  
            })
            .catch(error => {
                debug(error);
                throw error;
            })
        },
        // Get players for game
        players: (parent, args, context) => {
            // Don't allow users to view games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return Player.findAll({
                raw: true,
                where: {
                    gameId: args.gameId
                }
            })
            .then( players => {
                return players.map( p => {
                    // Reserved spot
                    if (p.level === 3) {
                        let participant = {
                            level: p.level,
                            profilePic: process.env.IMAGE_PATH + 'profile-blank_THUMB.jpg',
                            isMe: false,
                            player: true
                        };
                        return participant;
                    }
                    else {
                        return User.findOne({
                            raw: true,
                            where: {
                                id: p.userId
                            }
                        })
                        .then( user => {
                            if (!user) {
                                const error = new Error('There is no user associated with this player');
                                throw error;
                            }
    
                            let participant = {
                                userId: user.id, 
                                name: user.name,
                                level: p.level,
                                profilePic: user.profilePic,
                                isMe: user.id == context.user,
                                player: true
                            };
                            return participant;
                        })
                    }
                })
            })
            .catch(error => {
                debug(error)
                throw error;
            });
        },
        // Get users interested and invited to a game
        watchers: (parent, args, context) => {
            // Don't allow users to view games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return Participant.findAll({
                where: {
                    conversationId: args.conversationId,
                    level: {
                        [Op.ne]: 1
                    }
                }
            })
            .then( results => {
                return results.map( p => {
                    return User.findOne({
                        raw: true,
                        where: {
                            id: p.userId
                        }
                    })
                    .then( user => {
                        if (!user) {
                            const error = new Error('There is no user associated with this participant');
                            throw error;
                        }

                        let watcher = {
                            userId: user.id, 
                            name: user.name,
                            level: p.level,
                            profilePic: user.profilePic,
                            isMe: user.id == context.user
                        };
                        return watcher;
                    })
                })
            })
            .catch(error => {
                debug(error);
                throw error;
            })
        },
        // Get user specific game feed, can be used for getting upcoming games or past games (game history)
        userGames: (parent, args, context) => {
            if (!context.isAuth) return {
                totalCount: 0,
                edges: [],
                pageInfo: {
                    endCursor: null,
                    hasNextPage: false
                }
            }

            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();
            let direction, order;
            // Only preview the first 3 of your upcoming games at a time
            // Show 3 past games at a time 
            let limit = 3;

            // Default direction = future
            if (args.pastGames) {
                direction = {
                    [Op.lt]: cursor
                };
                order = [
                    [literal('game.dateTime'), 'DESC']
                ];
            } else {
                direction = {
                    [Op.gt]: cursor
                };
                order = [
                    [literal('game.dateTime'), 'ASC']
                ];
            }

            let options = {
                where: {
                    userId: args.userId || context.user
                },
                include: [
                    {
                        model: Game,
                        where: {
                            dateTime: direction
                        }
                    }
                ],
                // Only preview the first 3 of your upcoming games at a time 
                limit: limit,
                order: order
            }

            // Get games through player association search
            return Player.findAndCountAll(options)
            .then( result => {
                let edges = [], endCursor;
                result.rows.map( (player, index) => {
                    edges.push({
                        node: player.game,
                        cursor: player.game.dateTime,
                        level: player.level
                    });

                    if (index === result.rows.length - 1) {
                        endCursor = player.game.dateTime;
                    }
                })

                return {
                    totalCount: result.count,
                    edges: edges,
                    pageInfo: {
                        endCursor: endCursor,
                        hasNextPage: result.count > limit
                    }
                };
            })
        },
    },
    Mutation: {
        createGame: (parent, args, context) => {
            // Don't allow users to create games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Must be logged in to create game');
                error.code = 401;
                throw error;
            }

            let { title, dateTime, endDateTime, venue, address, coords, category, sport, spots, spotsReserved, description, public } = args.gameInput;
            let image;
            const errors = [];

            const now = new Date();
            const d = new Date(dateTime);
            if (!endDateTime) {
                const d2 = new Date(dateTime);
                endDateTime = d2.setTime(d2.getTime() + (2*60*60*1000));
            }
            const endD = new Date(endDateTime);

            if (!title || !dateTime || !sport || !category || !description || !spots || (public === null)) {
                const error = new Error('Please fill in all fields');
                error.code = 401;   
                throw error;
            }

            if (title.length > 50) {
                errors.push({ 
                    message: 'Title must be fewer than 50 characters',
                    field: 'title' 
                });
            }

            if (category !== "SPORT" && category !== "BOARD" && category !== "CARD" && category !== "VIDEO") {
                errors.push({ 
                    message: 'Please select a valid category',
                    field: 'category' 
                });
            }
            if (!address && !venue) {
                errors.push({ 
                    message: 'Please select a valid address',
                    field: 'address' 
                });
            }
            if ((spots < 2) || (spots > 32)) {
                errors.push({ 
                    message: 'Number of players must be between 2-32',
                    field: 'spots' 
                });
            }
            if (spotsReserved > (spots - 2)) {
                errors.push({ 
                    message: 'Need at least 1 unreserved spot for public game',
                    field: 'spots' 
                });
            }
            if (!validator.isLength(description, { min: undefined, max: 1000 })) {
                errors.push({ 
                    message: 'Description must be less than 1000 characters',
                    field: 'description' 
                });
            }
            if (!(parseInt(d.valueOf()) > parseInt(now.valueOf()))) {
                errors.push({ 
                    message: 'Start date cannot be in the past',
                    field: 'date' 
                });
            }
            if (!(parseInt(endD.valueOf()) > parseInt(d.valueOf()))) {
                errors.push({ 
                    message: 'End date cannot be before starting date',
                    field: 'endDate' 
                });
            }

            if (errors.length > 0) {
                const error = new Error('Could not create game');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            if (category === "SPORT" && SPORT.find( s => s.value === sport)) {
                image = "/" + sport + ".png";
            }  
            else if (category === "SPORT") {
                image = "/REC-BOARD.png"
            }
            else if (category === "BOARD") {
                image = "/BOARD.png";
            }
            else if (category === "CARD") {
                image = "/CARD.png";
            }
            else if (category === "VIDEO") {
                image = "/VIDEO.png";
            }

            // Check if user is already hosting a game during this time period
            return Player.findAndCountAll({
                where: {
                    userId: context.user,
                    level: 1
                },
                include: [
                    {
                        model: Game,
                        // Find how many games user is hosting on this day
                        // TODO: Get overlap prevention working
                        where: {
                            dateTime: {
                                [Op.gte]: dateTool.getStartofDay(dateTime),
                                [Op.lte]: dateTool.getEndofDay(dateTime)
                            }
                        }
                    }
                ],
            })
            .then( result => {
                if (result.count > 2) {
                    const error = new Error('Cannot host more than 3 games in one day');
                    error.code = 401;
                    throw error;
                } 
                else {
                    // Each game gets a corresponding conversation
                    return Conversation.create({ title: title })
                    .then( conversation => {
                        return Game.create({
                            title: title,
                            dateTime: dateTime,
                            endDateTime: endDateTime,
                            venue: venue,
                            address: address,
                            location: { type: 'Point', coordinates: coords },
                            category: category,
                            sport: sport,
                            spots: spots,
                            spotsReserved: spotsReserved,
                            description: description,
                            public: public,
                            conversationId: conversation.id,
                            image: image
                        })
                        .then( game => {
                            // Create the host player
                            return Player.create({
                                level: 1,
                                gameId: game.id,
                                userId: context.user
                            })
                            .then(() => {
                                // Add the host as a participant in the game conversation
                                return Participant.create({
                                    conversationId: conversation.id,
                                    userId: context.user,
                                    hasUpdate: false
                                })
                                .then(() => {
                                    if (game.dataValues.public) {
                                        const gameAdded = {
                                            gameAdded: {
                                                cursor: game.dataValues.dateTime,
                                                node: {
                                                    id: game.dataValues.id,
                                                    title: game.dataValues.title,
                                                    sport: game.dataValues.sport,
                                                    venue: game.dataValues.venue,
                                                    dateTime: game.dataValues.dateTime,
                                                    location: game.dataValues.location,
                                                    spots: game.dataValues.spots,
                                                    players: game.dataValues.spots - 1
                                                }
                                            }
                                        };

                                        pubsub.publish('GAME_ADDED', gameAdded);
                                    }
                                    
                                    // Create reserved player spots
                                    if (spotsReserved > 0) {
                                        for (i = 0; i < spotsReserved; i++) {
                                            Player.create({
                                                level: 3,
                                                gameId: game.id
                                            })
                                        }
                                    }
                                    return game;
                                });
                            });
                        });
                    });
                }
            })
            .catch(error => {
                // debug(error)
                throw error;
            });
        },
        updateGame: (parent, args, context) => {
            // Don't allow users to update games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Must be logged in to update game');
                error.code = 401;
                throw error;
            }

            let { title, dateTime, endDateTime, venue, address, coords, category, sport, spots, spotsReserved, description, public } = args.gameInput;
            let image;
            const errors = [];

            const now = new Date();
            const d = new Date(dateTime);
            const endD = new Date(endDateTime);

            if (!title || !dateTime || !sport || !category || !description || !spots || (public === null)) {
                const error = new Error('Please fill in all fields');
                error.code = 401;   
                throw error;
            }

            if (category !== "SPORT" && category !== "BOARD" && category !== "CARD" && category !== "VIDEO") {
                errors.push({ 
                    message: 'Please select a valid category',
                    field: 'category' 
                });
            }
            if (!address && !venue) {
                errors.push({ 
                    message: 'Please select a valid address',
                    field: 'address' 
                });
            }
            if ((spots < 2) || (spots > 32)) {
                errors.push({ 
                    message: 'Number of players must be between 2-32',
                    field: 'spots' 
                });
            }
            if (spotsReserved > (spots - 2)) {
                errors.push({ 
                    message: 'Need at least 1 unreserved spot for public game',
                    field: 'spots' 
                });
            }
            if (!validator.isLength(description, { min: undefined, max: 1000 })) {
                errors.push({ 
                    message: 'Description must be less than 1000 characters',
                    field: 'description' 
                });
            }
            if (!(parseInt(d.valueOf()) > parseInt(now.valueOf()))) {
                errors.push({ 
                    message: 'Start date cannot be in the past',
                    field: 'date' 
                });
            }
            if (!(parseInt(endD.valueOf()) > parseInt(d.valueOf()))) {
                errors.push({ 
                    message: 'End date cannot be before starting date',
                    field: 'endDate' 
                });
            }

            if (errors.length > 0) {
                const error = new Error('Could not update game');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            if (category === "SPORT" && SPORT.find( s => s.value === sport)) {
                image = "/" + sport + ".png";
            }  
            else if (category === "SPORT") {
                image = "/REC-BOARD.png"
            }
            else if (category === "BOARD") {
                image = "/BOARD.png";
            }
            else if (category === "CARD") {
                image = "/CARD.png";
            }
            else if (category === "VIDEO") {
                image = "/VIDEO.png";
            }

            return Game.findOne({
                where: {
                    id: args.id
                },
                attributes: { 
                    include: [
                        [fn("COUNT", col("users.id")), "players"],
                    ] 
                },
                include: [{
                    model: User, attributes: []
                }],
            }) 
            .then( game => {
                if (!game) {
                    const error = new Error('Could not find game');
                    throw error;
                }

                if (spots < game.dataValues.players) {
                    const error = new Error('Claimed player spots cannot be removed');
                    throw error;
                }

                if (spotsReserved >= (spots - game.dataValues.players)) {
                    const error = new Error('Claimed player spots cannot be reserved');
                    throw error;
                }

                return Player.findOne({
                    raw: true,
                    where: {
                        gameId: game.id,
                        level: 1
                    }
                })
                .then(host => {
                    const oldSpotsReserved = game.dataValues.spotsReserved;
                    const oldAddress = game.dataValues.address;
                    const oldDateTime = game.dataValues.dateTime;
                    if (host.userId != context.user) {
                        const error = new Error('Only host can edit game');
                        throw error;
                    } 
                    else {
                        return game.update({
                            title: title || game.title,
                            dateTime: dateTime || game.dateTime,
                            endDateTime: endDateTime || game.endDateTime,
                            venue: venue || game.venue,
                            address: address || game.address,
                            location: coords ? {type: 'Point', coordinates: coords} : game.location,
                            category: category || game.category,
                            sport: sport || game.sport,
                            spots: spots || game.spots,
                            spotsReserved: (spotsReserved != null) ? spotsReserved : game.spotsReserved,
                            description: description || game.description,
                            public: public,
                            image: sport ? image : game.image
                        }) 
                        .then( result => {
                            if (!result) {
                                const error = new Error('Could not update game');
                                throw error;
                            } else { 
                                // If address or date/time are changed send a notification
                                if (oldAddress.localeCompare(result.getDataValue('address')) != 0 || oldDateTime.toString().localeCompare(result.getDataValue('dateTime').toString()) != 0) {
                                    let content;
                                    if (oldAddress.localeCompare(result.getDataValue('address')) != 0 && oldDateTime.toString().localeCompare(result.getDataValue('dateTime').toString()) != 0) {
                                        content = "updated game time and location";
                                    }
                                    else if (oldAddress.localeCompare(result.getDataValue('address')) != 0) {
                                        content = "updated game location";
                                    }
                                    else if (oldDateTime.toString().localeCompare(result.getDataValue('dateTime').toString()) != 0) {
                                        content = "updated game time";
                                    }

                                    User.findOne({
                                        where: {
                                            id: context.user
                                        }
                                    }).then( user => {
                                        Message.create({
                                            content: content,
                                            author: user.name,
                                            type: 4,
                                            gameId: game.id,
                                            conversationId: game.conversationId,
                                            userId: context.user
                                        })
                                        .then((message) => {

                                            pubsub.publish('MESSAGE_ADDED', {
                                                messageAdded: {
                                                    node: message.dataValues,
                                                    cursor: message.dataValues.createdAt,
                                                    userPic: user.profilePic
                                                }
                                            });
                        
                                            pubsub.publish('NOTIFICATION', { 
                                                conversationId: game.conversationId, currentUser: context.user
                                            });
                                        })
                                    })
                                }
                                   
                                // If reserved spots were added or taken away -> add/remove them
                                if (result.dataValues.spotsReserved > oldSpotsReserved) {
                                    let promises = [];
                                    // create new reserved player spots
                                    for (i = 0; i < result.dataValues.spotsReserved - oldSpotsReserved; i++) {
                                        promises.push(Player.create({
                                            gameId: args.id,
                                            level: 3
                                        })
                                        .then(() => {
                                            pubsub.publish('NEW_PARTICIPANT', {
                                                participantJoined: { level: 3, player: true, profilePic: process.env.IMAGE_PATH + 'profile-blank_THUMB.jpg' }, gameId: args.id
                                            });
                                        }))
                                    }

                                    return Promise.all(promises)
                                    .then(() => {
                                        return result
                                    })
                                } 
                                else if (result.dataValues.spotsReserved < oldSpotsReserved) {
                                    let promises = [];
                                    // remove unneeded reserved player spots
                                    for (i = 0; i < oldSpotsReserved - result.dataValues.spotsReserved; i++) {
                                        promises.push(Player.destroy({
                                            where: {
                                                gameId: args.id,
                                                level: 3
                                            },
                                            limit: oldSpotsReserved - result.dataValues.spotsReserved
                                        })
                                        .then(() => {
                                            pubsub.publish('PARTICIPANT_LEFT', {
                                                participantLeft: { level: 3, player: true, number: oldSpotsReserved - result.dataValues.spotsReserved }, gameId: args.id
                                            });
                                        }))

                                        return Promise.all(promises)
                                        .then(() => {
                                            return result
                                        })
                                    }
                                } else {
                                    return result;
                                }
                            } 
                        })
                    } 
                }); 
            })
            .catch(error => {
                debug(error)
                throw error;
            });          
        },
        deleteGame: (parent, args, context) => {
            // Don't allow users to delete games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Must be logged in to cancel game');
                error.code = 401;
                throw error;
            }

            return Game.findOne({
                where: {
                    id: args.gameId
                }
            })
            .then( game => {
                if (!game) {
                    const error = new Error('Could not find game');
                    throw error;
                }

                return Player.findOne({
                    raw: true,
                    where: {
                        gameId: game.id,
                        level: 1
                    }
                })
                .then(host => {
                    if (host.userId != context.user) {
                        const error = new Error('Only host can cancel game');
                        error.code = 401;
                        throw error;
                    } 
                    else {
                        // Delete the corresponding conversation
                        return Conversation.destroy({
                            where: {
                                id: game.conversationId
                            }
                        })
                        .then( rowsDeleted => {
                            if (rowsDeleted === 1) {
                                return game.destroy()
                                .then( result => {
                                    if (result) {
                                        pubsub.publish('GAME_DELETED', {
                                            gameDeleted: args.gameId
                                        })
                                        return true;
                                    } else {
                                        const error = new Error('Could not cancel game');
                                        throw error;
                                    }
                                }) 
                            } else {
                                const error = new Error('Could not cancel game');
                                throw error;
                            }
                        })
                    }
                })      
            })
            .catch(error => {
                debug(error);
                throw error;
            });
        },
        joinGame: (parent, args, context) => {
            // Don't allow users to join games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Must be logged in to join game');
                error.code = 401;
                throw error;
            }

            return Game.findOne({
                where: {
                    id: args.gameId
                },
                attributes: { 
                    include: [
                        [fn("COUNT", col("users.id")), "players"],
                        [literal('(spots - COUNT(`users`.`id`) - spotsReserved)'), 'openSpots']
                    ] 
                },
                include: [{
                    model: User, attributes: []
                }],
            })
            .then( game => {
                if (game.dataValues.players >= game.dataValues.spots) {
                    const error = new Error('Cannot join, game is full');
                    error.code = 401;
                    throw error;
                }
                // Check to see if user was invited - if so they can take a reserved spot
                return Participant.findOne({
                    where: {
                        conversationId: args.conversationId,
                        userId: context.user
                    }
                })
                .then( participant => {
                    // Can join either way (game isn't full) - fill a reserved spot
                    if (participant && participant.invited) {
                        // Get reserved player spot to update
                        return Player.findOrCreate({
                            where: {
                                level: 3,
                                gameId: args.gameId
                            },
                            defaults: {
                                level: 2,
                                gameId: args.gameId,
                                userId: context.user
                            }
                        })
                        .spread((player, created) => {
                            // If there was a reserved spot update it
                            if (!created) {
                                return player.update({
                                    level: 2,
                                    userId: context.user
                                })
                                .then(() => {
                                    return game.update({ 
                                        spotsReserved: game.dataValues.spotsReserved - 1
                                    })
                                    .then(() => {
                                        return participant.update({ level: 1 })
                                        .then(() => {
                                            return Message.create({
                                                content: "joined",
                                                author: context.userName,
                                                type: 4,
                                                gameId: args.gameId,
                                                conversationId: args.conversationId,
                                                userId: context.user
                                            })
                                            .then((message) => {
                                                return User.findOne({
                                                    where: {
                                                        id: context.user
                                                    }
                                                })
                                                .then( user => {
                                                    let participant = {
                                                        userId: context.user,
                                                        name: user.name,
                                                        level: 2,
                                                        profilePic: user.profilePic,
                                                        invited: true,
                                                        player: true
                                                    };
                
                                                    pubsub.publish('NEW_PARTICIPANT', {
                                                        participantJoined: participant, gameId: args.gameId
                                                    });
    
                                                    pubsub.publish('MESSAGE_ADDED', {
                                                        messageAdded: {
                                                            node: message.dataValues,
                                                            cursor: message.dataValues.createdAt,
                                                            userPic: user.profilePic
                                                        }
                                                    });
                                
                                                    pubsub.publish('NOTIFICATION', { 
                                                        conversationId: args.conversationId, currentUser: context.user
                                                    });

                                                    return participant;
                                                })
                                            })
                                        })
                                    })
                                })
                            // No reserved spots left, taking an open spot
                            } else {
                                return participant.update({ level: 1 })
                                .then(() => {
                                    return Message.create({
                                        content: "joined",
                                        author: context.userName,
                                        type: 4,
                                        gameId: args.gameId,
                                        conversationId: args.conversationId,
                                        userId: context.user
                                    })
                                    .then((message) => {
                                        return User.findOne({
                                            where: {
                                                id: context.user
                                            }
                                        })
                                        .then( user => {
                                            let participant = {
                                                userId: context.user,
                                                name: user.name,
                                                level: 2,
                                                profilePic: user.profilePic,
                                                player: true
                                            };
        
                                            pubsub.publish('NEW_PARTICIPANT', {
                                                participantJoined: participant, gameId: args.gameId
                                            });

                                            pubsub.publish('MESSAGE_ADDED', {
                                                messageAdded: {
                                                    node: message.dataValues,
                                                    cursor: message.dataValues.createdAt,
                                                    userPic: user.profilePic
                                                }
                                            });
                        
                                            pubsub.publish('NOTIFICATION', { 
                                                conversationId: args.conversationId, currentUser: context.user
                                            });

                                            return participant;
                                        })
                                    })
                                })
                            }
                        })
                    }
                    // As long as there are open spots a new participant or interested participant can join
                    else if (game.dataValues.openSpots > 0) {
                        if (!participant) {
                            return Player.create({
                                level: 2,
                                userId: context.user,
                                gameId: args.gameId
                            })
                            .then(() => {
                                return Participant.create({
                                    level: 1,
                                    userId: context.user,
                                    conversationId: args.conversationId
                                })
                                .then(() => {
                                    return Message.create({
                                        content: "joined",
                                        author: context.userName,
                                        type: 4,
                                        gameId: args.gameId,
                                        conversationId: args.conversationId,
                                        userId: context.user
                                    })
                                    .then((message) => {
                                        return User.findOne({
                                            where: {
                                                id: context.user
                                            }
                                        })
                                        .then( user => {
                                            let participant = {
                                                userId: context.user,
                                                name: user.name,
                                                level: 2,
                                                profilePic: user.profilePic,
                                                player: true
                                            };
        
                                            pubsub.publish('NEW_PARTICIPANT', {
                                                participantJoined: participant, gameId: args.gameId
                                            });

                                            pubsub.publish('MESSAGE_ADDED', {
                                                messageAdded: {
                                                    node: message.dataValues,
                                                    cursor: message.dataValues.createdAt,
                                                    userPic: user.profilePic
                                                }
                                            });
                        
                                            pubsub.publish('NOTIFICATION', { 
                                                conversationId: args.conversationId, currentUser: context.user
                                            });

                                            return participant;
                                        })
                                    })
                                })
                            })
                        }
                        else if (participant && participant.level == 2) {
                            return Player.create({
                                level: 2,
                                userId: context.user,
                                gameId: args.gameId
                            })
                            .then(() => {
                                return participant.update({ level: 1 })
                                .then(() => {
                                    return Message.create({
                                        content: "joined",
                                        author: context.userName,
                                        type: 4,
                                        gameId: args.gameId,
                                        conversationId: args.conversationId,
                                        userId: context.user
                                    })
                                    .then((message) => {
                                        return User.findOne({
                                            where: {
                                                id: context.user
                                            }
                                        })
                                        .then( user => {
                                            let participant = {
                                                userId: context.user,
                                                name: user.name,
                                                level: 2,
                                                profilePic: user.profilePic,
                                                player: true,
                                                wasInterested: true
                                            };
        
                                            pubsub.publish('NEW_PARTICIPANT', {
                                                participantJoined: participant, gameId: args.gameId
                                            });

                                            pubsub.publish('MESSAGE_ADDED', {
                                                messageAdded: {
                                                    node: message.dataValues,
                                                    cursor: message.dataValues.createdAt,
                                                    userPic: user.profilePic
                                                }
                                            });
                        
                                            pubsub.publish('NOTIFICATION', { 
                                                conversationId: args.conversationId, currentUser: context.user
                                            });

                                            return participant;
                                        })
                                    })
                                })
                            })
                        } 
                        else {
                            const error = new Error('Already joined');
                            error.code = 401;
                            throw error; 
                        }
                    }
                    // Else there are no open spots
                    else {
                        const error = new Error('Cannot join, no open spots left');
                        error.code = 401;
                        throw error;
                    }
                })
            })
            .catch(error => {
                debug(error);
                throw error;
            });
        },
        // Subscribing to a game adds yourself to the game conversation without committing to being a player
        subscribe: (parent, args, context, req) => {
            // Don't allow users to subscribe to games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Must be logged in to subscribe to game');
                error.code = 401;
                throw error;
            }

            return Participant.findOrCreate({
                where: {
                    conversationId: args.conversationId,
                    userId: context.user
                },
                defaults: {
                    conversationId: args.conversationId,
                    userId: context.user,
                    level: 2
                }
            })
            .spread( (participant, created) => {
                if (created) {
                    return Message.create({
                        content: "is interested",
                        author: context.userName,
                        type: 4,
                        gameId: args.gameId,
                        conversationId: args.conversationId,
                        userId: context.user
                    })
                    .then((message) => {
                        return User.findOne({
                            where: {
                                id: context.user
                            }
                        })
                        .then( user => {
                            let participant = {
                                userId: context.user,
                                name: context.userName,
                                level: 2,
                                profilePic: user.profilePic,
                                player: false
                            };
    
                            pubsub.publish('NEW_PARTICIPANT', {
                                participantJoined: participant, gameId: args.gameId
                            });
    
                            pubsub.publish('MESSAGE_ADDED', {
                                messageAdded: {
                                    node: message.dataValues,
                                    cursor: message.dataValues.updatedAt,
                                    userPic: user.profilePic
                                }
                            });
        
                            pubsub.publish('NOTIFICATION', { 
                                conversationId: args.conversationId, currentUser: context.user
                            });
                            
                            return participant;
                        })
                    })
                }
                else if (participant && participant.level == 3) {
                    // Already was a participant by invite, now subscribed
                    return participant.update({
                        level: 2
                    })
                    .then(() => {
                        return Message.create({
                            content: "is interested",
                            author: context.userName,
                            type: 4,
                            gameId: args.gameId,
                            conversationId: args.conversationId,
                            userId: context.user
                        })
                        .then((message) => {
                            return User.findOne({
                                where: {
                                    id: context.user
                                }
                            })
                            .then( user => {
                                let participant = {
                                    userId: context.user,
                                    name: context.userName,
                                    level: 2,
                                    profilePic: user.profilePic,
                                    player: false
                                };
        
                                pubsub.publish('NEW_PARTICIPANT', {
                                    participantJoined: participant, gameId: args.gameId
                                });

                                pubsub.publish('MESSAGE_ADDED', {
                                    messageAdded: {
                                        node: message.dataValues,
                                        cursor: message.dataValues.updatedAt,
                                        userPic: user.profilePic
                                    }
                                });
            
                                pubsub.publish('NOTIFICATION', { 
                                    conversationId: args.conversationId, currentUser: context.user
                                });
                                
                                return participant;
                            })
                        })
                    })
                } 
                // If user is already interested they can't subscribe again
                // If user is already joined they would have to leave the game as a player to just become interested
                else {
                    const error = new Error('Already subscribed to game');
                    throw error;
                }        
            }) 
            .catch(error => {
                debug(error);
                throw error;
            });
        },
        unsubscribe: (parent, args, context, req) => {
            // Don't allow users to unsubscribe games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Must be logged in to unsubscribe game');
                error.code = 401;
                throw error;
            }

            return Participant.findOne({
                where: {
                    conversationId: args.conversationId,
                    userId: context.user
                }
            })
            .then( participant => {
                if (participant.level == 1) {
                    const error = new Error('Player cannot unsubscribe, must leave game instead');
                    throw error;
                }

                participant.destroy()
                .then( result => {
                    if (result) {
                        return Message.create({
                            content: "unsubscribed",
                            author: context.userName,
                            type: 4,
                            gameId: args.gameId,
                            conversationId: args.conversationId,
                            userId: context.user
                        })
                        .then((message) => {
                            return User.findOne({
                                where: {
                                    id: context.user
                                }
                            })
                            .then( user => {
                                let participant = {
                                    userId: context.user,
                                    name: context.userName,
                                    level: 2,
                                    profilePic: user.profilePic,
                                    player: false
                                };
        
                                pubsub.publish('PARTICIPANT_LEFT', {
                                    participantLeft: participant, gameId: args.gameId
                                });

                                pubsub.publish('MESSAGE_ADDED', {
                                    messageAdded: {
                                        node: message.dataValues,
                                        cursor: message.dataValues.updatedAt,
                                        userPic: user.profilePic
                                    }
                                });
            
                                pubsub.publish('NOTIFICATION', { 
                                    conversationId: args.conversationId, currentUser: context.user
                                });
                                
                                return participant;
                            })
                        })
                    } else {
                        const error = new Error('Could not unsubscribe');
                        throw error;
                    }
                })
            })
            .catch(error => {
                debug(error);
                throw error;
            })
        },
        leaveGame: (parent, args, context, req) => {
            // Don't allow users to leave games if they are not logged in
            if (!context.isAuth) {
                const error = new Error('Must be logged in to leave game');
                error.code = 401;
                throw error;
            }
            return Player.findOne({
                where: {
                    userId: context.user,
                    gameId: args.gameId
                }
            })
            .then( player => {
                if (!player) {
                    const error = new Error('Could not leave game');
                    throw error;
                }

                if (player.level == 1) {
                    const error = new Error('Host cannot leave game');
                    throw error;
                }

                return player.destroy()
                .then( result => {
                    if (result) {
                        return Participant.destroy({
                            where: {
                                conversationId: args.conversationId,
                                userId: context.user
                            }
                        })
                        .then( rowsDeleted => {
                            if (rowsDeleted === 1) {
                                return Message.create({
                                    content: "left",
                                    author: context.userName,
                                    type: 4,
                                    gameId: args.gameId,
                                    conversationId: args.conversationId,
                                    userId: context.user
                                })
                                .then((message) => {
                                    return User.findOne({
                                        where: {
                                            id: context.user
                                        }
                                    })
                                    .then( user => {

                                        pubsub.publish('PARTICIPANT_LEFT', {
                                            participantLeft: { userId: context.user, player: true, userId: context.user }, gameId: args.gameId
                                        });

                                        pubsub.publish('MESSAGE_ADDED', {
                                            messageAdded: {
                                                node: message.dataValues,
                                                cursor: message.dataValues.updatedAt,
                                                userPic: user.profilePic
                                            }
                                        });

                                        pubsub.publish('NOTIFICATION', { 
                                            conversationId: args.conversationId, currentUser: context.user
                                        });

                                        return { userId: context.user }
                                    })
                                })
                            } else {
                                const error = new Error('Could not leave game');
                                throw error;
                            }
                        })
                    } 
                    else {
                        const error = new Error('Could not leave game');
                        throw error;
                    }
                })
            })
            .catch(error => {
                debug(error);
                throw error;
            });
        }
    }
};

module.exports = resolvers;