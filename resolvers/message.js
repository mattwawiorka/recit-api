const { Op } = require('sequelize');
const Message = require('../models/message');
const User = require('../models/user');
const { PubSub } = require('graphql-subscriptions');
const { withFilter } = require('apollo-server');

const pubsub = new PubSub();

const MESSAGE_ADDED = 'MESSAGE_ADDED';
const MESSAGE_UPDATED = 'MESSAGE_UPDATED';
const MESSAGE_DELETED = 'MESSAGE_DELETED';

MESSAGES_PER_PAGE = 15;

const resolvers = {
    Subscription: {
        messageAdded: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(MESSAGE_ADDED),
                (payload, variables) => {  
                    return payload.messageAdded.node.gameId == variables.gameId;
                }
            )
        },
        messageUpdated: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(MESSAGE_UPDATED),
                (payload, variables) => {
                    return payload.messageUpdated.node.gameId == variables.gameId;
                }
            )
        },
        messageDeleted: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(MESSAGE_DELETED),
                (payload, variables) => {
                    return payload.messageDeleted.node.gameId == variables.gameId;
                }
            )
        },
    },
    Query: {
        messages: (parent, args, context) => {

            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();

            let options = {
                raw: true,
                where: {
                    gameId: args.gameId,
                    updatedAt: {
                        [Op.lt]: cursor
                    }
                },
                limit: MESSAGES_PER_PAGE,
                order: [
                    ["updatedAt", "DESC"]
                ]
            };

            if (args.messageId) {
                options.where.id = args.messageId;
            }

            return Message.findAndCountAll(options)
            .then( result => {
                let edges = [], endCursor;
                result.rows.map(c => {
                    edges.push({
                        node: {
                            id: c.id,
                            author: c.author,
                            user: c.userId,
                            dateTime: c.updatedAt,
                            content: c.content
                        },
                        cursor: c.updatedAt,
                        isOwner: c.userId == context.user
                    }); 
                });
                return {
                    totalCount: result.count,
                    edges: edges,
                    pageInfo: {
                        endCursor: 1000000,
                        hasNextPage: true
                    }
                }
            }).catch(error => {
                console.log(error);
            });
        }
    },
    Mutation: {
        createMessage: (parent, args, context) => {
            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then( user => {
                return Message.create({
                    userId: user.id,
                    gameId: args.messageInput.gameId,
                    author: user.name,
                    content: args.messageInput.content
                })
                .then( message => {
                    pubsub.publish(MESSAGE_ADDED, {
                        messageAdded: {
                            node: {
                                id: message.dataValues.id,
                                gameId: args.messageInput.gameId,
                                author: user.name,
                                user: user.id,
                                content: message.dataValues.content,
                                dateTime: message.dataValues.updatedAt
                            },
                            cursor: message.dataValues.updatedAt,
                        }
                    })
                    return {
                        id: message.dataValues.id,
                        author: message.dataValues.author,
                        content: message.dataValues.content
                    };
                })
            }).catch(error => {
                console.log(error);
            })
        },
        updateMessage: (parent, args, context) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to update message' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not update message');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            return Message.findOne({
                where: {
                    id: args.id
                }
            })
            .then( message => {
                return message.update({
                    content: args.content || message.content
                })
                .then(result => {
                    pubsub.publish(MESSAGE_UPDATED, {
                        messageUpdated: {
                            node: {
                                id: message.dataValues.id,
                                gameId: message.dataValues.gameId,
                                content: message.dataValues.content
                            }
                        }
                    })
                    return {
                        id: message.dataValues.id,
                        author: message.dataValues.author,
                        content: message.dataValues.content
                    };
                })
            })
            .catch(error => {
                console.log(error);
            });
        },
        deleteMessage: (parent, args, context) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to delete message' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not delete message');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            return Message.findOne({
                raw: true,
                where: {
                    id: args.id
                }
            })
            .then( message => {
                const id = message.id;
                const gameId = message.gameId;
                return Message.destroy({
                    where: {
                        id: id
                    }
                })
                .then( rowsDeleted => {
                    if (rowsDeleted === 1) {
                        pubsub.publish(MESSAGE_DELETED, {
                            messageDeleted: 
                            {
                                node: {
                                    id: id,
                                    gameId: gameId
                                }
                            }
                        })
                        return { id: id };
                    } else {
                        const error = new Error('Could not delete message');
                        error.data = errors;
                        error.code = 401;   
                        throw error;
                    }
                })
            })
            .catch(error => {
                console.log(error);
            })
        }
    }
}

module.exports = resolvers;