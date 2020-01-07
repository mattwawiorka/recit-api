// Message CRUD

const typeDef = `
    type Message {
        id: ID!
        author: String
        user: ID
        gameId: ID
        dateTime: String
        content: String
    }

    type MessageEdge {
        cursor: String
        isOwner: Boolean
        node: Message
    }

    type MessageFeed {
        totalCount: Int
        edges: [MessageEdge]
        pageInfo: PageInfo
    }

    input messageInput {
        gameId: ID
        convoId: ID
        content: String!
    }

    type Query {
        messages(gameId: ID, messageId: ID, cursor: String): MessageFeed
    }

    type Mutation {
        createMessage(messageInput: messageInput): Message
        updateMessage(id: ID!, content: String!): Message
        deleteMessage(id: ID!): Message
    }

    type Subscription {
        messageAdded(gameId: ID!): MessageEdge
        messageDeleted(gameId: ID!): MessageEdge
        messageUpdated(gameId: ID!): MessageEdge
    }
`;

module.exports = typeDef;