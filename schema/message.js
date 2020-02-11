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
        reply: Boolean
    }

    type MessageEdge {
        cursor: String
        isOwner: Boolean
        node: Message
        conversation: String
        forGame: Boolean
        isNew: Boolean
        userPic: String
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
        reply: Boolean
    }

    type Query {
        messages(conversationId: ID, cursor: String): MessageFeed
        inbox(cursor: String): MessageFeed
        notifications: Int
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
        notificationMessage(userId: ID): Boolean
    }
`;

module.exports = typeDef;