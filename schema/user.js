// User CRUD

const typeDef = `
    type User {
        id: ID!
        name: String
        number: String
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

    type UserEdge {
        node: User
        isMe: Boolean
        cursor: Float
    } 

    type UserFeed {
        totalCount: Int
        edges: [UserEdge]
        pageInfo: PageInfo
    }

    type Query {
        users(cursor: Int): [User!]!
        user(userId: ID!): UserEdge!
        findUser(name: String!, location: [Float], cursor: String): UserFeed
        whoAmI: User
        topSport(userId: ID): String
    }

    type Mutation {
        createUserFb(userInput: userInput): Boolean
        createUserPhone(phoneNumber: String!): Boolean
        loginPhone(phoneNumber: String!): Boolean
        verifyUserPhone(userInput: userInput): String
        loginFb(userInput: userInput): String
        updateUser(userId: ID!, userInput: userInput): User
        deleteUser(userId: ID!): Boolean
        createTestUser(name: String, location: [Float]): Boolean
        loginTestUser(name: String): String
    }
`;

module.exports = typeDef;