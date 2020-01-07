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
    }

    type Point {
        type: String
        coordinates: [Float]
    }

    type Edge {
        cursor: String
        distance: Float
        node: Game
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

    type Player {
        id: ID!
        name: String
        role: Int
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
        games(cursor: String, sport: String, startDate: String, openSpots: String, userId: ID, currentLoc: [Float], bounds: [Float], sortOrder: String): GameFeed
        game(id: ID!): Game!
        players(gameId: ID!): [Player]
        host(gameId: ID!): ID
    }

    type Mutation {
        createGame(gameInput: gameInput): Game
        joinGame(gameId: ID!): Player
        interestGame(gameId: ID!): Boolean
        leaveGame(gameId: ID!): Player
        updateGame(id: ID!, gameInput: gameInput): Game
        deleteGame(gameId: ID!): Boolean
    }

    type Subscription {
        gameAdded(cursor: String, numGames: Int, bounds: [Float]): Edge
        gameDeleted(loadedGames: [ID]): ID
    }
`;

module.exports = typeDef;