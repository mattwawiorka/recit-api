// User CRUD

const typeDef = `
    type User {
        id: ID!
        name: String
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
        phoneCode: Int
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
        createUserFb(userInput: userInput): Boolean
        createUserPhone(phoneNumber: String!): Boolean
        loginPhone(phoneNumber: String!): User
        verifyUserPhone(userInput: userInput): String
        loginFb(userInput: userInput): String
        updateUser(userId: ID!, userInput: userInput): User
        deleteUser(userId: ID!): Boolean
    }
`;

module.exports = typeDef;