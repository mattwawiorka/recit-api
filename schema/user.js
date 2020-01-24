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
        createdAt: String
        loginLocation: [Float]
        profilePic: String
    }

    type AuthData {
        token: String!
        userId: String!
    }

    input userInput {
        name: String
        phoneNumber: String
        password: String
        age: Int
        gender: String
        status: String
        profilePic: String
    }

    type Query {
        users: [User!]!
        user(id: ID!): User!
        findUser(name: String!, location: [Float]): [User]
    }

    type Mutation {
        createUser(userInput: userInput): User
        updateUser(id: ID!, userInput: userInput): User
        deleteUser(id: ID!): Boolean
        login(name: String!, password: String!, location: [Float]): AuthData
    }
`;

module.exports = typeDef;