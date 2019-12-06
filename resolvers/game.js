const { Op, fn, col, literal } = require('sequelize');
const Game = require('../models/game');
const User = require('../models/user');
const GamePlayer = require('../models/game-player');
const validator = require('validator');
const { PubSub } = require('graphql-subscriptions');
const dateTool = require('../util/dateTool');
const geolib = require('geolib');

const pubsub = new PubSub();

const GAME_ADDED = 'GAME_ADDED';
const GAME_DELETED = 'GAME_DELETED';

GAMES_PER_PAGE = 15;

const resolvers = {
    Subscription: {
        gameAdded: {
            subscribe: () => {
                return pubsub.asyncIterator(GAME_ADDED)
            }
        },
        gameDeleted: {
            subscribe: () => {
                return pubsub.asyncIterator(GAME_DELETED)
            }
        },
    },
    Query: {
        games: (parent, args, context) => {

            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();
            let currentLoc = args.currentLoc ? args.currentLoc : [47.6062, 122.3321]
            let sport = args.sport ? args.sport : "ALL"
            let startDate = args.startDate ? args.startDate : "ALL"

            let options = {
                attributes: {
                    include: [
                        [
                            fn(
                                'ST_Distance',
                                col('location'),
                                fn('Point', currentLoc[0], currentLoc[1])
                            ),
                            'distance'
                        ]
                    ]
                },
                where: {
                    dateTime: {
                        [Op.gt]: cursor
                    }, 
                },
                limit: GAMES_PER_PAGE, 
                order: [
                    ['dateTime', 'ASC']
                ]
                // order: literal('distance ASC')
            };

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
            
            // Find all games not in the past
            return Game.findAndCountAll(options)
            .then( result => {
                let edges = [], endCursor; 
                result.rows.map( (game, index) => {
                    console.log('game',game)
                    edges.push({
                        cursor: game.dataValues.dateTime,
                        distance: geolib.convertDistance(geolib.getDistance(
                            { latitude: currentLoc[0], longitude: currentLoc[1] },
                            { latitude: game.location.coordinates[0], longitude: game.location.coordinates[1] }
                        ), 'mi'),
                        node: game.dataValues
                    });

                    if (index === result.rows.length - 1) {
                        endCursor = game.dataValues.dateTime;
                    }
                })
                return {
                    totalCount: result.count,
                    edges: edges,
                    pageInfo: {
                        endCursor: endCursor,
                        hasNextPage: result.rows.length === GAMES_PER_PAGE
                    }
                }
            })
            .catch(error => {
                console.log(error)
                throw error;
            });
        },
        game: (parent, args) => {
            return Game.findOne({
                where: {
                    id: args.id
                }
            })
            .then( game => {
                return game;
            }).catch(error => {
                throw error;
            });
        },
        players: (parent, args) => {
            return GamePlayer.findAll({
                where: {
                    gameId: args.gameId
                }
            })
            .then( gamePlayers => {
                return gamePlayers.map( p => {
                    return User.findOne({
                        where: {
                            id: p.dataValues.userId
                        }
                    })
                    .then( user => {
                        let player = {
                            id: user.dataValues.id,
                            name: user.name,
                            role: p.role
                        };
                        return player;
                    })
                })
            })
            .catch(error => {
                throw error;
            });
        },
        host: (parent, args) => {
            return GamePlayer.findOne({
                where: {
                    gameId: args.gameId,
                    role: 1
                }
            })
            .then(host => {
                return host.dataValues.userId
            })
            .catch(error => {
                throw error;
            })
        }
    },
    Mutation: {
        createGame: (parent, args, context) => {
            let { title, dateTime, endDateTime, venue, address, coords, sport, players, description, public } = args.gameInput;
            const errors = [];

            const now = new Date();
            const d = new Date(dateTime);
            if (!endDateTime) {
                const d2 = new Date(dateTime);
                endDateTime = d2.setTime(d2.getTime() + (2*60*60*1000));
            }
            const endD = new Date(endDateTime);

            console.log(endD)

            // Default public game
            if (!public) {
                public = true;
            }

            // return User.findOne({
            //     where: {
            //         id: context.user
            //     }
            // })
            // .then ( user => {
                if (!context.isAuth) {
                    errors.push({ message: 'Must be logged in to create game' });
                }
                if (!title || !dateTime || !venue || !address || !sport || !description || !players) {
                    errors.push({ message: 'Please fill in all required fields' });
                }
                else if ((players < 1) || (players > 32)) {
                    errors.push({ message: 'Number of players must be between 1-32' });
                }
                else if (!validator.isLength(description, {min:undefined, max: 1000})) {
                    errors.push({ message: 'Description must be less than 1000 characters' });
                }
                else if (!(parseInt(d.valueOf()) > parseInt(now.valueOf()))) {
                    errors.push({ message: 'Start date cannot be in the past' });
                }
                else if (!(parseInt(endD.valueOf()) > parseInt(d.valueOf()))) {
                    errors.push({ message: 'End date cannot be before starting date' });
                }
                console.log('past validators')
                if (errors.length > 0) {
                    const error = new Error('Could not create game');
                    error.data = errors;
                    error.code = 401;   
                    throw error;
                }
                console.log('here?')
                console.log('coords', coords)

                return Game.create({
                    title: title,
                    dateTime: dateTime,
                    endDateTime: endDateTime,
                    venue: venue,
                    address: address,
                    location: {type: 'Point', coordinates: coords},
                    sport: sport,
                    players: players,
                    description: description,
                    public: public
                })
                .then( game => {
                    return GamePlayer.create({
                            role: 1,
                            gameId: game.id,
                            userId: context.user
                        })
                    .then( gamePlayer => {
                        pubsub.publish(GAME_ADDED, {
                            gameAdded: {
                                cursor: game.dataValues.dateTime,
                                distance: 1,
                                node: game.dataValues
                            }
                        })
                        return game;
                    })
                })
            // })
            .catch(error => {
                throw error;
            });
        },
        updateGame: (parent, args, context) => {
            let { title, dateTime, endDateTime, venue, address, coords, sport, players, description, public } = args.gameInput;
            const errors = [];

            const now = new Date();
            const d = new Date(dateTime);
            const endD = new Date(endDateTime);

            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then ( user => {
                if (!user) {
                    errors.push({ message: 'Must be logged in to create game' });
                }
                if (!title || !dateTime || !venue || !address || !sport || !description || !players) {
                    errors.push({ message: 'Please fill in all required fields' });
                }
                else if ((players < 1) || (players > 32)) {
                    errors.push({ message: 'Number of players must be between 1-32' });
                }
                else if (!validator.isLength(description, {min:undefined, max: 1000})) {
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
                    return game.update({
                        title: title || game.title,
                        dateTime: dateTime || game.dateTime,
                        endDateTime: endDateTime || game.endDateTime,
                        venue: venue || game.venue,
                        address: address || game.address,
                        location: coords ? {type: 'Point', coordinates: coords} : game.location,
                        sport: sport || game.sport,
                        players: players || game.players,
                        description: description || game.description,
                        public: public || game.public
                    }) 
                    .then( result => {
                        return result;
                    })
                })
            })
            .catch(error => {
                throw error;
            });          
        },
        deleteGame: (parent, args) => {
            return Game.destroy({
                where: {
                    id: args.gameId
                }
            })
            .then( rowsDeleted => {
                if (rowsDeleted === 1) {
                    pubsub.publish(GAME_DELETED, {
                        gameDeleted: args.gameId
                    })
                    return true;
                }
                return false;
            })
            .catch(error => {
                console.log(error);
            });
        },
        joinGame: (parent, args, context) => {
            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then( user => {
                if (!user) {
                    return false;
                }
                return GamePlayer.findOrCreate({
                    where: {
                        userId: user.id,
                        gameId: args.gameId
                    },
                    defaults: {
                        role: 2,
                        userId: user.id,
                        gameId: args.gameId
                    }
                })
                .spread( (player, created) => {
                    if (created) {
                        return true;
                    }
                    else if (!created & player.role === 3) {
                        // Interested now joining
                        return player.update({
                            role: 2
                        })
                        .then( () => {
                            return true
                        })
                    }
                    else {
                        return false
                    }
                })
            })
            .catch(error => {
                console.log(error);
            });
        },
        interestGame: (parent, args, context, req) => {
            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then( user => {
                if (!user) {
                    console.log("No user");
                    return false;
                }
                return GamePlayer.findOrCreate({
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
                        return true;
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
            })
            .catch(error => {
                console.log(error);
            });
        },
        leaveGame: (parent, args, context, req) => {
            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then( user => {
                return GamePlayer.findOne({
                    where: {
                        userId: user.id,
                        gameId: args.gameId
                    }
                })
            })
            .then( gamePlayer => {
                const isHost = (gamePlayer.role === 1) ? true : false;
                return GamePlayer.destroy( {
                    where: {
                        gameId: gamePlayer.gameId,
                        userId: gamePlayer.userId
                    }
                })
                .then( rowsDeleted => {
                    if (rowsDeleted === 1) {
                        return GamePlayer.findAll({
                            where: {
                                gameId: args.gameId
                            }
                        })
                        .then( players => {
                            if (players.length === 0) {
                                return resolvers.Mutation.deleteGame(parent, args);
                            } 
                            if (isHost) {
                                // TODO: Ask if host really wants to leave game
                                return GamePlayer.update(
                                    {role: 1},
                                    {where: {
                                        gameId: args.gameId,
                                        userId: players[0].dataValues.userId
                                    }}
                                )
                                .then( result => {
                                    return true;
                                })
    
                            } else {
                                return true;
                            }
                        })
                    } else {
                        return false;
                    }
                })
            })
            .catch(error => {
                console.log(error);
            });
        }
    }
};

module.exports = resolvers;