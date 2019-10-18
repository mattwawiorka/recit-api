// User
const typeDef = `
    type User {
        id: ID!
        name: String!
        phoneNumber: String
        password: String!
        age: Int!
        gender: String!
        status: String
    }

    input userInput {
        name: String!
        phoneNumber: String
        password: String!
        age: Int!
        gender: String!
        status: String
    }
`;

exports.typeDef = typeDef;