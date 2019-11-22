const Comment = require('../models/comment');
const User = require('../models/user');
const { PubSub } = require('graphql-subscriptions');

const pubsub = new PubSub();

const COMMENT_ADDED = 'COMMENT_ADDED';

const resolvers = {
    Subscription: {
        commentAdded: {
            subscribe: () => {
                return pubsub.asyncIterator(COMMENT_ADDED)
            }
        },
    },
    Query: {
        comments: (parent, args, context) => {
            return Comment.findAll({
                where: {
                    gameId: args.gameId
                }
            })
            .then( comments => {
                return comments.map(c => {
                    return User.findOne({
                        where: {
                            id: c.dataValues.userId
                        }
                    })
                    .then( user => {
                        let comment = {
                            id: c.dataValues.id,
                            user: c.dataValues.userId,
                            userName: user.name,
                            dateTime: c.dataValues.updatedAt,
                            content: c.dataValues.content
                        }
                        return comment;
                    })
                });
            }).catch(error => {
                console.log(error);
            });
        }
    },
    Mutation: {
        createComment: (parent, args, context) => {
            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then( user => {
                return Comment.create({
                    userId: user.id,
                    gameId: args.commentInput.gameId,
                    content: args.commentInput.content
                })
                .then( comment => {
                    pubsub.publish(COMMENT_ADDED, {
                        commentAdded: {
                            id: comment.id,
                            userName: user.name,
                            content: comment.content,
                            dateTime: comment.dataValues.updatedAt
                        }
                    })
                    return comment;
                })
            }).catch(error => {
                console.log(error);
            })
        },
        updateComment: (parent, args, context) => {
            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then( user => {
                return Comment.findOne({
                    where: {
                        id: args.id
                    }
                })
                .then( comment => {
                    return comment.update({
                        content: args.content || comment.content
                    })
                    .then(result => {
                        return comment.dataValues;
                    })
                })
            })
            .catch(error => {
                console.log(error);
            });
        },
        deleteComment: (parent, args, context) => {
            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then( user => {
                return Comment.findOne({
                    where: {
                        id: args.id
                    }
                })
                .then( comment => {
                    return Comment.destroy({
                        where: {
                            id: comment.id
                        }
                    })
                    .then( rowsDeleted => {
                        if (rowsDeleted === 1) {
                            return comment.dataValues;
                        }
                        return comment.dataValues;
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