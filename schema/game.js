// Game CRUD

const typeDef = `
    type Game {
        id: ID!
        title: String!
        dateTime: String
        endDateTime: String
        venue: String
        address: String
        location: Point
        sport: String
        spots: Int
        spotsReserved: Int
        players: Int
        description: String
        playersRsvp: [User]
        playersInterest: [User]
        image: String
        public: Boolean
        conversationId: ID
    }

    type Point {
        type: String
        coordinates: [Float]
    }

    type Edge {
        cursor: String
        node: Game
        level: Int
    }
    
    type PageInfo {
        endCursor: String
        hasNextPage: Boolean
    }

    type GameFeed {
        totalCount: Int
        edges: [Edge]
        pageInfo: PageInfo
    }

    type Participant {
        userId: ID
        name: String
        profilePic: String
        isMe: Boolean
        level: Int!
        invited: Boolean
        player: Boolean
        wasInterested: Boolean
        number: Int
    }

    input gameInput {
        title: String
        dateTime: String
        endDateTime: String
        venue: String
        address: String
        coords: [Float]
        sport: String
        spots: Int
        spotsReserved: Int
        description: String
        image: String
        public: Boolean
    }

    type Query {
        games(cursor: String, sport: String, startDate: String, openSpots: String, bounds: [Float], sortOrder: String): GameFeed
        game(id: ID!): Game!
        players(gameId: ID!): [Participant]
        watchers(conversationId: ID!): [Participant]
        host(gameId: ID!): Participant
        userGames(userId: ID, cursor: String, pastGames: Boolean): GameFeed
    }

    type Mutation {
        createGame(gameInput: gameInput): Game
        joinGame(gameId: ID!, conversationId: ID!): Participant
        subscribe(gameId: ID!, conversationId: ID!): Participant
        unsubscribe(gameId: ID!, conversationId: ID!): Participant
        leaveGame(gameId: ID!, conversationId: ID!): Participant
        updateGame(id: ID!, gameInput: gameInput): Game
        deleteGame(gameId: ID!): Boolean
    }

    type Subscription {
        gameAdded(cursor: String, numGames: Int, bounds: [Float]): Edge
        gameDeleted(loadedGames: [ID]): ID
        participantJoined(gameId: ID!): Participant
        participantLeft(gameId: ID!): Participant
        notificationGame(userId: ID): Boolean
    }
`;

module.exports = typeDef;