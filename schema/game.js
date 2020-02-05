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
        role: Int
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

    interface Participant {
        userId: ID
        name: String
        profilePic: String
        isMe: Boolean
    }

    type Player implements Participant {
        userId: ID
        name: String
        profilePic: String
        isMe: Boolean
        role: Int!
    }

    type Watcher implements Participant {
        userId: ID
        name: String
        profilePic: String
        isMe: Boolean
        level: Int!
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
        players(gameId: ID!): [Player]
        participants(conversationId: ID!): [Watcher]
        host(gameId: ID!): Player
        userGames(userId: ID, cursor: String, pastGames: Boolean): GameFeed
        topSport(userId: ID): String
    }

    type Mutation {
        createGame(gameInput: gameInput): Game
        joinGame(gameId: ID!, conversationId: ID!): Player
        subscribe(conversationId: ID!): Boolean
        unsubscribe(conversationId: ID!): Boolean
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