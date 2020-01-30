const { Op, fn, col, literal, where } = require('sequelize');
const Game = require('../models/game');
const User = require('../models/user');
const Player = require('../models/player');
const Conversation = require('../models/conversation');
const Participant = require('../models/participant');
const Message = require('../models/message');
const validator = require('validator');
const dateTool = require('../util/dateTool');
const { PubSub, withFilter } = require('apollo-server');

const pubsub = new PubSub();

const GAME_ADDED = 'GAME_ADDED';
const GAME_DELETED = 'GAME_DELETED';
const PLAYER_JOINED = 'PLAYER_JOINED';
const PLAYER_LEFT = 'PLAYER_LEFT';
const NOTIFICATION = 'NOTIFICATION';

GAMES_PER_PAGE = 15;

const resolvers = {
    Subscription: {
        gameAdded: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(GAME_ADDED), 
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
                    const withinBounds = ( bb.ix <= p.x && p.x <= bb.ax && bb.iy <= p.y && p.y <= bb.ay )
                    return withinBounds && ((payload.gameAdded.node.dateTime < variables.cursor) || (variables.numGames < 15))
                }
            )
        },
        gameDeleted: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(GAME_DELETED), 
                (payload, variables) => {
                    return variables.loadedGames.includes(payload.gameDeleted);
                }
            )
        },
        playerJoined: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(PLAYER_JOINED),
                (payload, variables) => {
                    return variables.gameId === payload.gameId;
                }
            )
        },
        playerLeft: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(PLAYER_LEFT),
                (payload, variables) => {
                    return variables.gameId === payload.gameId;
                }
            )
        },
        notificationGame: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(NOTIFICATION),
                (payload, variables) => {
                    if (payload.currentUser === variables.userId) return false;
                    console.log('send notification');
                    return Player.findOne({
                        raw: true,
                        where: {
                            gameId: payload.gameId,
                            userId: variables.userId
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
        // Get games feed for your area 
        // sql_mode = '' for games feed to work 
        games: (parent, args, context) => {

            console.log('games query',pubsub.ee.listenerCount('GAME_ADDED'))

            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();
            let sport = args.sport ? args.sport : "ALL"
            let startDate = args.startDate ? args.startDate : "ALL"
            let bounds = (args.bounds[0]) ? args.bounds : [47.7169839910907, -122.32040939782564, 47.54058537009015, -122.3709744021744];

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
                },
                limit: GAMES_PER_PAGE, 
                attributes: { 
                    include: [
                        [fn("COUNT", col("users.id")), "players"],
                        [literal('(spots - COUNT(`users`.`id`))'), 'openSpots']
                    ] 
                },
                include: [{
                    model: User, attributes: []
                }],
                group: ['id', 'spots'],
            };

            if (args.sortOrder === "SPOTS") {
                options.order = [
                    [literal('(spots - COUNT(`users`.`id`))'), 'DESC']
                ]
            } else {
                options.order = [
                    ["dateTime", "ASC"]
                ]
            }

            if (sport !== "ALL") {
                options.where.sport = sport 
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

            if (args.openSpots === "1") {
                options.having = literal('(spots - COUNT(`users`.`id`)) > 0')
            }
            else if (args.openSpots === "2") {
                options.having = literal('(spots - COUNT(`users`.`id`)) > 1')
            }
            else if (args.openSpots === "3") {
                options.having = literal('(spots - COUNT(`users`.`id`)) > 2')
            }
            else if (args.openSpots === "4") {
                options.having = literal('(spots - COUNT(`users`.`id`)) > 3')
            }
            
            // Find all games not in the past
            return Game.findAndCountAll(options)
            .then( result => {
                console.log('count',result.count.length)
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
                console.log(error)
                throw error;
            });
        },
        // Get game info for game page
        game: (parent, args) => {
            return Game.findOne({
                where: {
                    id: args.id
                }
            })
            .then( game => {
                if (!game) {
                    const error = new Error('Could not find game');
                    throw error;
                }

                return game;
            }).catch(error => {
                console.log(error)
                throw error;
            });
        },
        // Get players for game
        players: (parent, args) => {

            return Player.findAll({
                raw: true,
                where: {
                    gameId: args.gameId
                }
            })
            .then( players => {
                return players.map( p => {
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

                        let player = {
                            userId: user.id, 
                            name: user.name,
                            role: p.role,
                            profilePic: user.profilePic
                        };
                        return player;
                    })
                })
            })
            .catch(error => {
                console.log(error)
                throw error;
            });
        },
        // Get host for a game
        host: (parent, args) => {
            return Player.findOne({
                raw: true,
                where: {
                    gameId: args.gameId,
                    role: 1
                }
            })
            .then(host => {
                if (!host) {
                    const error = new Error('Could not find host');
                    throw error;
                }

                return { userId: host.userId };
            })
            .catch(error => {
                console.log(error)
                throw error;
            })
        },
        // Get user specific game feed, can be used for getting upcoming games or past games (game history)
        userGames: (parent, args, context) => {
            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();
            let direction, order, limit;

            if (!context.isAuth) return {
                edges: [],
            }

            // Default direction = future
            if (args.pastGames) {
                direction = {
                    [Op.lt]: cursor
                };
                order = [
                    [literal('game.dateTime'), 'DESC']
                ];
                limit = GAMES_PER_PAGE;
            } else {
                direction = {
                    [Op.gt]: cursor
                };
                order = [
                    [literal('game.dateTime'), 'ASC']
                ];

                // Only preview the first 3 of your upcoming games at a time 
                limit = 3;
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
                limit: limit,
                order: order
            }

            return Player.findAndCountAll(options)
            .then( result => {
                let edges = [], endCursor;
                result.rows.map( (player, index) => {
                    edges.push({
                        node: player.game,
                        cursor: player.game.dateTime,
                        role: player.role
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
        topSport: (parent, args, context) => {
            return Player.count({
                where : {
                    userId: args.userId
                },
                include: [
                    {
                        model: Game,
                        attributes: ['sport'],
                        where: {
                            dateTime: {
                                [Op.lt]: Date.now()
                            }
                        }
                    }
                ],
                group: [literal('game.sport')]
            })
            .then(result => {
                let count = 0, top;
                result.map( (sport, index) => {
                    if (sport.count > count) {
                        count = sport.count;
                        top = index;
                    }
                })
                if (result.length > 0) {
                    return result[top].sport
                } else {
                    return 'TBD'
                }
                
            })
        }
    },
    Mutation: {
        createGame: (parent, args, context) => {
            let { title, dateTime, endDateTime, venue, address, coords, sport, spots, description, public } = args.gameInput;
            const errors = [];

            const now = new Date();
            const d = new Date(dateTime);
            if (!endDateTime) {
                const d2 = new Date(dateTime);
                endDateTime = d2.setTime(d2.getTime() + (2*60*60*1000));
            }
            const endD = new Date(endDateTime);

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to create game' });
            }
            if (!title || !dateTime || !sport || !description || !spots) {
                errors.push({ 
                    message: 'Please fill in all required fields',
                    field:  'all'
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
            if (!validator.isLength(description, { min:undefined, max: 1000 })) {
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
                    sport: sport,
                    spots: spots,
                    description: description,
                    public: public,
                    conversationId: conversation.id
                })
                .then( game => {
                    // Create the host player
                    return Player.create({
                        role: 1,
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
                            pubsub.publish(GAME_ADDED, gameAdded);
                            return game;
                        });
                    });
                });
            })
            .catch(error => {
                console.log(error)
                throw error;
            });
        },
        updateGame: (parent, args, context) => {
            let { title, dateTime, endDateTime, venue, address, coords, sport, spots, description, public } = args.gameInput;
            const errors = [];

            const now = new Date();
            const d = new Date(dateTime);
            const endD = new Date(endDateTime);

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to create game' });
            }
            if (!title || !dateTime || !venue || !address || !sport || !description || !spots) {
                errors.push({ message: 'Please fill in all required fields' });
            }
            else if ((spots < 1) || (spots > 32)) {
                errors.push({ message: 'Number of players must be between 1-32' });
            }
            else if (!validator.isLength(description, { min: undefined, max: 1000 })) {
                errors.push({ message: 'Description must be less than 1000 characters' });
            }
            else if (!(parseInt(d.valueOf()) > parseInt(now.valueOf()))) {
                errors.push({ message: 'Start date cannot be in the past' });
            }
            else if (!(parseInt(endD.valueOf()) > parseInt(d.valueOf()))) {
                errors.push({ message: 'End date cannot be before starting date' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not update game');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            return Game.findOne({
                where: {
                    id: args.id
                }
            }) 
            .then( game => {
                if (!game) {
                    const error = new Error('Could not find game');
                    throw error;
                }

                return game.update({
                    title: title || game.title,
                    dateTime: dateTime || game.dateTime,
                    endDateTime: endDateTime || game.endDateTime,
                    venue: venue || game.venue,
                    address: address || game.address,
                    location: coords ? {type: 'Point', coordinates: coords} : game.location,
                    sport: sport || game.sport,
                    spots: spots || game.spots,
                    description: description || game.description,
                    public: public
                }) 
                .then( result => {
                    return result;
                })
            })
            .catch(error => {
                console.log(error)
                throw error;
            });          
        },
        deleteGame: (parent, args, context) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to cancel game' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not cancel game');
                error.data = errors;
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

                return Game.destroy({
                    where: {
                        id: game.id
                    }
                })
                .then( rowsDeleted => {
                    if (rowsDeleted === 1) {
                        // Also deleted the corresponding conversation
                        return Conversation.destroy({
                            where: {
                                id: game.conversationId
                            }
                        })
                        .then( rowsDeleted => {
                            if (rowsDeleted === 1) {
                                pubsub.publish(GAME_DELETED, {
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
            })
            .catch(error => {
                console.log(error);
                throw error;
            });
        },
        joinGame: (parent, args, context) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to join game' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not join game');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            return Player.findOrCreate({
                where: {
                    userId: context.user,
                    gameId: args.gameId
                },
                defaults: {
                    role: 2,
                    userId: context.user,
                    gameId: args.gameId
                }
            })
            .spread( (p, created) => {
                if (created) {
                    return Participant.findOrCreate({
                        where : {
                            conversationId: args.conversationId,
                            userId: context.user
                        },
                        defaults: {
                            conversationId: args.conversationId,
                            userId: context.user
                        }
                    })
                    .spread( (participant, created) => {
                        if (!created) {
                            // Participation already from invite, update
                            return participant.update({
                                byInvite: false
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
                                .then(() => {
                                    let player = {
                                        userId: context.user,
                                        name: context.userName,
                                        role: p.dataValues.role
                                    };

                                    pubsub.publish(PLAYER_JOINED, {
                                        playerJoined: player, gameId: args.gameId
                                    });

                                    pubsub.publish(NOTIFICATION, { 
                                        gameId: args.gameId, currentUser: context.user
                                    });

                                    return player;
                                })
                            })
                        }
                        // Player and conversation participant created
                        return Message.create({
                            content: "joined",
                            author: context.userName,
                            type: 4,
                            gameId: args.gameId,
                            conversationId: args.conversationId,
                            userId: context.user
                        })
                        .then(() => {
                            let player = {
                                userId: context.user,
                                name: context.userName,
                                role: p.dataValues.role
                            };

                            pubsub.publish(PLAYER_JOINED, {
                                playerJoined: player, gameId: args.gameId
                            });

                            pubsub.publish(NOTIFICATION, { 
                                gameId: args.gameId, currentUser: context.user
                            });

                            return player;
                        })
                    })
                }
                // Interested now joining
                else if (!created && p.role === 3) {
                    return p.update({
                        role: 2
                    })
                    .then( (p) => {
                        return Message.create({
                            content: "joined",
                            author: context.userName,
                            type: 4,
                            gameId: args.gameId,
                            conversationId: args.conversationId,
                            userId: context.user
                        })
                        .then(() => {
                            let player = {
                                userId: context.user,
                                name: context.userName,
                                role: p.dataValues.role
                            };
    
                            pubsub.publish(PLAYER_JOINED, {
                                playerJoined: player, gameId: args.gameId
                            });

                            pubsub.publish(NOTIFICATION, { 
                                gameId: args.gameId, currentUser: context.user
                            });
    
                            return player;
                        })
                    })
                }
                else {
                    if (p.role === 2) errors.push({ message: 'Already joined' });
                    const error = new Error('Could not join game');
                    error.data = errors;
                    error.code = 401;   
                    throw error;
                }
            })
            .catch(error => {
                console.log(error);
                throw error;
            });
        },
        interestGame: (parent, args, context, req) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to subscribe to game' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not subscribe to game');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            return Player.findOrCreate({
                where: {
                    userId: user.id,
                    gameId: args.gameId
                },
                defaults: {
                    role: 3,
                    userId: user.id,
                    gameId: args.gameId
                }
            })
            .spread( (player, created) => {
                if (created) {
                    return Participant.findOrCreate({
                        where: {
                            conversationId: args.conversationId,
                            userId: context.user
                        },
                        defaults: {
                            conversationId: args.conversationId,
                            userId: context.user
                        }
                    })
                    .then( (participant, created) => {
                        if (created) {
                            return true
                        }
                        
                        // Already was a participant by invite, now subscribed
                        return participant.update({
                            byInvite: false
                        })
                        .then(() => {
                            return true;
                        })
                    }) 
                }
                else if (!created & player.role === 2) {
                    // Joined now just interested
                    return player.update({
                        role: 3
                    })
                    .then( () => {
                        return true
                    })
                }
                else {
                    return false;
                }
            })
            .catch(error => {
                console.log(error);
                throw error;
            });
        },
        leaveGame: (parent, args, context, req) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to leave game' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not leave game');
                error.data = errors;
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
                                .then(() => {
                                    pubsub.publish(PLAYER_LEFT, {
                                        playerLeft: { userId: context.user }, gameId: args.gameId
                                    });

                                    pubsub.publish(NOTIFICATION, { 
                                        gameId: args.gameId, currentUser: context.user
                                    });

                                    return { userId: context.user }
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
                console.log(error);
                throw error;
            });
        }
    }
};

module.exports = resolvers;