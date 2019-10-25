const Op = require('sequelize').Op;
const Game = require('../models/game');
const User = require('../models/user');
const GamePlayer = require('../models/game-player');
const validator = require('validator');

const resolvers = {
    games: (args) => {
        return Game.findAll({
            where: {
                endDateTime: {
                    [Op.gt]: Date.now()
                }
            }
        })
        .then( games => {
            return games;
        }).catch(err => {
            console.log(err);
        });
    },
    game: (args) => {
        return Game.findOne({
            where: {
                id: args.id
            }
        })
        .then( game => {
            return game;
        }).catch(err => {
            console.log(err);
        });
    },
    createGame: (args, req) => {
        console.log("Here's req:" + req.userId);
        return Game.create({
            title: args.gameInput.title,
            dateTime: args.gameInput.dateTime,
            endDateTime: args.gameInput.endDateTime,
            venue: args.gameInput.venue,
            address: args.gameInput.address,
            sport: args.gameInput.sport,
            description: args.gameInput.description,
            public: args.gameInput.public
        })
        .then( game => {
            return User.findOne({
                where: {
                    id: req.userId
                }
            })
            .then( user => {
                return GamePlayer.create({
                    role: 1,
                    gameId: game.id,
                    userId: user.id
                })
            })
        })
        .catch(err => {
            console.log(err);
        });
    },
    updateGame: (args) => {
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
    deleteGame: (args) => {
        return Game.destroy({
            where: {
                id: args.gameId
            }
        })
        .then( rowsDeleted => {
            if (rowsDeleted === 1) {
                return true;
            }
            return false;
        })
        .catch(err => {
            console.log(err);
        });
    },
    joinGame: (args, req) => {
        return User.findOne({
            where: {
                id: req.userId
            }
        })
        .then( user => {
            if (!user) {
                console.log("No user");
                return false;
            }
            return GamePlayer.findOrCreate({
                where: {
                    userId: req.userId,
                    gameId: args.gameId
                },
                defaults: {
                    role: 2,
                    userId: req.userId,
                    gameId: args.gameId
                }
            })
            .spread( (player, created) => {
                if (created) {
                    return true;
                }
                else if (!created & player.role === 3) {
                    console.log("Interested now joining");
                    return player.update({
                        role: 2
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
    interestGame: (args, req) => {
        return User.findOne({
            where: {
                id: req.userId
            }
        })
        .then( user => {
            if (!user) {
                console.log("No user");
                return false;
            }
            return GamePlayer.findOrCreate({
                where: {
                    userId: req.userId,
                    gameId: args.gameId
                },
                defaults: {
                    role: 3,
                    userId: req.userId,
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
    leaveGame: (args, req) => {
        return User.findOne({
            where: {
                id: req.userId
            }
        })
        .then( user => {
            return GamePlayer.destroy( {
                where: {
                    gameId: args.gameId,
                    userId: user.id
                }
            })
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
                        return resolvers.deleteGame(args);
                    } else {
                        // TODO: make next player host
                        return true;
                    }
                })
            } else {
                return false;
            }
        })
        .catch(err => {
            console.log(err);
        });
    },
    players: (args) => {
        const playersList = [];
        return GamePlayer.findAll({
            where: {
                gameId: args.gameId
            }
        })
        .then( players => {
            return players.map( p => {
                return User.findOne({
                    where: {
                        id: p.dataValues.userId
                    }
                })
            })
        })
        .catch(err => {
            console.log(err);
        });
    }
};

module.exports = resolvers;