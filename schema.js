const Game = require('./types/game').typeDef;
const User = require('./types/user').typeDef;

const schema = `
    ${Game}
    ${User}

    type RootQuery {
        users: [User!]!
        user(id: ID!): User! 
        games: [Game!]!
        game(id: ID!): Game!
    }

    type RootMutation {
        createUser(userInput: userInput): User!
        updateUser(id: ID!, userInput: userInput): User
        deleteUser(id: ID!): Boolean
        createGame(gameInput: gameInput): Game
        joinGame(gameId: ID!): Boolean
        interestGame(gameId: ID!): Boolean
        leaveGame(gameId: ID!): Boolean
        updateGame(id: ID!, gameInput: gameInput): Game
        deleteGame(id: ID!): Boolean
    }

    schema {
        query: RootQuery
        mutation: RootMutation
    }
`;

module.exports = schema;