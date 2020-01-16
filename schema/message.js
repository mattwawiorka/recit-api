// Message CRUD

const typeDef = `
    type Message {
        id: ID!
        author: String
        userId: ID
        conversationId: ID
        content: String
        updatedAt: String
        createdAt: String
        type: Int
        gameId: ID
    }

    type MessageEdge {
        cursor: String
        isOwner: Boolean
        node: Message
        conversation: String
        forGame: Boolean
    }

    type MessageFeed {
        totalCount: Int
        edges: [MessageEdge]
        pageInfo: PageInfo
    }

    input messageInput {
        conversationId: ID!
        gameId: ID
        content: String!
    }

    type Query {
        messages(conversationId: ID, cursor: String): MessageFeed
        inbox: MessageFeed
    }

    type Mutation {
        createMessage(messageInput: messageInput): Message
        updateMessage(id: ID!, content: String!): Message
        deleteMessage(id: ID!): Message
        addToConversation(conversationId: ID!, userId: ID!, gameId: ID): Boolean
    }

    type Subscription {
        messageAdded(conversationId: ID!): MessageEdge
        messageDeleted(conversationId: ID!): MessageEdge
        messageUpdated(conversationId: ID!): MessageEdge
    }
`;

module.exports = typeDef;