// User CRUD

const typeDef = `
    type User {
        id: ID!
        name: String!
        facebookId: String
        phoneNumber: String
        dob: String
        gender: String
        status: String
        profilePic: String
        pic1: String
        pic2: String
        pic3: String
        loginLocation: Point
        city: String
        createdAt: String
        updatedAt: String
    }

    input userInput {
        facebookId: String
        facebookToken: String
        name: String
        phoneNumber: String
        dob: String
        gender: String
        status: String
        profilePic: String
        pic1: String
        pic2: String
        pic3: String
        loginLocation: [Float]
        city: String
    }

    type Query {
        users: [User!]!
        user(userId: ID!): User!
        findUser(name: String!, location: [Float]): [User]
    }

    type Mutation {
        createUserFb(userInput: userInput): User
        updateUser(userId: ID!, userInput: userInput): User
        deleteUser(userId: ID!): Boolean
        loginFb(userInput: userInput): String
    }
`;

module.exports = typeDef;