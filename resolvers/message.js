const { Op } = require('sequelize');
const Message = require('../models/message');
const User = require('../models/user');
const Participant = require('../models/participant');
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
                    return payload.messageAdded.node.conversationId == variables.conversationId;
                }
            )
        },
        messageUpdated: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(MESSAGE_UPDATED),
                (payload, variables) => {
                    return payload.messageUpdated.node.conversationId == variables.conversationId;
                }
            )
        },
        messageDeleted: {
            subscribe: withFilter(
                () => pubsub.asyncIterator(MESSAGE_DELETED),
                (payload, variables) => {
                    return payload.messageDeleted.node.conversationId == variables.conversationId;
                }
            )
        },
    },
    Query: {
        messages: (parent, args, context) => {

            console.log(pubsub.ee.listenerCount('MESSAGE_ADDED'))

            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();

            let options = {
                raw: true,
                where: {
                    conversationId: args.conversationId,
                    updatedAt: {
                        [Op.lt]: cursor
                    }
                },
                limit: MESSAGES_PER_PAGE,
                order: [
                    ["updatedAt", "DESC"]
                ]
            };

            return Message.findAndCountAll(options)
            .then( result => {
                let edges = [], endCursor;
                result.rows.map( (c, index) => {
                    edges.push({
                        node: {
                            id: c.id,
                            author: c.author,
                            userId: c.userId,
                            dateTime: c.updatedAt,
                            content: c.content
                        },
                        cursor: c.updatedAt,
                        isOwner: c.userId == context.user
                    }); 

                    if (index === result.rows.length - 1) {
                        endCursor = c.updatedAt;
                    }
                });
                return {
                    totalCount: result.count,
                    edges: edges,
                    pageInfo: {
                        endCursor: endCursor,
                        hasNextPage: result.rows.length === GAMES_PER_PAGE
                    }
                }
            }).catch(error => {
                console.log(error);
            });
        }
    },
    Mutation: {
        createMessage: (parent, args, context) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to create message' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not create message');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            return Message.create({
                userId: context.user,
                conversationId: args.messageInput.conversationId,
                author: context.userName,
                content: args.messageInput.content
            })
            .then( message => {
                pubsub.publish(MESSAGE_ADDED, {
                    messageAdded: {
                        node: {
                            id: message.dataValues.id,
                            conversationId: args.messageInput.conversationId,
                            author: context.userName,
                            userId: context.user,
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
            .catch(error => {
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
                                conversationId: message.dataValues.conversationId,
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
                const conversationId = message.conversationId;
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
                                    conversationId: conversationId
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
        },
        addToConversation: (parent, args, context) => {
            // const errors = [];

            // if (!context.isAuth) {
            //     errors.push({ message: 'Must be logged in to delete message' });
            // }

            // if (errors.length > 0) {
            //     const error = new Error('Could not delete message');
            //     error.data = errors;
            //     error.code = 401;   
            //     throw error;
            // }

            // return Participant.create({
            //     userId: args.userId,

            // })

            return Message.create({
                userId: context.user,
                author: context.userName,
                conversationId: args.messageInput.conversationId,
                content: args.messageInput.content,
                type: 3
            })
            .then( message => {
                return message;
            })
        }
    }
}

module.exports = resolvers;