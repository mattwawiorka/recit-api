// User CRUD
const typeDef = `
    type User {
        id: ID!
        name: String!
        phoneNumber: String
        password: String
        age: Int
        gender: String
        status: String
    }

    type AuthData {
        token: String!
        userId: String!
    }

    input userInput {
        name: String!
        phoneNumber: String
        password: String!
        age: Int!
        gender: String!
        status: String
    }

    type Query {
        users: [User!]!
        user(id: ID!): User!
        login(name: String!, password: String!): AuthData 
    }

    type Mutation {
        createUser(userInput: userInput): User!
        updateUser(id: ID!, userInput: userInput): User
        deleteUser(id: ID!): Boolean
    }
`;

module.exports = typeDef;