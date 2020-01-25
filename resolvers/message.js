const { Op } = require('sequelize');
const Message = require('../models/message');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const Participant = require('../models/participant');
const Player = require('../models/player');
const { PubSub, withFilter } = require('apollo-server');

const pubsub = new PubSub();

const MESSAGE_ADDED = 'MESSAGE_ADDED';
const MESSAGE_UPDATED = 'MESSAGE_UPDATED';
const MESSAGE_DELETED = 'MESSAGE_DELETED';
const NOTIFICATION = 'NOTIFICATION';

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
        notificationMessage: {
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
        // Given a conversation get its messages, no notifications
        messages: (parent, args, context) => {

            console.log(pubsub.ee.listenerCount('MESSAGE_ADDED'))

            let cursor = args.cursor ? new Date(parseInt(args.cursor)) : Date.now();

            let options = {
                raw: true,
                where: {
                    conversationId: args.conversationId,
                    updatedAt: {
                        [Op.lt]: cursor
                    },
                    // Should joining/leaving notifications be shown?
                    // type: {
                    //     [Op.ne]: 4
                    // }
                },
                limit: MESSAGES_PER_PAGE,
                order: [
                    ["updatedAt", "DESC"]
                ]
            };

            return Message.findAndCountAll(options)
            .then( result => {
                let edges = [], endCursor;
                result.rows.map( (message, index) => {
                    edges.push({
                        node: message,
                        cursor: message.updatedAt,
                        isOwner: message.userId == context.user
                    }); 

                    if (index === result.rows.length - 1) {
                        endCursor = message.updatedAt;
                    }
                });
                return {
                    totalCount: result.count,
                    edges: edges,
                    pageInfo: {
                        endCursor: endCursor,
                        hasNextPage: result.rows.length === MESSAGES_PER_PAGE
                    }
                }
            })
            .catch(error => {
                console.log(error);
                throw error;
            });
        },
        // Get the most recent, pertinent message for user for each of the users conversations they are participated in
        inbox: (parent, args, context) => {
            let edges = [], endCursor;

            console.log('inbox')

            return Participant.findAll({
                where: {
                    userId: context.user
                },
                order: [ [ 'updatedAt', 'DESC' ]]
            })
            .then( participations => {
                return Promise.all(participations.map( (p, index) => {
                    return Conversation.findOne({
                        where: {
                            id: p.conversationId
                        },
                    })
                    .then( conversation => {
                        let messageOptions = {
                            raw: true,
                            limit: 1,
                            where: {
                                conversationId: conversation.dataValues.id,
                                [Op.or]: {
                                    type: {
                                        [Op.values]: [1,2,5]
                                    },
                                    userId: {
                                        [Op.ne]: context.user
                                    } 
                                }
                            },
                            order: [ [ 'updatedAt', 'DESC' ]]
                        };

                        if (p.byInvite) {
                            messageOptions.where.type = 3;
                        } else {
                            messageOptions.where.type = {
                                [Op.ne]: 3
                            }
                        }

                        return Message.findAll(messageOptions)
                        .then( message => {
                            if (message.length > 0) {
                                edges.push(
                                    { 
                                        node: message[0], 
                                        conversation: conversation.title, 
                                        forGame: Boolean(message[0].gameId),
                                        isNew: p.hasUpdate 
                                    }
                                );
                            }

                            return p.update({ hasUpdate: false })
                        })
                    })
                }))
                .then(() => {
                    sortedEdges = edges.sort( (a,b) => {
                        let comparison;
                        if (a.node.updatedAt < b.node.updatedAt) {
                            comparison = 1;
                        } else {
                            comparison = -1;
                        }
                        return comparison;
                    });
                    return {
                        totalCount: 0,
                        edges: sortedEdges,
                        pageInfo: {
                            endCursor: null,
                            hasNextPage: false
                        }
                    }
                }) 
            })
            .catch(error => {
                console.log(error);
                throw error;
            });
        },
        notifications: (parent, args, context) => {
            return Participant.count({
                where: {
                    userId: context.user,
                    hasUpdate: true
                }
            })
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
                gameId: args.messageInput.gameId,
                author: context.userName,
                content: args.messageInput.content
            })
            .then( message => {
                pubsub.publish(MESSAGE_ADDED, {
                    messageAdded: {
                        node: message.dataValues,
                        cursor: message.dataValues.updatedAt,
                    }
                })

                pubsub.publish(NOTIFICATION, { 
                    gameId: args.messageInput.gameId, currentUser: context.user
                });

                return {
                    id: message.dataValues.id,
                    author: message.dataValues.author,
                    content: message.dataValues.content
                };
            })
            .catch(error => {
                console.log(error);
                throw error;
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
                throw error;
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
                // raw: true,
                where: {
                    id: args.id
                }
            })
            .then( message => {
                const id = message.id;
                const conversationId = message.conversationId;
                return message.destroy()
                .then( message => {
                    if (message) {
                        pubsub.publish(MESSAGE_DELETED, {
                            messageDeleted: 
                            {
                                node: {
                                    id: message.id,
                                    conversationId: message.conversationId
                                }
                            }
                        })
                        return { id: message.id };
                    } else {
                        const error = new Error('Could not delete message');
                        throw error;
                    }
                })
            })
            .catch(error => {
                console.log(error);
                throw error;
            })
        },
        addToConversation: (parent, args, context) => {
            const errors = [];

            if (!context.isAuth) {
                errors.push({ message: 'Must be logged in to add user' });
            }

            if (errors.length > 0) {
                const error = new Error('Could not add user');
                error.data = errors;
                error.code = 401;   
                throw error;
            }

            return User.findOne({
                where: {
                    id: args.userId
                }
            })
            .then( user => {
                return Participant.findOrCreate({
                    where: {
                        userId: args.userId,
                        conversationId: args.conversationId,
                    },
                    defaults: {
                        userId: args.userId,
                        conversationId: args.conversationId,
                        byInvite: true
                    }
                })
                .spread( (participant, created) => {

                    if (!created) {
                        errors.push({ message: "User already invited" });
                        const error = new Error('Could not add user');
                        error.data = errors;
                        error.code = 401;   
                        throw error; 
                    }

                    return Message.create({
                        userId: context.user,
                        author: context.userName,
                        conversationId: args.conversationId,
                        content: "Invited " + user.name,
                        type: 3,
                        gameId: args.gameId
                    })
                    .then( message => {
                        pubsub.publish(MESSAGE_ADDED, {
                            messageAdded: {
                                node: message.dataValues,
                                cursor: message.dataValues.updatedAt,
                            }
                        });

                        if (message) return true;
                    })
                })
            })
            .catch(error => {
                console.log(error);
            }) 
        }
    }
}

module.exports = resolvers;