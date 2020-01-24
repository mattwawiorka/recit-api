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
        role: Int
    }
    
    type PageInfo {
        endCursor: String
        hasNextPage: Boolean
    }

    type GameFeed {
        totalCount: Int
        activeCount: Int
        edges: [Edge]
        pageInfo: PageInfo
    }

    type Player {
        userId: ID!
        name: String
        role: Int
        profilePic: String
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
        description: String
        image: String
        public: Boolean
    }

    type Query {
        games(cursor: String, sport: String, startDate: String, openSpots: String, bounds: [Float], sortOrder: String): GameFeed
        game(id: ID!): Game!
        players(gameId: ID!): [Player]
        host(gameId: ID!): Player
        userGames(user: ID, cursor: String, pastGames: Boolean): GameFeed
    }

    type Mutation {
        createGame(gameInput: gameInput): Game
        joinGame(gameId: ID!, conversationId: ID!): Player
        interestGame(gameId: ID!, conversationId: ID!): Boolean
        leaveGame(gameId: ID!, conversationId: ID!): Player
        updateGame(id: ID!, gameInput: gameInput): Game
        deleteGame(gameId: ID!): Boolean
    }

    type Subscription {
        gameAdded(cursor: String, numGames: Int, bounds: [Float]): Edge
        gameDeleted(loadedGames: [ID]): ID
        playerJoined(gameId: ID!): Player
        playerLeft(gameId: ID!): Player
        notificationGame(userId: ID): Boolean
    }
`;

module.exports = typeDef;