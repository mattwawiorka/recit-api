// Comment CRUD

const typeDef = `
    type Comment {
        id: ID!
        user: ID
        userName: String!
        dateTime: String
        content: String!
    }

    input commentInput {
        user: ID
        gameId: ID!
        content: String!
    }

    type Query {
        comments(gameId: ID!): [Comment]
    }

    type Mutation {
        createComment(commentInput: commentInput): ID
        updateComment(id: ID!, commentInput: commentInput): Boolean
        deleteComment(id: ID!): Boolean
    }

    type Subscription {
        commentAdded: Comment
    }
`;

module.exports = typeDef;