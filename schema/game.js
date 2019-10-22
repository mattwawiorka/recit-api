// Game CRUD
const typeDef = `
    type Game {
        id: ID!
        title: String!
        dateTime: String!
        venue: String!
        address: String!
        sport: String!
        description: String!
        playersRsvp: [User]
        playersInterest: [User]
        image: String
        public: Boolean!
        host: User
    }

    input gameInput {
        title: String!
        dateTime: String!
        venue: String!
        address: String!
        sport: String!
        description: String!
        image: String
        public: Boolean!
    }

    type Query {
        games: [Game!]!
        game(id: ID!): Game!
    }

    type Mutation {
        createGame(gameInput: gameInput): Game
        joinGame(gameId: ID!): Boolean
        interestGame(gameId: ID!): Boolean
        leaveGame(gameId: ID!): Boolean
        updateGame(id: ID!, gameInput: gameInput): Game
        deleteGame(id: ID!): Boolean
    }
`;

module.exports = typeDef;