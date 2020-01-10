const express = require('express');
const { createServer } = require('http');
const { execute, subscribe } = require('graphql');
const { fileLoader, mergeTypes, mergeResolvers } = require('merge-graphql-schemas');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const bodyParser = require('body-parser');
const path = require('path');
const { makeExecutableSchema } = require('graphql-tools');
const { gql } = require('apollo-server');
const graphqlHTTP = require('express-graphql');

const auth = require('./middleware/auth');

const sequelize = require('./util/db');
const Game = require('./models/game');
const User = require('./models/user');
const Player = require('./models/player');
const Message = require('./models/message');
const Conversation = require('./models/conversation');
const Participant = require('./models/participant');

const typeDefs = gql(mergeTypes(fileLoader(path.join(__dirname, './schema'))));
const resolvers = mergeResolvers(fileLoader(path.join(__dirname, './resolvers')));

const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});

const app = express();

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'OPTIONS, GET, POST, PUT, PATCH, DELETE'
    );
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
});

// Set authorization context before performing resolver commands 
app.use(auth);

app.use(
  '/graphql',
  bodyParser.json(),
  graphqlHTTP(req => {
    return {
      schema: schema,
      graphiql: true,
      context: {
        user: req.userId,
        userName: req.userName,
        isAuth: req.isAuth
      },
      customFormatErrorFn: error => ({
        message: error.message || 'An error occurred.',
        code: error.originalError.code || 500,
        data: error.originalError.data
      })
    } 
  }),
);

User.belongsToMany(Game, { through: Player });
User.belongsToMany(Conversation, { through: Participant });
Game.belongsToMany(User, { through: Player, constraints: true, onDelete: 'CASCADE' });
Message.belongsTo(User, { constraints: true });
Message.belongsTo(Conversation, { constraints: true, onDelete: 'CASCADE' });
Conversation.hasOne(Game, { onDelete: 'CASCADE' });
Conversation.belongsToMany(User, { through: Participant, constraints: true, onDelete: 'CASCADE' });

const server = createServer(app);

sequelize
  // .sync({ force: true })
  .sync()
  .then( () => {
    server.listen(8080, () => {
      console.log('Server online!')
      new SubscriptionServer (
        {
          execute,
          subscribe,
          schema
        },
        {
          server,
          path: '/subscriptions'
        }
      );
    })
  })
  .catch(err => {
    console.log(err);
  });