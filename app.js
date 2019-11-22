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
const GamePlayer = require('./models/game-player');
const Comment = require('./models/comment');

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


User.belongsToMany(Game, { through: GamePlayer });
Game.belongsToMany(User, { constraints: true, through: GamePlayer , onDelete: 'CASCADE' });
Comment.belongsTo(User, { constraints: true, onDelete: 'CASCADE' });
Comment.belongsTo(Game, { constraints: true, onDelete: 'CASCADE' });

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