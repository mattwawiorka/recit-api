// Message CRUD

const typeDef = `
    type Message {
        id: ID!
        author: String
        userId: ID
        conversationId: ID
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
        conversationId: ID
        content: String!
    }

    type Query {
        messages(conversationId: ID, cursor: String): MessageFeed
    }

    type Mutation {
        createMessage(messageInput: messageInput): Message
        updateMessage(id: ID!, content: String!): Message
        deleteMessage(id: ID!): Message
        addToConversation(conversationId: ID!, userId: ID!): Message
    }

    type Subscription {
        messageAdded(conversationId: ID!): MessageEdge
        messageDeleted(conversationId: ID!): MessageEdge
        messageUpdated(conversationId: ID!): MessageEdge
    }
`;

module.exports = typeDef;