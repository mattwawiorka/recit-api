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
        createComment(commentInput: commentInput): Comment
        updateComment(id: ID!, content: String!): Comment
        deleteComment(id: ID): Comment
    }

    type Subscription {
        commentAdded: Comment
    }
`;

module.exports = typeDef;