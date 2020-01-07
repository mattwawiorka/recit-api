const { Op, fn, col, literal, where } = require('sequelize');
const Game = require('../models/game');
const User = require('../models/user');
const GamePlayer = require('../models/game-player');
const validator = require('validator');
const dateTool = require('../util/dateTool');
const geolib = require('geolib');
const { PubSub, withFilter } = require('apollo-server');

const pubsub = new PubSub();

const GAME_ADDED = 'GAME_ADDED';
const GAME_DELETED = 'GAME_DELETED';

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
                    console.log(withinBounds)
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
    },
    Query: {
        // Must SET GLOBAL sql_mode = '' in mysql for games feed to work 
        games: (parent, args, context) => {

            console.log(pubsub.ee.listenerCount('GAME_ADDED'))

            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();
            let currentLoc = args.currentLoc ? args.currentLoc : [47.6062, 122.3321]
            let sport = args.sport ? args.sport : "ALL"
            let startDate = args.startDate ? args.startDate : "ALL"
            let bounds = args.bounds.length !== 0 ? args.bounds : [47.7169839910907, -122.32040939782564, 47.54058537009015, -122.3709744021744]

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
                let edges = [], endCursor; 
                result.rows.map( (game, index) => {
                    edges.push({
                        cursor: game.dateTime,
                        distance: geolib.convertDistance(geolib.getDistance(
                            { latitude: currentLoc[0], longitude: currentLoc[1] },
                            { latitude: game.location.coordinates[0], longitude: game.location.coordinates[1] }
                        ), 'mi'),
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
                raw: true,
                where: {
                    gameId: args.gameId
                }
            })
            .then( gamePlayers => {
                return gamePlayers.map( p => {
                    return User.findOne({
                        raw: true,
                        where: {
                            id: p.userId
                        }
                    })
                    .then( user => {
                        let player = {
                            id: user.id,
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
                raw: true,
                where: {
                    gameId: args.gameId,
                    role: 1
                }
            })
            .then(host => {
                return host.userId
            })
            .catch(error => {
                throw error;
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
            if (!title || !dateTime || !venue || !address || !sport || !description || !spots) {
                errors.push({ message: 'Please fill in all required fields' });
            }
            else if ((spots < 1) || (spots > 32)) {
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
                const error = new Error('Could not create game');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            return Game.create({
                title: title,
                dateTime: dateTime,
                endDateTime: endDateTime,
                venue: venue,
                address: address,
                location: {type: 'Point', coordinates: coords},
                sport: sport,
                spots: spots,
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
                    const gameAdded = {
                        gameAdded: {
                            cursor: game.dataValues.dateTime,
                            distance: 1,
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
                })
            })
            .catch(error => {
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
                    spots: spots || game.spots,
                    description: description || game.description,
                    public: public
                }) 
                .then( result => {
                    return result;
                })
            })
            .catch(error => {
                throw error;
            });          
        },
        deleteGame: (parent, args, context) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to cancel game' });
            }

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
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to join game' });
            }

            return GamePlayer.findOrCreate({
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
            .spread( (player, created) => {
                console.log(player)
                if (created) {
                    return { id: player.dataValues.id };
                }
                else if (!created & player.role === 3) {
                    // Interested now joining
                    return player.update({
                        role: 2
                    })
                    .then( (player) => {
                        return { id: player.dataValues.id };
                    })
                }
                else {
                    errors.push({ message: 'Could not join game' });
                    throw error;
                }
            })
            .catch(error => {
                console.log(error);
                throw error;
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
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to leave game' });
            }

            return GamePlayer.findOne({
                where: {
                    userId: context.user,
                    gameId: args.gameId
                }
            })
            .then( gamePlayer => {
                const player = gamePlayer;
                return GamePlayer.destroy({
                    where: {
                        gameId: gamePlayer.gameId,
                        userId: gamePlayer.userId
                    }
                })
                .then( rowsDeleted => {
                    if (rowsDeleted === 1) {
                        return { id: player.dataValues.id };
                    } 
                    else {
                        errors.push({ message: 'Could not leave game' });
                        throw error;
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