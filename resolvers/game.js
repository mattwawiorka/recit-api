const Op = require('sequelize').Op;
const Game = require('../models/game');
const User = require('../models/user');
const GamePlayer = require('../models/game-player');
const validator = require('validator');
const { PubSub } = require('graphql-subscriptions');

const pubsub = new PubSub();

const GAME_ADDED = 'GAME_ADDED';
const GAME_DELETED = 'GAME_DELETED';

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
            return Game.findAll({
                where: {
                    endDateTime: {
                        [Op.gt]: Date.now()
                    }
                }
            })
            .then( games => {
                return games;
            }).catch(error => {
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
    },
    Mutation: {
        createGame: (parent, args, context) => {
            let { title, dateTime, endDateTime, venue, address, sport, players, description, public } = args.gameInput;
            const errors = [];
            
            const d = new Date(dateTime);
            const now = new Date();
            const yesterday = new Date();

            console.log('value', parseInt(d.valueOf()))
            
            yesterday.setDate(yesterday.getDate()-1);
            
            // Default public game
            if (!public) {
                public = true;
                console.log(public)
            }

            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then ( user => {
                if (!user) {
                    errors.push({ message: 'Must be logged in to create game' });
                }
                if (!title || !dateTime || !venue || !address || !sport || !description) {
                    console.log('1')
                    errors.push({ message: 'Please fill in all required fields' });
                }
                else if ((players < 1) || (players > 32)) {
                    errors.push({ message: 'Description must be less than 1000 characters' });
                }
                else if (!validator.isLength(description, {min:undefined, max: 1000})) {
                    console.log('2')
                    errors.push({ message: 'Description must be less than 1000 characters' });
                }
                else if (!(parseInt(d.valueOf()) > parseInt(now.valueOf()))) {
                    console.log('start time must be in the future')
                    errors.push({ message: 'Start date cannot be in the past' });
                }
                else if (!endDateTime) {
                    endDateTime = d.setTime(d.getTime() + (2*60*60*1000));
                }
                console.log('past validators')
                if (errors.length > 0) {
                    console.log('past validators')
                    const error = new Error('Could not create game');
                    error.data = errors;
                    error.code = 401;   
                    throw error;
                }

                console.log('no errors')

                return Game.create({
                    title: title,
                    dateTime: dateTime,
                    endDateTime: endDateTime,
                    venue: venue,
                    address: address,
                    sport: sport,
                    players: players,
                    description: description,
                    public: public
                })
                .then( game => {
                    return GamePlayer.create({
                            role: 1,
                            gameId: game.id,
                            userId: user.id
                        })
                    .then( gamePlayer => {
                        pubsub.publish(GAME_ADDED, {
                            gameAdded: game.dataValues
                        })
                        return game;
                    })
                })
            })
            .catch(error => {
                throw error;
            });
        },
        updateGame: (parent, args) => {
            return Game.findOne({
                where: {
                    id: args.id
                }
            })
            .then( game => {
                return game.update({
                    title: args.gameInput.title,
                    dateTime: args.gameInput.dateTime,
                    endDateTime: args.gameInput.endDateTime,
                    venue: args.gameInput.venue,
                    address: args.gameInput.address,
                    sport: args.gameInput.sport,
                    description: args.gameInput.description,
                    public: args.gameInput.public
                })
            })
            .then( result => {
                return result
            })
            .catch(err => {
                console.log(err);
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
            .catch(err => {
                console.log(err);
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
                    console.log("No user");
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
            .catch(err => {
                console.log(err);
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
                        console.log("Joined now just interested");
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
            .catch(err => {
                console.log(err);
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
            .catch(err => {
                console.log(err);
            });
        }
    }
};

module.exports = resolvers;