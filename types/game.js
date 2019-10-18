// Game
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
`;

exports.typeDef = typeDef;